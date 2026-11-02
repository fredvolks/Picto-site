// Régression visuelle Banque: Chromium en émulation téléphone/tablette.
// La fixture charge le CSS réel, sans session privée ni données client.
import assert from "node:assert/strict";
import {readFile,mkdir,writeFile,mkdtemp,rm} from "node:fs/promises";
import {createServer} from "node:http";
import {spawn,execFileSync} from "node:child_process";
import {join} from "node:path";
import {tmpdir} from "node:os";
import {setTimeout as sleep} from "node:timers/promises";

const app=await readFile("app/src/app.js","utf8");
const css=await readFile("app/src/styles.css","utf8");
assert.match(app,/heading\.closest\("\.pa-bank-sheet"\)/,
  "Le scroll de la fiche vise le panneau, pas son titre caché sous l'en-tête");
assert.match(app,/privatePreview\.url\)\+'"/,
  "Aperçu principal depuis le PNG entier, non depuis le crop pour templates");
assert.match(css,/\.pa-bank-sheet-hero>img\[data-pa-bank-art\]/);
assert.match(css,/object-fit:contain;object-position:center center/);

const art='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 600">'+
 '<rect x="8" y="8" width="384" height="584" fill="white" stroke="black" stroke-width="12"/>'+
 '<circle cx="50" cy="50" r="25" fill="red"/><circle cx="350" cy="50" r="25" fill="blue"/>'+
 '<circle cx="50" cy="550" r="25" fill="green"/><circle cx="350" cy="550" r="25" fill="orange"/>'+
 '<path d="M100 220h200v40h-80v160h-50V260h-70z" fill="black"/></svg>';
const artSrc="data:image/svg+xml;charset=UTF-8,"+encodeURIComponent(art);
const fixture=`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1">
<link rel="stylesheet" href="/app/src/styles.css"></head>
<body><div class="admin-workspace"><div class="admin-topbar" style="height:75px;min-height:75px">☰ PICT-AU · Banque</div>
<main class="admin-main"><div class="pa-bank-shell"><div class="pa-bank-mode-nav"><button>Images</button><button>Ajouter</button><button>Thèmes</button></div>
<section class="admin-surface pa-bank-sheet"><header class="pa-bank-sheet-head"><button class="btn btn-light">← Retour</button>
<h2 tabindex="-1" id="pa-bank-inspector-title">Fermer un robinet</h2><button class="btn btn-primary pa-bank-head-save">Enregistrer</button></header>
<figure class="pa-bank-sheet-hero"><img data-pa-bank-art alt="Dessin complet" src="${artSrc}"></figure>
<nav class="pa-bank-sheet-tabs"><button>Nom</button><button>Ajuster</button><button>Classer</button></nav>
<section class="pa-bank-sheet-panel pa-bank-name-panel"><form class="pa-bank-names-form">
<label class="pa-bank-names-field">Nom dans la banque<input value="Fermer un robinet"></label>
<label class="pa-bank-names-field">Français<input value="Fermer un robinet — rempli transparent"></label>
<label class="pa-bank-names-field">Anglais<input value="Close a faucet"></label></form></section></section>
</div></main></div></body></html>`;
const server=createServer(async(req,res)=>{
 if(req.url==="/app/src/styles.css"){
  res.writeHead(200,{"Content-Type":"text/css"});res.end(css);return;
 }
 res.writeHead(200,{"Content-Type":"text/html"});res.end(fixture);
});
await new Promise(ok=>server.listen(0,"127.0.0.1",ok));
const port=server.address().port;
let chrome,socket;let serial=0;const pending=new Map();
let profile=await mkdtemp(join(tmpdir(),"pictau-hero-"));
const profiles=[profile];
let chromeErrors="";
function bin(){for(const b of ["google-chrome","chromium","chromium-browser"]){
 try{return execFileSync("which",[b],{encoding:"utf8"}).trim()}catch{}
}throw Error("Chromium introuvable")}
async function send(method,params={}){
 const id=++serial;
 return new Promise((ok,fail)=>{
  const timer=setTimeout(()=>{pending.delete(id);fail(Error("CDP timeout: "+method));},17000);
  pending.set(id,{ok:v=>{clearTimeout(timer);ok(v)},fail:e=>{clearTimeout(timer);fail(e)}});
  socket.send(JSON.stringify({id,method,params}));
 });
}
async function evalJs(source){
 const x=await send("Runtime.evaluate",{expression:source,returnByValue:true,awaitPromise:true});
 if(x.exceptionDetails)throw Error(JSON.stringify(x.exceptionDetails));
 return x.result?.value;
}
const sizes=[[360,800],[390,844],[430,932],[768,1024]];
try{
 let endpoint;
 for(let launch=0;launch<3&&!endpoint;launch++){
  if(launch){profile=await mkdtemp(join(tmpdir(),"pictau-hero-retry-"));profiles.push(profile);}
  chromeErrors="";
  chrome=spawn(bin(),["--headless=new","--no-sandbox","--disable-setuid-sandbox",
   "--disable-dev-shm-usage","--disable-gpu","--disable-background-networking",
   "--disable-extensions","--no-first-run","--no-default-browser-check",
   "--user-data-dir="+profile,"--remote-debugging-port=0","about:blank"],
   {stdio:["ignore","ignore","pipe"],env:{...process.env,DBUS_SESSION_BUS_ADDRESS:""}});
  chrome.stderr.on("data",chunk=>{chromeErrors+=String(chunk).slice(-2500)});
  chrome.on("error",error=>{chromeErrors+="\n"+String(error)});
  for(let i=0;i<180&&!endpoint;i++){
   try{
    const p=(await readFile(join(profile,"DevToolsActivePort"),"utf8")).split("\n")[0];
    const dp=Number(p);
    if(Number.isInteger(dp)&&dp>0){
     const tabs=await (await fetch("http://127.0.0.1:"+dp+"/json/list",
       {signal:AbortSignal.timeout(1400)})).json();
     endpoint=tabs.find(t=>t.type==="page")?.webSocketDebuggerUrl;
    }
   }catch{}
   if(chrome.exitCode!==null)break;
   await sleep(100);
  }
  if(!endpoint){
   if(chrome.exitCode===null)chrome.kill("SIGKILL");
   console.warn("Échec lancement Chrome, essai "+(launch+1)+"/3");
  }
 }
 assert.ok(endpoint,"Chrome ne démarre pas après 3 essais ; exit="+chrome?.exitCode+
   "; stderr="+chromeErrors.slice(-1600));
 socket=new WebSocket(endpoint);
 await new Promise((ok,fail)=>{
  socket.addEventListener("open",ok,{once:true});
  socket.addEventListener("error",fail,{once:true});
 });
 socket.addEventListener("message",ev=>{
  const msg=JSON.parse(ev.data),p=pending.get(msg.id);
  if(!p)return;pending.delete(msg.id);
  msg.error?p.fail(Error(JSON.stringify(msg.error))):p.ok(msg.result||{});
 });
 await send("Page.enable");await send("Runtime.enable");
 await mkdir("artifacts/bank-hero",{recursive:true});
 const report=[];
 for(const [width,height] of sizes){
  await send("Emulation.setDeviceMetricsOverride",{width,height,mobile:width<768,deviceScaleFactor:2});
  await send("Page.navigate",{url:"http://127.0.0.1:"+port+"/"});
  for(let i=0;i<40;i++){
   if(await evalJs("document.readyState==='complete'&&!!document.querySelector('[data-pa-bank-art]')"))break;
   await sleep(80);
  }
  const metrics=await evalJs(`(()=>{
    const get=s=>{const r=document.querySelector(s).getBoundingClientRect();
      return {top:r.top,bottom:r.bottom,width:r.width,height:r.height}};
    const art=document.querySelector("[data-pa-bank-art]");
    return {header:get(".admin-topbar"),panel:get(".pa-bank-sheet"),
      image:get(".pa-bank-sheet-hero"),draw:get("[data-pa-bank-art]"),
      natural:[art.naturalWidth,art.naturalHeight],
      fit:getComputedStyle(art).objectFit,origin:getComputedStyle(art).objectPosition,
      scrollWidth:document.documentElement.scrollWidth,innerWidth,innerHeight};
  })()`);
  const visible=metrics.image.top>=metrics.header.bottom-1&&
    metrics.image.bottom<=height+1;
  assert.ok(visible,width+"x"+height+": image cachée sous l'entête ou coupée");
  assert.equal(metrics.fit,"contain",width+"x"+height+": object-fit");
  assert.ok(metrics.natural[0]>0&&metrics.natural[1]>0,"PNG/SVG complet chargé");
  assert.ok(metrics.draw.height>0&&metrics.draw.width>0);
  assert.ok(metrics.scrollWidth<=metrics.innerWidth+2,
    width+"x"+height+": débordement horizontal");
  const shot=(await send("Page.captureScreenshot",{format:"png",captureBeyondViewport:false})).data;
  await writeFile("artifacts/bank-hero/fiche-"+width+"x"+height+".png",Buffer.from(shot,"base64"));
  report.push({width,height,visible,...metrics});
  console.log("ÉMULATEUR BANQUE OK "+width+"x"+height+" — PNG complet et entête visible");
 }
 await writeFile("artifacts/bank-hero/report.json",JSON.stringify(report,null,2));
}finally{
 try{socket?.close()}catch{}
 if(chrome?.exitCode===null)chrome.kill("SIGKILL");
 server.close();
 await Promise.all(profiles.map(p=>rm(p,{recursive:true,force:true}).catch(()=>{})));
}
