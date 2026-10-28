import assert from "node:assert/strict";
import {createServer} from "node:http";
import {readFile,writeFile,mkdir} from "node:fs/promises";
import {existsSync,mkdtempSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join,resolve,extname} from "node:path";
import {spawn,execFileSync} from "node:child_process";
import {setTimeout as sleep} from "node:timers/promises";

const root=resolve(".");

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
let profile=mkdtempSync(join(tmpdir(),"pictau-chrome-"));
const profiles=[profile];
const screenshots=resolve("artifacts/vitrine");
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
  const response=await command("Runtime.evaluate",{expression:code,returnByValue:true,awaitPromise:true});
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
  let endpoint;
  for(let launch=0;launch<3&&!endpoint;launch++){
    if(launch){profile=mkdtempSync(join(tmpdir(),"pictau-chrome-retry-"));profiles.push(profile);}
    chromeErrors="";
    chrome=spawn(chromeBinary(),["--headless=new","--no-sandbox","--disable-setuid-sandbox","--disable-dev-shm-usage","--disable-gpu","--disable-background-networking","--disable-extensions","--no-first-run","--no-default-browser-check","--user-data-dir="+profile,"--remote-debugging-port=0","about:blank"],{stdio:["ignore","ignore","pipe"],env:{...process.env,DBUS_SESSION_BUS_ADDRESS:""}});
    chrome.stderr.on("data",chunk=>{chromeErrors+=String(chunk).slice(-2500);});
    chrome.on("error",err=>{chromeErrors+="\n"+String(err);});
    for(let attempt=0;attempt<180;attempt++){
      try{
        const portFile=await readFile(join(profile,"DevToolsActivePort"),"utf8");
        const devtoolsPort=Number(portFile.split("\n")[0]);
        if(Number.isInteger(devtoolsPort)&&devtoolsPort>0){
          const pages=await (await fetch("http://127.0.0.1:"+devtoolsPort+"/json/list",{signal:AbortSignal.timeout(1400)})).json();
          endpoint=pages.find(p=>p.type==="page")?.webSocketDebuggerUrl;
        }
        if(endpoint)break;
      }catch{}
      if(chrome.exitCode!==null)break;
      await sleep(100);
    }
    if(!endpoint){
      if(chrome.exitCode===null){
        const exiting=new Promise(resolve=>chrome.once("exit",resolve));
        chrome.kill("SIGKILL");
        await Promise.race([exiting,sleep(1500)]);
      }
      console.warn("Chrome launch attempt "+(launch+1)+" failed; retrying.");
    }
  }
  if(!endpoint)throw new Error("Chrome remote debugging unavailable after 3 launches; exit="+chrome?.exitCode+"; stderr="+chromeErrors.slice(-1600));
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

  const sizes=[[320,568],[360,640],[390,844],[412,915],[768,1024],
    [1024,768],[1280,720],[1366,768],[1440,900],[1920,1080]];
  for(const [width,height] of sizes){
    const mobile=width<=680;
    await command("Emulation.setDeviceMetricsOverride",{width,height,mobile,deviceScaleFactor:1});
    await command("Page.navigate",{url:base+"/index.html"});
    await waitFor("return document.readyState==='complete' && !!document.querySelector('.hero-title')");
    for(const lang of ["fr","en"]){
      await evaluate("document.querySelector('[data-lang="+lang+"]').click();return true;");
      await waitFor("return document.documentElement.lang==='"+lang+"'");
      const state=await evaluate("\nconst selectors=[\".header\",\".login-link\",\".hero\",\".hero-title\",\".intro\",\".benefits\",\".plan\",\".signup-button\",\".site-footer\"];\nconst bounds={};\nfor(const key of selectors){\n const node=document.querySelector(key),r=node.getBoundingClientRect();\n bounds[key]={left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,height:r.height,\n visible:getComputedStyle(node).display!==\"none\"&&getComputedStyle(node).visibility!==\"hidden\"};\n}\nconst textRange=document.createRange();\ntextRange.selectNodeContents(document.querySelector(\".hero-title\"));\nconst titleText=textRange.getBoundingClientRect();\nreturn {\n width:innerWidth,height:innerHeight,scrollW:document.documentElement.scrollWidth,\n scrollH:document.documentElement.scrollHeight,language:document.documentElement.lang,\n bounds,plans:document.querySelectorAll(\".plan\").length,\n primary:document.querySelectorAll(\".signup-button\").length,\n disabled:document.querySelector(\".signup-button\").disabled,\n price:document.querySelector(\".price\").textContent,\n login:document.querySelector(\".login-link\").textContent.trim(),\n legal:document.querySelectorAll(\".site-footer a\").length,\n laptop:getComputedStyle(document.querySelector(\".hero-visual\")).display,\n phone:getComputedStyle(document.querySelector(\".phone\")).display,\n deviceCount:document.querySelectorAll(\".laptop,.phone\").length,\n titleText:{top:titleText.top,bottom:titleText.bottom}\n};");
            const tag=lang+" "+width+"x"+height;
      assert.equal(state.plans,1,tag+" single plan");
      assert.equal(state.primary,1,tag+" single CTA");
      assert.equal(state.disabled,true,tag+" checkout not open");
      assert.equal(state.legal,3,tag+" legal links");
      assert.equal(state.login,lang==="fr"?"Connexion":"Sign in",tag+" accessible sign in");
      assert.match(state.price,lang==="fr"?/Tarif à confirmer/:/Pricing to be confirmed/,tag+" no fake price");
      assert.ok(state.scrollW<=width+2,tag+" horizontal scrolling: "+JSON.stringify(state));
      assert.ok(state.scrollH<=height+2,tag+" vertical scrolling: "+JSON.stringify(state));
      assert.ok(state.titleText.top>=state.bounds[".hero"].top-2&&state.titleText.bottom<=state.bounds[".hero"].bottom+2,
        tag+" title ink clipped by hero: "+JSON.stringify(state));
      for(const [sel,b] of Object.entries(state.bounds)){
        assert.equal(b.visible,true,tag+" "+sel+" visible");
        assert.ok(b.width>0&&b.height>0,tag+" "+sel+" dimensions");
        assert.ok(b.left>=-2&&b.right<=width+2,tag+" "+sel+" horizontal viewport: "+JSON.stringify(b));
        assert.ok(b.top>=-2&&b.bottom<=height+2,tag+" "+sel+" vertical viewport: "+JSON.stringify(b));
      }
      const overlap=(a,b)=>Math.min(a.right,b.right)-Math.max(a.left,b.left)>2 &&
        Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top)>2;
      assert.equal(overlap(state.bounds[".hero"],state.bounds[".benefits"]),false,tag+" hero/benefits");
      assert.equal(overlap(state.bounds[".hero"],state.bounds[".plan"]),false,tag+" hero/plan");
      assert.equal(overlap(state.bounds[".benefits"],state.bounds[".plan"]),false,tag+" benefits/plan");
      assert.equal(state.deviceCount,2,tag+" both original devices exist");
      if(mobile){
        assert.equal(state.laptop,"none",tag+" decorative devices hidden on phone");
        assert.equal(state.phone,"none",tag+" phone visual hidden so the offer remains readable");
      }else{
        assert.notEqual(state.laptop,"none",tag+" laptop visible on desktop/tablet");
        assert.notEqual(state.phone,"none",tag+" phone visible on desktop/tablet");
      }
      const shot=await command("Page.captureScreenshot",{format:"png",captureBeyondViewport:false,fromSurface:true});
      await writeFile(join(screenshots,lang+"-"+width+"x"+height+".png"),Buffer.from(shot.data,"base64"));
      console.log("PASS "+tag+" without overflow, all content visible");
    }
  }
  await command("Emulation.setDeviceMetricsOverride",{width:390,height:640,mobile:true,deviceScaleFactor:1});
  await command("Page.navigate",{url:base+"/index.html"});
  await waitFor("return document.readyState==='complete' && !!document.querySelector('.plan')");
  const zoom=await evaluate("document.body.style.zoom='1.85';return {overflow:getComputedStyle(document.documentElement).overflowY,scroll:document.documentElement.scrollHeight,height:innerHeight,button:!!document.querySelector('.signup-button')};");
  assert.equal(zoom.overflow,"auto","Zoom: scrolling remains possible");
  assert.equal(zoom.button,true,"Zoom: CTA retained");
  assert.ok(zoom.scroll>zoom.height,"Zoom: content may expand instead of being clipped");
  await evaluate("document.body.style.zoom='';return true;");
  for(const name of ["connexion","contact","conditions","confidentialite"]){
    await command("Page.navigate",{url:base+"/"+name+".html"});
    await waitFor("return document.readyState==='complete' && !!document.querySelector('.info-surface')");
    const info=await evaluate("return {back:!!document.querySelector('a[href=\"./index.html\"]'),form:!!document.querySelector('form input')};");
    assert.equal(info.back,true,name+" back link");
    assert.equal(info.form,false,name+" no fake sign up or payment");
  }
  console.log("Vitrine: 10 viewports x FR/EN, zoom and information pages validated.");
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
  for(const dir of profiles){
    try{rmSync(dir,{recursive:true,force:true,maxRetries:8,retryDelay:120});}
    catch(error){console.warn("Nettoyage du profil Chrome différé :",error.message);}
  }
}
