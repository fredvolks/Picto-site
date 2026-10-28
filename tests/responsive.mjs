import assert from "node:assert/strict";
import {createServer} from "node:http";
import {readFile,writeFile,mkdir} from "node:fs/promises";
import {existsSync,mkdtempSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join,resolve,extname} from "node:path";
import {spawn,execFileSync} from "node:child_process";
import {setTimeout as sleep} from "node:timers/promises";

const root=resolve(".");
const isPublic=process.argv.includes("--public");
const mime={".html":"text/html",".js":"text/javascript",".css":"text/css",".svg":"image/svg+xml"};
const server=createServer(async(req,res)=>{
  try{
    const pathname=decodeURIComponent((req.url||"/").split("?")[0]);
    const file=resolve(root,"."+pathname,(pathname==="/")?"index.html":"");
    if(!file.startsWith(root+"/")){res.writeHead(403);res.end();return;}
    const body=await readFile(file);
    res.writeHead(200,{"Content-Type":mime[extname(file)]||"application/octet-stream"});
    res.end(body);
  }catch{res.writeHead(404);res.end("Not found");}
});
await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
const port=server.address().port;
const base="http://127.0.0.1:"+port;
let chrome;
let socket;
let serial=0;
const pending=new Map();
const profile=mkdtempSync(join(tmpdir(),"pictau-chrome-"));
const screenshots=resolve("artifacts/site-ux");
let chromeErrors="";
function chromeBinary(){
  if(process.env.CHROME_BIN)return process.env.CHROME_BIN;
  for(const cmd of ["google-chrome","chromium","chromium-browser"]){
    try{return execFileSync("which",[cmd],{encoding:"utf8"}).trim();}catch{}
  }
  throw new Error("No Chrome/Chromium binary available");
}
async function command(method,params={}){
  return new Promise((resolve,reject)=>{
    const id=++serial;
    const timer=setTimeout(()=>{pending.delete(id);reject(new Error("CDP timeout: "+method));},9000);
    pending.set(id,{resolve:r=>{clearTimeout(timer);resolve(r);},reject:e=>{clearTimeout(timer);reject(e);}});
    socket.send(JSON.stringify({id,method,params}));
  });
}
async function evaluate(body){
  const code="(()=>{"+body+"})()";
  const response=await command("Runtime.evaluate",{expression:code,returnByValue:true});
  if(response.exceptionDetails)throw new Error("Browser JS error: "+JSON.stringify(response.exceptionDetails));
  return response.result.value;
}
async function waitFor(predicate,timeout=9000){
  const began=Date.now();
  while(Date.now()-began<timeout){
    try{if(await evaluate(predicate))return;}catch{}
    await sleep(150);
  }
  throw new Error("UI did not load: "+predicate);
}
try{
  chrome=spawn(chromeBinary(),["--headless=new","--no-sandbox","--disable-dev-shm-usage","--disable-gpu","--no-first-run","--no-default-browser-check","--user-data-dir="+profile,"--remote-debugging-port=0","about:blank"],{stdio:["ignore","ignore","pipe"]});
  chrome.stderr.on("data",chunk=>{chromeErrors += String(chunk).slice(-2500);});
  chrome.on("error",err=>{chromeErrors += "\n"+String(err);});
  let endpoint;
  for(let attempt=0;attempt<120;attempt++){
    try{
      const portFile=await readFile(join(profile,"DevToolsActivePort"),"utf8");
      const devtoolsPort=Number(portFile.split("\n")[0]);
      if(Number.isInteger(devtoolsPort)&&devtoolsPort>0){
        const pages=await (await fetch("http://127.0.0.1:"+devtoolsPort+"/json/list")).json();
        endpoint=pages.find(p=>p.type==="page")?.webSocketDebuggerUrl;
      }
      if(endpoint)break;
    }catch{}
    if(chrome.exitCode!==null)break;
    await sleep(100);
  }
  if(!endpoint)throw new Error("Chrome remote debugging unavailable; exit="+chrome.exitCode+"; stderr="+chromeErrors.slice(-1600));
  socket=new WebSocket(endpoint);
  await new Promise((resolve,reject)=>{
    socket.addEventListener("open",resolve,{once:true});
    socket.addEventListener("error",reject,{once:true});
  });
  socket.addEventListener("message",event=>{
    const msg=JSON.parse(event.data);
    const p=pending.get(msg.id);
    if(p){pending.delete(msg.id);if(msg.error)p.reject(new Error(JSON.stringify(msg.error)));else p.resolve(msg.result||{});}
  });
  await command("Page.enable");
  await command("Runtime.enable");
  await mkdir(screenshots,{recursive:true});
  for(const viewport of [{width:320,height:568,mobile:true},{width:360,height:640,mobile:true},{width:390,height:844,mobile:true},{width:768,height:1024,mobile:true},{width:1024,height:768,mobile:false},{width:1440,height:900,mobile:false}]){
    await command("Emulation.setDeviceMetricsOverride",{...viewport,deviceScaleFactor:1});
    await command("Page.navigate",{url:base});
    await waitFor("return !!document.querySelector('.home-site[data-view=home] .home-hero') && !!document.querySelector('.home-plan')");
    await sleep(250);
    for(const view of ["home","features","plan"]){
      const selector=(viewport.width<=820?".mobile-dock ":"")+'[data-view-link="'+view+'"]';
      await evaluate('const link=document.querySelector('+JSON.stringify(selector)+');if(!link)throw Error("No view link");link.click();return true;');
      const expr=[
        "const site=document.querySelector('.home-site');",
        "const box=el=>{if(!el)return null;const r=el.getBoundingClientRect();return {top:r.top,bottom:r.bottom,left:r.left,right:r.right,width:r.width,height:r.height}};",
        "const inside=el=>{const r=box(el);return !!r&&r.width>0&&r.height>0&&r.top>=-1&&r.left>=-1&&r.right<=innerWidth+1&&r.bottom<=innerHeight+1};",
        "const home=site.dataset.view==='home',features=site.dataset.view==='features',plan=site.dataset.view==='plan';",
        "const label=document.querySelector('.home-kicker>span:last-child'),range=document.createRange();range.selectNodeContents(label);const textRect=range.getBoundingClientRect();const labelBox=box(label);return {view:site.dataset.view,viewport:[innerWidth,innerHeight],scroll:[document.documentElement.scrollWidth,document.documentElement.scrollHeight],kicker:box(document.querySelector('.home-kicker')),kickerText:{top:textRect.top,bottom:textRect.bottom,left:textRect.left,right:textRect.right},kickerTextElement:labelBox,kickerComputed:{width:getComputedStyle(label).width,height:getComputedStyle(label).height},title:box(document.querySelector('.home-hero h1')),homeButtons:home?inside(document.querySelector('.home-hero-actions')):true,heroImage:home?inside(document.querySelector('.home-device')):true,featuresFirst:features?inside(document.querySelector('.home-feature-grid article:first-child')):true,featuresLast:features?inside(document.querySelector('.home-feature-grid article:last-child')):true,planCard:plan?inside(document.querySelector('.home-plan')):true,planStatus:plan?inside(document.querySelector('.home-plan-availability')):true};"
      ].join("\n");
      const metrics=await evaluate(expr);
      const shot=await command("Page.captureScreenshot",{format:"png",captureBeyondViewport:false,fromSurface:true});
      await writeFile(join(screenshots,"pictau-"+viewport.width+"x"+viewport.height+"-"+view+".png"),Buffer.from(shot.data,"base64"));
      assert.equal(metrics.view,view,"Onglet actif incorrect");
      assert.ok(metrics.scroll[0]<=viewport.width+1,"Débordement horizontal "+JSON.stringify(metrics));
      assert.ok(metrics.scroll[1]<=viewport.height+1,"Débordement vertical "+JSON.stringify(metrics));
      if(view==="home"){
        assert.ok(metrics.kickerTextElement.width>30,"Texte accroche dans une boîte microscopique "+JSON.stringify(metrics));
        assert.ok(metrics.kickerText.bottom<=metrics.kickerTextElement.bottom+2,"Le texte déborde de son propre conteneur "+JSON.stringify(metrics));
        assert.ok(metrics.kickerText.right<=metrics.kickerTextElement.right+2,"Le texte déborde horizontalement de son conteneur "+JSON.stringify(metrics));
        assert.ok(metrics.title.top>=metrics.kickerText.bottom+4,"Titre superposé aux vraies lettres de l'accroche "+JSON.stringify(metrics));
        assert.ok(metrics.title.top>=metrics.kicker.bottom+2,"Titre superposé à l'accroche "+JSON.stringify(metrics));
      }
      for(const key of ["homeButtons","heroImage","featuresFirst","featuresLast","planCard","planStatus"])
        assert.ok(metrics[key],"Élément coupé : "+key+" "+JSON.stringify(metrics));
      console.log("UX OK",viewport.width,viewport.height,view);
    }
  }
}catch(error){
  console.error(error);
  process.exitCode=1;
}finally{
  if(socket)socket.close();
  if(chrome){
    if(chrome.exitCode===null){
      chrome.kill("SIGKILL");
      await Promise.race([new Promise(resolve=>chrome.once("exit",resolve)),sleep(1500)]);
    }
  }
  server.close();
  try{rmSync(profile,{recursive:true,force:true,maxRetries:8,retryDelay:120});}
  catch(error){console.warn("Nettoyage du profil Chrome différé :",error.message);}
}
