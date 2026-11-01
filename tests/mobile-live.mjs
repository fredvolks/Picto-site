// Vérifie la vraie URL GitHub Pages dans Chromium émulé (pas un appareil physique).
import assert from "node:assert/strict";
import {spawn,execFileSync} from "node:child_process";
import {readFile,mkdir,writeFile,mkdtemp,rm} from "node:fs/promises";
import {join} from "node:path";
import {tmpdir} from "node:os";
import {setTimeout as sleep} from "node:timers/promises";

const base="https://fredvolks.github.io/Picto-site/";
const sizes=[[320,568],[360,640],[375,667],[390,740],[390,844],[430,932],[768,1024]];
const directory="artifacts/mobile-live";
const report={url:base,method:"Site GitHub Pages réel dans Chromium émulé, pas un téléphone physique",sizes:[],date:new Date().toISOString()};
const failures=[];
let chrome,socket,seq=0;
const waiting=new Map();
const profile=await mkdtemp(join(tmpdir(),"pictau-live-"));
function chromeBinary(){
 for(const n of ["google-chrome","chromium","chromium-browser"]){
  try{return execFileSync("which",[n],{encoding:"utf8"}).trim();}catch{}
 }
 throw Error("Navigateur Chromium indisponible");
}
function command(method,params={}){
 return new Promise((ok,fail)=>{
  const id=++seq;
  const timer=setTimeout(()=>{waiting.delete(id);fail(Error("CDP timeout "+method));},20000);
  waiting.set(id,{ok:value=>{clearTimeout(timer);ok(value);},fail:err=>{clearTimeout(timer);fail(err);}});
  socket.send(JSON.stringify({id,method,params}));
 });
}
async function evaluate(code){
 const result=await command("Runtime.evaluate",{expression:"(async()=>{"+code+"})()",returnByValue:true,awaitPromise:true});
 if(result.exceptionDetails)throw Error("Erreur du navigateur : "+JSON.stringify(result.exceptionDetails).slice(0,500));
 return result.result?.value;
}
async function waitFor(code){
 for(let i=0;i<100;i++){
  try{if(await evaluate("return "+code))return;}catch{}
  await sleep(130);
 }
 throw Error("Impossible de charger la page distante : "+code);
}
function check(value,message){if(!value)failures.push(message);}
await mkdir(directory,{recursive:true});
try{
 const response=await fetch(base+"forfait.html",{signal:AbortSignal.timeout(20000),headers:{"Cache-Control":"no-cache"}});
 assert.equal(response.status,200,"La page distante ne répond pas HTTP 200");
 const html=await response.text();
 assert.match(html,/data-pictau-signup-design="5"/,"Le Design 5 ne se trouve pas sur le site réel");
 report.httpStatus=response.status;
 chrome=spawn(chromeBinary(),["--headless=new","--no-sandbox","--disable-dev-shm-usage","--disable-background-networking",
  "--disable-extensions","--no-first-run","--user-data-dir="+profile,"--remote-debugging-port=0","about:blank"],
  {stdio:["ignore","ignore","pipe"],env:{...process.env,DBUS_SESSION_BUS_ADDRESS:""}});
 let endpoint;
 for(let i=0;i<180&&!endpoint;i++){
  try{
   const port=(await readFile(join(profile,"DevToolsActivePort"),"utf8")).split("\n")[0];
   const list=await (await fetch("http://127.0.0.1:"+port+"/json/list")).json();
   endpoint=list.find(item=>item.type==="page")?.webSocketDebuggerUrl;
  }catch{}
  if(chrome.exitCode!==null)break;
  await sleep(100);
 }
 if(!endpoint)throw Error("Chromium n'a pas démarré");
 socket=new WebSocket(endpoint);
 await new Promise((ok,no)=>{socket.addEventListener("open",ok,{once:true});socket.addEventListener("error",no,{once:true});});
 socket.addEventListener("message",event=>{
  const msg=JSON.parse(event.data),task=waiting.get(msg.id);
  if(!task)return;
  waiting.delete(msg.id);
  msg.error?task.fail(Error(JSON.stringify(msg.error))):task.ok(msg.result||{});
 });
 await command("Page.enable");await command("Runtime.enable");
 for(const [width,height] of sizes){
  await command("Emulation.setDeviceMetricsOverride",{width,height,mobile:width<=430,deviceScaleFactor:1});
  await command("Page.navigate",{url:base+"forfait.html?mobile-validation="+Date.now()+"-"+width});
  await waitFor("document.readyState==='complete' && !!document.querySelector('#signup-form')");
  await evaluate("await document.fonts.ready;return true;");
  const result=await evaluate('const nodes=[".signup-header",".signup-intro",".signup-tiles",".signup-plan","#signup-name","#signup-email","#signup-password","#signup-consent",".signup-action",".signup-status"];const bounds=Object.fromEntries(nodes.map(name=>{const r=document.querySelector(name).getBoundingClientRect();return [name,{top:r.top,bottom:r.bottom,left:r.left,right:r.right,height:r.height}]}));return {url:location.href,docW:document.documentElement.scrollWidth,docH:document.documentElement.scrollHeight,w:innerWidth,h:innerHeight,bounds,design:document.body.dataset.pictauSignupDesign,price:document.querySelector(".signup-plan-price strong").textContent.trim(),art:document.querySelectorAll(".signup-tiles .picto-art svg").length,consent:document.querySelector("#signup-consent").checked,terms:document.querySelector("#signup-consent-terms").getAttribute("href"),privacy:document.querySelector("#signup-consent-privacy").getAttribute("href"),overflow:getComputedStyle(document.documentElement).overflowY};');
  report.sizes.push({size:width+"x"+height,...result});
  // Capture AVANT les assertions : preuve disponible même quand le test est rouge.
  const shot=(await command("Page.captureScreenshot",{format:"png",captureBeyondViewport:false})).data;
  await writeFile(join(directory,"forfait-"+width+"x"+height+".png"),Buffer.from(shot,"base64"));
  const id=width+"x"+height;
  check(result.design==="5"&&result.art===3,id+" : mauvaise version ou pictogrammes absents");
  check(result.price==="9,99 $"&&!result.consent,id+" : prix ou consentement incorrect");
  check(result.terms==="./conditions.html"&&result.privacy==="./confidentialite.html",id+" : liens légaux absents");
  check(result.docW<=result.w+1,id+" : débordement horizontal "+result.docW);
  check(result.overflow!=="hidden",id+" : scroll interdit");
  for(const [selector,r] of Object.entries(result.bounds)){
   check(r.left>=-1&&r.right<=result.w+1,id+" : "+selector+" déborde en largeur");
   if(width<=430)check(r.top>=-1&&r.bottom<=result.h+1,id+" : "+selector+" est caché verticalement");
  }
  if(width<=430)check(result.docH<=result.h+1,id+" : scroll vertical "+result.docH+"/"+result.h);
  await evaluate('document.querySelector("[data-lang=en]").click();return true;');
  const english=await evaluate('return {lang:document.documentElement.lang,labels:[...document.querySelectorAll(".picto-label")].map(el=>el.textContent.trim()),cta:document.querySelector(".signup-action").textContent.trim()};');
  check(english.lang==="en"&&english.labels.join("|")==="Find|Personalize|Print"&&english.cta.includes("Continue"),id+" : traduction EN incorrecte");
  if(width===390&&height===740){
   await evaluate('document.body.style.zoom="2";return true;');
   const zoom=await evaluate('return {scrollHeight:document.documentElement.scrollHeight,height:innerHeight,overflow:getComputedStyle(document.documentElement).overflowY};');
   check(zoom.scrollHeight>zoom.height&&zoom.overflow!=="hidden","Zoom x2 : défilement impossible");
   await evaluate('document.body.style.zoom="";return true;');
   await command("Emulation.setDeviceMetricsOverride",{width,height:350,mobile:true,deviceScaleFactor:1});
   const keyboard=await evaluate('window.scrollTo(0,document.documentElement.scrollHeight);return {scrollY,height:document.documentElement.scrollHeight,vh:innerHeight};');
   check(keyboard.height>keyboard.vh&&keyboard.scrollY>0,"Clavier simulé : bas de page inaccessible");
  }
  console.log("SITE RÉEL",id,"page="+result.docW+"x"+result.docH,"viewport="+result.w+"x"+result.h);
 }
 report.failures=failures;
 if(failures.length)throw Error("ÉCHECS MOBILES SUR LE SITE RÉEL :\n"+failures.join("\n"));
 console.log("Validation du site hébergé OK : 7 formats, FR/EN, zoom et clavier simulé.");
}catch(error){
 report.error=String(error?.message||error);
 throw error;
}finally{
 await writeFile(join(directory,"rapport.json"),JSON.stringify(report,null,2));
 if(socket)socket.close();
 if(chrome&&chrome.exitCode===null){chrome.kill("SIGKILL");await sleep(200);}
 await rm(profile,{recursive:true,force:true,maxRetries:5,retryDelay:80});
}
