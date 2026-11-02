// Contrôle réel de /app/ en tant que partie du site officiel GitHub Pages.
// Test d'UX admin en navigateur isolé, avec modules d'authentification et banque simulés
// uniquement dans le serveur de test. AUCUN mock n'est intégré aux fichiers publiés.
import assert from "node:assert/strict";
import {createServer} from "node:http";
import {readFile,writeFile,mkdir,mkdtemp,rm} from "node:fs/promises";
import {resolve,join,extname} from "node:path";
import {tmpdir} from "node:os";
import {spawn,execFileSync} from "node:child_process";
import {setTimeout as sleep} from "node:timers/promises";

const site=resolve(".");
const app=await readFile(join(site,"app/index.html"),"utf8");
const login=await readFile(join(site,"connexion.html"),"utf8");
assert.match(app,/<meta name="pictau-site-app" content="true">/);
assert.match(login,/href="\.\/app\/"/);
const allowed={".html":"text/html",".js":"text/javascript",".css":"text/css",".svg":"image/svg+xml"};
// Ces stubs n'existent JAMAIS sur le site réel : ils ne sont servis que par CE test local.
const authStub=String.raw`const fakeUser={id:"qa-admin-0001",email:"admin-qa@example.invalid"};
const client={auth:{getUser:async()=>({data:{user:fakeUser},error:null}),onAuthStateChange:cb=>({data:{subscription:{unsubscribe(){}}}}),signOut:async()=>({error:null})}};
export const SUPABASE_URL="local-qa-only",SUPABASE_PUBLIC_KEY="test-publishable",SDK_URL="disabled";
export async function supabaseClient(){return client;}
export async function currentVerifiedUser(){return fakeUser;}
export async function loginGoogle(){throw Error("No real Google auth in this test.");}
export async function logoutGoogle(){return;}
export async function loginWithEmail(){throw Error("No live auth in test.");}
export async function sendEmailSignInLink(){throw Error("No live email in test.");}
export async function sendPasswordReset(){throw Error("No live reset in test.");}
export async function updateEmailPassword(){throw Error("No live password update in test.");}`;
const bankStub=String.raw`export const ADMIN_BANK_PAGE_SIZE=24;
export function normalizeAdminBankFilters(f){return f;}
// Fixtures strictly hosted by this isolated Chromium server, never in public files.
function privateRows(){
 if(!window.__qaBankItems)return [];
 return ["Pomme","Lavage des mains","Couverture lestée","Balle sensorielle"].map((title,i)=>({
  id:String(i+1).padStart(8,"0")+"-1111-4111-8111-111111111111",
  created_by:"qa-admin-0001",admin_name:title,title_fr:title,title_en:title,
  theme:"autres",status:"draft",created_at:"2026-11-01T13:00:00Z",
  published_at:null
 }));
}
export async function readAdminBank(){return readAdminBankAvailablePage();}
export async function readAdminBankAvailablePage(){
 const items=privateRows();
 return {authorized:true,items,total:items.length,page:0,pageSize:24};
}
export function planNextPrivateDraftReview({items=[],seen=new Set()}={}){
 const next=items.find(row=>row.status==="draft"&&!seen.has(row.id));
 return next?{kind:"open",id:next.id}:{kind:"done"};
}`;
const themesStub=String.raw`export const MAX_THEMES_PER_ASSET=8;
export async function readThemes(){return [];}
export async function readAssetThemes(){return {};}
export async function createTheme(){throw Error("No admin mutations in QA");}
export async function editThemeLabels(){throw Error("No admin mutations in QA");}
export async function addAssetTheme(){throw Error("No admin mutations in QA");}
export async function copyAdditionalAssetThemes(){throw Error("No admin mutations in QA");}
export async function removeAssetTheme(){throw Error("No admin mutations in QA");}
export async function mergeThemes(){throw Error("No admin mutations in QA");}`;
const captionStub=String.raw`let enabled=false;
export async function readCaptionPermission(){return {enabled,updated_at:null};}
export async function setCaptionPermission(client,uid,old,next){if(enabled!==old)throw Error("QA conflict");enabled=next;return {enabled,updated_at:null};}`;
// Banque de demandes fictive pour le SEUL serveur Chromium local.
const requestStub=String.raw`export const REQUEST_PAGE_SIZE=20;
export const REQUEST_STATUSES=["submitted","in_progress","accepted","rejected","published","already_available"];
export const REQUEST_LABELS={submitted:{fr:"Envoyée",en:"Submitted"},in_progress:{fr:"En cours",en:"In progress"},accepted:{fr:"Acceptée",en:"Accepted"},rejected:{fr:"Refusée",en:"Declined"},published:{fr:"Publiée",en:"Published"},already_available:{fr:"Déjà disponible",en:"Already available"}};
const row={id:"88888888-8888-4888-8888-888888888888",requester_id:"11111111-1111-4111-8111-111111111111",subject:"Balle sensorielle",description:"Dessin d'une balle sensorielle simple.",theme:"sensoriel",status:"submitted",admin_note:null,linked_asset_id:null,created_at:"2026-10-28T17:00:00Z"};
export function validateRequestForm(x){return x;}
export async function submitPictogramRequest(){throw Error("Aucune écriture en QA");}
export async function listMyPictogramRequests(){return{items:[],total:0,page:0};}
export async function listMyPictogramRequestsAvailablePage(){return{items:[],total:0,page:0};}
export async function listAdminPictogramRequests(client,uid,{page=0}={}){
 const total=window.__qaAdminRequestPagination?(window.__qaAdminRequestShrunk?1:41):1;
 const start=page*REQUEST_PAGE_SIZE;
 const items=Array.from({length:Math.max(0,Math.min(REQUEST_PAGE_SIZE,total-start))},(_,i)=>{
  const index=start+i;
  return index===0?row:{...row,id:(index+1).toString(16).padStart(8,"0")+"-8888-4888-8888-888888888888",subject:"Demande Admin QA "+index};
 });
 return {items,total,page,pageSize:REQUEST_PAGE_SIZE};
}
export async function listAdminPictogramRequestsAvailablePage(client,uid,filters={}){
 let current=filters.page??0;
 for(let attempt=0;attempt<3;attempt++){
  const result=await listAdminPictogramRequests(client,uid,{...filters,page:current});
  const last=Math.max(0,Math.ceil(result.total/REQUEST_PAGE_SIZE)-1);
  if(current<=last&&(result.items.length>0||result.total===0))return {...result,page:current};
  if(result.total===0)return {...result,items:[],page:0};
  if(current<=last)continue;
  current=last;
 }
 throw Error("La liste administrateur a changé.");
}
export async function updateAdminPictogramRequest(){throw Error("Aucune mutation réelle dans ce test");}
export async function listPictogramRequestHistory(){
 if(window.__qaHoldAdminHistory){
  await new Promise(resolve=>{window.__qaReleaseAdminHistory=()=>{
   window.__qaHoldAdminHistory=false;window.__qaReleaseAdminHistory=null;resolve();
  };});
 }
 if(window.__qaFailAdminHistory){
  window.__qaFailAdminHistory=false;throw Error("Historique Super Admin momentanément indisponible");
 }
 return [{created_at:"2026-10-28T17:30:00Z",old_status:"submitted",new_status:"in_progress"}];
}
`;
// Fake PNG privé (32 × 32, dessin noir sur fond blanc) servi au navigateur
// d'essai uniquement. Aucun identifiant Supabase réel, aucune clé privée.
// Pictogramme portrait contrasté, coins repères : image entière exigée.
const privatePreviewStub=String.raw`export async function loadPrivateAdminPreview(_client,_uid,assetId){
 const canvas=document.createElement("canvas");canvas.width=400;canvas.height=600;
 const ctx=canvas.getContext("2d");ctx.fillStyle="white";ctx.fillRect(0,0,400,600);
 ctx.lineWidth=12;ctx.strokeStyle="black";ctx.strokeRect(8,8,384,584);
 for(const [x,y,color] of [[50,50,"red"],[350,50,"blue"],[50,550,"green"],[350,550,"orange"]]){
   ctx.beginPath();ctx.arc(x,y,24,0,Math.PI*2);ctx.fillStyle=color;ctx.fill();
 }
 ctx.fillStyle="black";ctx.fillRect(170,200,60,230);
 const blob=await new Promise(resolve=>canvas.toBlob(resolve,"image/png"));
 return {blob,asset:{id:assetId,title_fr:"Pictogramme entier",title_en:"Full artwork",
   admin_name:"Pictogramme entier",theme:"autres",created_by:"qa-admin-0001",
   status:"draft",created_at:"2026-11-01T13:00:00Z"}};
}`;
const adjustmentStub=String.raw`const revisions=new Map();
export async function readAdminImageAdjustment(_client,_uid,assetId){
 const found=revisions.get(assetId);
 return {available:true,scalePercent:found?.scalePercent??100,rotationDeg:found?.rotationDeg??0,
   offsetX:found?.offsetX??0,offsetY:found?.offsetY??0,
   mirrorHorizontal:found?.mirrorHorizontal??false,revision:found?.revision||null};
}
export async function saveAdminImageAdjustment(_client,_uid,{assetId,scalePercent,rotationDeg=0,offsetX=0,offsetY=0,mirrorHorizontal=false,revision}){
 const last=revisions.get(assetId);
 if((last?.revision||null)!==revision)throw Error("Concurrent QA update");
 const next={scalePercent,rotationDeg,offsetX,offsetY,mirrorHorizontal,revision:(revision||0)+1};
 revisions.set(assetId,next);
 return next;
}`;
const server=createServer(async(req,res)=>{
  try{
    const url=new URL(req.url||"/","http://localhost");
    const p=decodeURIComponent(url.pathname);
    const stubs={"/app/src/google-auth.js":authStub,"/app/src/admin-bank.js":bankStub,"/app/src/admin-themes.js":themesStub,"/app/src/admin-preview.js":privatePreviewStub,"/app/src/image-adjustments.js":adjustmentStub,"/app/src/caption-permission.js":captionStub,"/app/src/pictogram-requests.js":requestStub};
    if(stubs[p]){res.writeHead(200,{"Content-Type":"text/javascript","Cache-Control":"no-store"});res.end(stubs[p]);return;}
    const target=resolve(site,"."+p,p.endsWith("/")?"index.html":"");
    if(!target.startsWith(site+"/")){res.writeHead(403);res.end();return;}
    const body=await readFile(target);
    res.writeHead(200,{"Content-Type":allowed[extname(target)]||"application/octet-stream"});
    res.end(body);
  }catch{res.writeHead(404);res.end("Not found");}
});
await new Promise(ok=>server.listen(0,"127.0.0.1",ok));
const base="http://127.0.0.1:"+server.address().port;
const profile=await mkdtemp(join(tmpdir(),"pictau-hosted-"));
let chrome,socket,seq=0;
const pending=new Map();
const chromeBinary=()=>{
  for(const n of ["google-chrome","chromium","chromium-browser"]){
    try{return execFileSync("which",[n],{encoding:"utf8"}).trim();}catch{}
  }
  throw Error("Chromium introuvable");
};
function command(method,params={}){
  return new Promise((ok,fail)=>{
    const id=++seq,timer=setTimeout(()=>{pending.delete(id);fail(Error("CDP timeout "+method));},12000);
    pending.set(id,{ok:v=>{clearTimeout(timer);ok(v);},fail:e=>{clearTimeout(timer);fail(e);}});
    socket.send(JSON.stringify({id,method,params}));
  });
}
async function evaluate(body){
  const r=await command("Runtime.evaluate",{expression:"(()=>{"+body+"})()",returnByValue:true,awaitPromise:true});
  if(r.exceptionDetails)throw Error("Browser exception "+JSON.stringify(r.exceptionDetails));
  return r.result?.value;
}
async function waitFor(body,timeout=11000){
  const start=Date.now();
  while(Date.now()-start<timeout){
    try{if(await evaluate(body))return;}catch{}
    await sleep(150);
  }
  throw Error("Page d'application absente: "+body);
}
try{
  chrome=spawn(chromeBinary(),["--headless=new","--no-sandbox","--disable-dev-shm-usage","--disable-background-networking",
    "--disable-extensions","--no-first-run","--user-data-dir="+profile,"--remote-debugging-port=0","about:blank"],
    {stdio:["ignore","ignore","pipe"],env:{...process.env,DBUS_SESSION_BUS_ADDRESS:""}});
  let endpoint;
  for(let i=0;i<150&&!endpoint;i++){
    try{
      const f=await readFile(join(profile,"DevToolsActivePort"),"utf8");
      const port=Number(f.split("\n")[0]);
      if(port>0){
        const pages=await (await fetch("http://127.0.0.1:"+port+"/json/list",{signal:AbortSignal.timeout(1300)})).json();
        endpoint=pages.find(x=>x.type==="page")?.webSocketDebuggerUrl;
      }
    }catch{}
    if(chrome.exitCode!==null)break;
    await sleep(90);
  }
  if(!endpoint)throw Error("Port Chromium de test indisponible");
  socket=new WebSocket(endpoint);
  await new Promise((ok,fail)=>{socket.addEventListener("open",ok,{once:true});socket.addEventListener("error",fail,{once:true});});
  socket.addEventListener("message",e=>{
    const data=JSON.parse(e.data),p=pending.get(data.id);
    if(p){pending.delete(data.id);if(data.error)p.fail(Error(JSON.stringify(data.error)));else p.ok(data.result||{});}
  });
  await command("Page.enable");
  await command("Runtime.enable");
  await mkdir(resolve("artifacts/admin-ux"),{recursive:true});
  const sizes=[[360,800],[390,844],[430,932],[768,1024]];
  await mkdir(resolve("artifacts/admin-bank-real"),{recursive:true});
  for(const [width,height] of sizes){
    await command("Emulation.setDeviceMetricsOverride",{width,height,mobile:width<768,deviceScaleFactor:1});
    await command("Page.navigate",{url:base+"/app/"});
    await waitFor("return !!document.querySelector('#admin-dashboard-title')",14000);
    await evaluate("window.__qaBankItems=true;document.querySelector('.admin-side-nav [data-action=admin-tab][data-tab=bank]').click();return true;");
    await waitFor("return !!document.querySelector('[data-action=refresh-admin-bank]')");
    await evaluate("document.querySelector('[data-action=refresh-admin-bank]').click();return true;");
    await waitFor("return document.querySelectorAll('[data-action=admin-bank-open]').length>=2",14000);
    await evaluate("document.querySelectorAll('[data-action=admin-bank-open]')[1].click();return true;");
    await waitFor("return !!document.querySelector('.pa-bank-sheet-hero [data-pa-bank-art]')",14000);
    await waitFor("return document.querySelector('.pa-bank-sheet-hero img')?.complete && document.querySelector('.pa-bank-sheet-hero img')?.naturalWidth>=400",14000);
    await sleep(300); // réinitialisations de rendu après chargement et réglages
    const data=await evaluate("const rect=s=>{const el=document.querySelector(s);if(!el)return null;const r=el.getBoundingClientRect();return {top:r.top,bottom:r.bottom,left:r.left,right:r.right,width:r.width,height:r.height}};const image=document.querySelector('.pa-bank-sheet-hero img');const topbar=document.querySelector('.admin-topbar');return {docY:scrollY,screen:[innerWidth,innerHeight],topbar:rect('.admin-topbar'),header:rect('.pa-bank-sheet-head'),save:rect('.pa-bank-head-save'),hero:rect('.pa-bank-sheet-hero'),img:rect('.pa-bank-sheet-hero img'),tabs:rect('.pa-bank-sheet-tabs'),fit:getComputedStyle(image).objectFit,natural:[image.naturalWidth,image.naturalHeight]};");
    const barBottom=data.topbar?.bottom??0;
    assert.ok(data.header?.top>=barBottom-3,"Le titre de la fiche est masqué derrière la topbar: "+width+" "+JSON.stringify(data));
    assert.ok(data.save?.top>=barBottom-3&&data.save?.bottom<=height+2,
      "Enregistrer doit être entièrement visible sur mobile: "+width+" "+JSON.stringify(data));
    assert.ok(data.hero?.top>=barBottom-3&&data.hero?.bottom<=height+2,
      "Image coupée verticalement ou masquée: "+width+" "+JSON.stringify(data));
    assert.ok(data.tabs?.top>=data.hero.bottom-3,"Onglets recouvrent l'image: "+width);
    assert.deepEqual(data.natural,[400,600],"Le PNG original portrait doit être chargé entier");
    assert.equal(data.fit,"contain","L'image doit être contenue sans découpe");
    const screenshot=await command("Page.captureScreenshot",{format:"png",captureBeyondViewport:false,fromSurface:true});
    await writeFile(resolve("artifacts/admin-bank-real/fiche-"+width+"x"+height+".png"),Buffer.from(screenshot.data,"base64"));
    console.log("VRAIE FICHE APP AVEC SESSION QA — OK",width+"x"+height,data);
  }
}finally{
  if(socket)socket.close();
  if(chrome?.exitCode===null)chrome.kill("SIGKILL");
  server.close();
  await rm(profile,{recursive:true,force:true,maxRetries:5,retryDelay:100});
}
