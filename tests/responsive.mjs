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
  for(const viewport of [{width:320,height:568,mobile:true},{width:360,height:640,mobile:true},{width:390,height:844,mobile:true},{width:412,height:915,mobile:true},{width:768,height:1024,mobile:true},{width:1024,height:768,mobile:false},{width:1440,height:900,mobile:false}]){
    await command("Emulation.setDeviceMetricsOverride",{...viewport,deviceScaleFactor:1});
    await command("Page.navigate",{url:base});
    await waitFor("return !!document.querySelector('.site .hero') && !!document.querySelector('.benefits') && !!document.querySelector('.plan')");
    await sleep(500);
    for(const lang of ["fr","en"]){
      if(lang==="en")await evaluate("document.querySelector('[data-lang=en]').click();return true;");
      const expr=[
        "const box=(s)=>{const e=document.querySelector(s);if(!e)return null;const r=e.getBoundingClientRect();const st=getComputedStyle(e);return {x:r.left,y:r.top,right:r.right,bottom:r.bottom,w:r.width,h:r.height,scrollH:e.scrollHeight,clientH:e.clientHeight,display:st.display}};",
        "const label=document.querySelector('.kicker>span:last-child');const range=document.createRange();range.selectNodeContents(label);const tb=range.getBoundingClientRect();",
        "return {vw:innerWidth,vh:innerHeight,scrollW:document.documentElement.scrollWidth,scrollH:document.documentElement.scrollHeight,hero:box('.hero'),features:box('.benefits'),plan:box('.plan'),title:box('.hero-title'),kicker:box('.kicker'),kickerText:{bottom:tb.bottom,right:tb.right},intro:box('.intro'),cta:box('.hero-cta'),price:box('.price'),availability:box('.availability'),planFeatures:box('.plan-features'),lang:document.documentElement.lang};"
      ].join("\n");
      const metrics=await evaluate(expr);
      const shot=await command("Page.captureScreenshot",{format:"png",captureBeyondViewport:false,fromSurface:true});
      await writeFile(join(screenshots,"pictau-single-"+viewport.width+"x"+viewport.height+"-"+lang+".png"),Buffer.from(shot.data,"base64"));
      assert.equal(metrics.lang,lang,"Bilinguisme");
      assert.ok(metrics.scrollW<=viewport.width+1,"Débordement horizontal "+JSON.stringify(metrics));
      assert.ok(metrics.scrollH<=viewport.height+1,"Débordement vertical "+JSON.stringify(metrics));
      for(const part of ["hero","features","plan","title","cta","price","availability"]){
        const b=metrics[part];
        assert.ok(b&&b.w>0&&b.h>0&&b.y>=0&&b.bottom<=viewport.height+1&&b.x>=0&&b.right<=viewport.width+1,"Partie cachée: "+part+" "+JSON.stringify(metrics));
      }
      assert.ok(metrics.title.y>=metrics.kickerText.bottom+4,"L'accroche chevauche le titre "+JSON.stringify(metrics));
      assert.ok(metrics.intro.y>=metrics.title.bottom+2,"La description chevauche le titre "+JSON.stringify(metrics));
      assert.ok(metrics.cta.y>=metrics.intro.bottom+2,"Le CTA chevauche la description "+JSON.stringify(metrics));
      assert.ok(metrics.cta.bottom<=metrics.hero.bottom-2,"CTA coupé par le héros "+JSON.stringify(metrics));
      assert.ok(metrics.availability.bottom<=metrics.plan.bottom-2,"Inscription coupée "+JSON.stringify(metrics));
      if(metrics.planFeatures?.display!=="none")assert.ok(metrics.planFeatures.bottom<=metrics.plan.bottom-2,"Détails du forfait coupés "+JSON.stringify(metrics));
      console.log("UNIQUE VUE OK",viewport.width,viewport.height,lang);
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
