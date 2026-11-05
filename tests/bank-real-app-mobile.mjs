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
const authStub=String.raw`const fakeUser={id:"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",email:"admin-qa@example.invalid"};
// Requêtes de lecture simulées UNIQUEMENT sur ce serveur Chromium local.
// Le vrai module admin-library-readiness.js est importé sans substitution.
const client={
 auth:{
  getUser:async()=>({data:{user:window.__qaSessionRevoked?
    {id:"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"}:fakeUser},error:null}),
  onAuthStateChange:cb=>({data:{subscription:{unsubscribe(){}}}}),
  signOut:async()=>({error:null})
 },
 rpc:async name=>({data:name==="pictau_draft_metadata_can_edit",error:null}),
 from(table){
  if(table==="pictau_admins")return{
   select:()=>({eq:()=>({maybeSingle:async()=>({data:{user_id:fakeUser.id},error:null})})})
  };
  let publication=null;
  const answer=()=>{
   if(table==="pictau_templates"){
    if(window.__qaTemplateMode==="missing")return {data:null,count:null,error:{code:"PGRST205"}};
    if(window.__qaTemplateMode==="denied")return {data:null,count:null,error:{code:"42501"}};
    return {data:null,count:publication===true?(window.__qaPublishedTemplates??2):(window.__qaPrivateTemplates??3),error:null};
   }
   if(table==="pictau_assets")return {data:null,count:4,error:null};
   if(table==="pictau_catalog_items")return {data:null,count:1,error:null};
   if(table==="pictau_published_theme_links")return {data:null,count:1,error:null};
   return {data:null,count:null,error:{code:"PGRST205"}};
  };
  const query={
   eq(field,value){
    if(table==="pictau_templates"&&field==="is_published")publication=value;
    return Promise.resolve(answer());
   },
   then(resolve,reject){return Promise.resolve(answer()).then(resolve,reject);}
  };
  return {select:()=>query};
 }
};
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
  created_by:"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",admin_name:title,title_fr:title,title_en:title,
  theme:i===0&&window.__qaBankLegacyTheme?(window.__qaBankCorrectedTheme||"tests"):"autres",
  status:"draft",created_at:"2026-11-01T13:00:00Z",
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
export async function readThemes(){
 return [{code:"autres",label_fr:"Autres",label_en:"Other",merged_into:null},
  {code:"hygiene",label_fr:"Hygiène",label_en:"Hygiene",merged_into:null},
  {code:"tests",label_fr:"Tests",label_en:"Tests",merged_into:"autres"}];
}
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
const editDraftStub=String.raw`export async function editPrivateDraftMetadata(_client,_uid,assetId,expected,form){
 if(!window.__qaBankLegacyTheme||!window.__qaBankItems||!assetId.startsWith("00000001-")
    ||expected.theme!=="tests"||form.theme!=="hygiene")
  throw Error("Modification privée QA inattendue");
 window.__qaBankCorrectedTheme="hygiene";
 return {saved:true,asset:{id:assetId,theme:form.theme,title_fr:form.titleFr,title_en:form.titleEn}};
}`;
const privatePreviewStub=String.raw`export async function loadPrivateAdminPreview(_client,_uid,assetId){
 if(window.__qaFailFirstReviewPreview){
  window.__qaFailFirstReviewPreview=false;
  throw Error("Panne PNG temporaire — QA");
 }
 const canvas=document.createElement("canvas");canvas.width=400;canvas.height=600;
 const ctx=canvas.getContext("2d");ctx.fillStyle="white";ctx.fillRect(0,0,400,600);
 ctx.lineWidth=12;ctx.strokeStyle="black";ctx.strokeRect(8,8,384,584);
 for(const [x,y,color] of [[50,50,"red"],[350,50,"blue"],[50,550,"green"],[350,550,"orange"]]){
   ctx.beginPath();ctx.arc(x,y,24,0,Math.PI*2);ctx.fillStyle=color;ctx.fill();
 }
 ctx.fillStyle="black";ctx.fillRect(170,200,60,230);
 const blob=await new Promise(resolve=>canvas.toBlob(resolve,"image/png"));
 return {blob,asset:{id:assetId,title_fr:"Pictogramme entier",title_en:"Full artwork",
   admin_name:"Pictogramme entier",
   theme:window.__qaBankLegacyTheme&&assetId.startsWith("00000001-")?
     (window.__qaBankCorrectedTheme||"tests"):"autres",
   created_by:"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
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
    const stubs={"/app/src/google-auth.js":authStub,"/app/src/admin-bank.js":bankStub,"/app/src/admin-themes.js":themesStub,"/app/src/admin-preview.js":privatePreviewStub,
      "/app/src/admin-draft-edit.js":editDraftStub,
      "/app/src/image-adjustments.js":adjustmentStub,"/app/src/caption-permission.js":captionStub,"/app/src/pictogram-requests.js":requestStub};
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
  const sizes=[[360,800],[390,844],[430,932],[768,1024],[1440,900]];
  await mkdir(resolve("artifacts/admin-bank-real"),{recursive:true});
  for(const [width,height] of sizes){
    await command("Emulation.setDeviceMetricsOverride",{width,height,mobile:width<768,deviceScaleFactor:1});
    await command("Page.navigate",{url:base+"/app/"});
    await waitFor("return !!document.querySelector('#admin-dashboard-title')",14000);

    // Vrai composant du Super Admin en Chrome, aucune maquette HTML substituée.
    await evaluate("document.querySelector('[data-action=lang][data-lang=fr]').click();return true;");
    await waitFor("return !!document.querySelector('.pa-release-readiness .pa-release-grid')",14000);
    await waitFor("return document.querySelector('.pa-release-grid')?.textContent.includes('Gabarits publiés')");
    const qaReadiness=async()=>evaluate("const panel=document.querySelector('.pa-release-readiness');const r=panel.getBoundingClientRect();return {labels:[...panel.querySelectorAll('.pa-release-grid>div')].map(x=>[x.querySelector('span')?.textContent.trim(),x.querySelector('strong')?.textContent.trim()]),buttonHeights:[...panel.querySelectorAll('button')].map(x=>Math.round(x.getBoundingClientRect().height)),top:r.top,left:r.left,right:r.right,scrollWidth:document.documentElement.scrollWidth,width:innerWidth,review:!!document.querySelector('[data-action=admin-review-queue]')};");
    let readiness=await qaReadiness();
    const countFor=label=>readiness.labels.find(([name])=>name===label)?.[1];
    assert.equal(countFor("Brouillons privés"),"4",width+": fiches privées");
    assert.equal(countFor("Pictogrammes publiés"),"1",width+": catalogue approuvé");
    assert.equal(countFor("Gabarits privés"),"3",width+": modèles privés");
    assert.equal(countFor("Gabarits publiés"),"2",width+": modèles publiés");
    assert.ok(readiness.review,"Le raccourci Brouillons à approuver est conservé.");
    assert.ok(readiness.buttonHeights.length>=3&&readiness.buttonHeights.every(x=>x>=44),
      "Actions tactiles >=44 px: "+width+" "+JSON.stringify(readiness.buttonHeights));
    assert.ok(readiness.left>=-2&&readiness.right<=width+2,
      "Le diagnostic déborde horizontalement: "+width+" "+JSON.stringify(readiness));
    assert.ok(readiness.scrollWidth<=readiness.width+2,"Défilement horizontal inattendu: "+width);

    if(width<=768){
      // Défaut visuel détecté sur les vraies captures : hamburger blanc sur fond blanc.
      const menu=await evaluate("const button=document.querySelector('#admin-menu-toggle');const style=getComputedStyle(button);const svg=button.querySelector('svg');return {shown:style.display!=='none',foreground:style.color,background:style.backgroundColor,svgWidth:svg?.getBoundingClientRect().width,svgStroke:svg?.getAttribute('stroke'),expanded:button.getAttribute('aria-expanded')};");
      assert.ok(menu.shown&&menu.svgWidth>=20,"Hamburger absent : "+width+" "+JSON.stringify(menu));
      assert.equal(menu.foreground,"rgb(41, 75, 55)",
        "Le bouton de menu blanc doit avoir une icône verte foncée lisible : "+width);
      assert.equal(menu.background,"rgb(255, 255, 255)");
      assert.equal(menu.svgStroke,"currentColor");
      await evaluate("document.querySelector('#admin-menu-toggle').click();return true;");
      await waitFor("return document.querySelector('#admin-menu-toggle')?.getAttribute('aria-expanded')==='true'&&document.querySelector('#pictau-admin-drawer')?.classList.contains('is-open')");
      await evaluate("document.querySelector('.admin-drawer-close').click();return true;");
      await waitFor("return document.querySelector('#admin-menu-toggle')?.getAttribute('aria-expanded')==='false'");
    }

    await writeFile(resolve("artifacts/admin-bank-real/readiness-fr-"+width+"x"+height+".png"),
      Buffer.from((await command("Page.captureScreenshot",{format:"png",captureBeyondViewport:false,fromSurface:true})).data,"base64"));
    await evaluate("document.querySelector('[data-action=lang][data-lang=en]').click();return true;");
    await waitFor("return document.querySelector('.pa-release-grid')?.textContent.includes('Published templates')");
    readiness=await qaReadiness();
    assert.equal(readiness.labels.find(([name])=>name==="Published templates")?.[1],"2");
    assert.equal(readiness.labels.find(([name])=>name==="Private templates")?.[1],"3");
    assert.ok(readiness.review);
    await writeFile(resolve("artifacts/admin-bank-real/readiness-en-"+width+"x"+height+".png"),
      Buffer.from((await command("Page.captureScreenshot",{format:"png",captureBeyondViewport:false,fromSurface:true})).data,"base64"));
    await evaluate("document.querySelector('[data-action=lang][data-lang=fr]').click();return true;");
    await waitFor("return document.querySelector('.pa-release-grid')?.textContent.includes('Gabarits publiés')");
    if(width===390){
      // Table absente, RLS refusée et reprise : aucun compte fictivement à zéro.
      for(const [mode,expected] of [["missing","Non installé"],["denied","Non vérifié"],["available","2"]]){
        await evaluate("window.__qaTemplateMode='"+mode+"';document.querySelector('[data-action=admin-readiness-refresh]').click();return true;");
        await waitFor("return [...document.querySelectorAll('.pa-release-grid>div')].some(x=>x.querySelector('span')?.textContent.includes('Gabarits publiés')&&x.querySelector('strong')?.textContent.trim()==='"+expected+"')",12000);
        assert.equal((await qaReadiness()).labels.find(([name])=>name==="Gabarits publiés")?.[1],expected);
      }
      await evaluate("window.__qaSessionRevoked=true;document.querySelector('[data-action=admin-readiness-refresh]').click();return true;");
      await waitFor("return !!document.querySelector('.pa-release-readiness [role=alert]')",12000);
      assert.equal(await evaluate("return document.querySelector('.pa-release-readiness .pa-release-grid')===null"),true,
        "Une session révoquée masque immédiatement les chiffres du diagnostic.");
      await evaluate("window.__qaSessionRevoked=false;document.querySelector('[data-action=admin-readiness-refresh]').click();return true;");
      await waitFor("return document.querySelector('.pa-release-grid')?.textContent.includes('Gabarits publiés')",12000);

      // Le travail sur la Banque change les comptes; l'accueil doit relire
      // ces valeurs automatiquement, sans afficher l'ancien résultat comme valide.
      const changed=await evaluate("window.__qaPublishedTemplates=5;document.querySelector('.admin-side-nav [data-action=admin-tab][data-tab=bank]').click();document.querySelector('.admin-side-nav [data-action=admin-tab][data-tab=overview]').click();return {loading:!!document.querySelector('.pa-release-readiness [role=status]'),oldGrid:!!document.querySelector('.pa-release-grid')};");
      assert.ok(changed.loading&&!changed.oldGrid,
        "Au retour à Accueil, ne pas afficher le dernier comptage comme actuel");
      await waitFor("return [...document.querySelectorAll('.pa-release-grid>div')].some(x=>x.querySelector('span')?.textContent.includes('Gabarits publiés')&&x.querySelector('strong')?.textContent.trim()==='5')",12000);
      assert.equal((await qaReadiness()).labels.find(([label])=>label==="Gabarits publiés")?.[1],"5",
        "Le retour à Accueil doit relire le nouveau compte sous Auth/RLS");
      // Une deuxième navigation recharge encore, au lieu d'un cache définitif.
      await evaluate("window.__qaPublishedTemplates=2;document.querySelector('.admin-side-nav [data-action=admin-tab][data-tab=bank]').click();document.querySelector('.admin-side-nav [data-action=admin-tab][data-tab=overview]').click();return true;");
      await waitFor("return [...document.querySelectorAll('.pa-release-grid>div')].some(x=>x.querySelector('span')?.textContent.includes('Gabarits publiés')&&x.querySelector('strong')?.textContent.trim()==='2')",12000);
      console.log("QA RETOUR À ACCUEIL — comptes rechargés 2 fois sans état périmé");
    }

    // Parcours public candidat : le raccourci approuvable ouvre le premier
    // vrai panneau de la Banque, avec données simulées UNIQUEMENT dans ce serveur QA.
    if([390,768,1440].includes(width)){
      const shortcut=await evaluate("const b=document.querySelector('[data-action=admin-review-queue]');return {present:!!b,label:b?.textContent.trim(),height:b?.getBoundingClientRect().height,disabled:b?.disabled};");
      assert.ok(shortcut.present&&!shortcut.disabled&&shortcut.height>=44,
        "Raccourci d'approbation tactile absent: "+width+" "+JSON.stringify(shortcut));
      await evaluate("window.__qaBankItems=true;window.__qaFailFirstReviewPreview="+(width===390)+";document.querySelector('[data-action=admin-review-queue]').click();return true;");
      if(width===390){
        await waitFor("return !!document.querySelector('.pa-bank-sheet [data-action=admin-preview-retry]')&&!!document.querySelector('.pa-bank-preview-error [role=alert]')",14000);
        const failed=await evaluate("return {retry:!!document.querySelector('[data-action=admin-preview-retry]'),nextDisabled:document.querySelector('[data-action=admin-draft-review-next]')?.disabled,progress:document.querySelector('.pa-bank-review-progress')?.textContent||'',error:document.querySelector('.pa-bank-preview-error [role=alert]')?.textContent||'',published:!!document.querySelector('.pa-admin-publish-feedback')};");
        assert.equal(failed.retry,true,"Panne PNG : commande Réessayer proposée");
        assert.equal(failed.nextDisabled,true,"Un PNG échoué ne peut pas être sauté");
        assert.match(failed.error,/Panne PNG temporaire/);
        assert.match(failed.progress,/0 image/,"Échec du téléchargement jamais compté comme ouvert");
        assert.equal(failed.published,false,"La panne ne publie aucun picto");
        await evaluate("document.querySelector('[data-action=admin-preview-retry]').click();return true;");
      }
      await waitFor("return !!document.querySelector('.pa-bank-sheet #pa-bank-inspector-title')&&document.querySelector('.pa-bank-sheet-hero img')?.naturalWidth>=400",14000);
      const recovered=await evaluate("return {progress:document.querySelector('.pa-bank-review-progress')?.textContent||'',nextDisabled:document.querySelector('[data-action=admin-draft-review-next]')?.disabled,retry:!!document.querySelector('[data-action=admin-preview-retry]')};");
      assert.match(recovered.progress,/1 image/,"La fiche est comptée uniquement après PNG reçu");
      assert.equal(recovered.nextDisabled,false,"Le bouton Suivant est de nouveau disponible");
      assert.equal(recovered.retry,false,"Le bouton Réessayer disparaît après succès");
      // Nom, Ajuster et Classer doivent afficher la même commande de révision.
      for(const tab of ["name","adjust","classify","name"]){
        await evaluate("document.querySelector('[data-action=pa-bank-sheet-tab][data-tab="+tab+"]').click();return true;");
        await waitFor("return !!document.querySelector('.pa-bank-review-step [data-action=admin-draft-review-next]')&&!!document.querySelector('.pa-bank-review-step [data-action=admin-draft-review-stop]')",14000);
        const metrics=await evaluate("const b=document.querySelector('.pa-bank-review-step [data-action=admin-draft-review-next]'),r=b.getBoundingClientRect(),sheet=document.querySelector('.pa-bank-sheet').getBoundingClientRect();return {count:document.querySelectorAll('[data-action=admin-draft-review-next]').length,height:r.height,left:r.left,right:r.right,top:r.top,bottom:r.bottom,sheetBottom:sheet.bottom,scrollWidth:document.documentElement.scrollWidth,width:innerWidth};");
        assert.equal(metrics.count,1,"Commande Suivant unique");
        assert.ok(metrics.height>=44&&metrics.bottom<=metrics.sheetBottom+2,
          "Commande accessible dans la fiche: "+width+" "+JSON.stringify(metrics));
        assert.ok(metrics.left>=-2&&metrics.right<=width+2&&metrics.scrollWidth<=width+2,
          "Pas de débordement horizontal: "+width);
      }
      const first=await evaluate("return {title:document.querySelector('.pa-bank-sheet #pa-bank-inspector-title')?.textContent.trim(),next:!!document.querySelector('[data-action=admin-draft-review-next]'),bank:!!document.querySelector('.admin-side-nav [data-action=admin-tab][data-tab=bank].active'),published:!!document.querySelector('.pa-admin-publish-feedback')};");
      assert.equal(first.title,"Pomme","Ouvrir le premier brouillon privé, sans détour par une liste");
      assert.equal(first.bank,true,"Navigation Banque activée");
      assert.equal(first.next,true,"La file de révision demeure disponible");
      assert.equal(first.published,false,"Aucune image publiée par la navigation");
      await writeFile(resolve("artifacts/admin-bank-real/review-from-home-"+width+"x"+height+".png"),
        Buffer.from((await command("Page.captureScreenshot",{format:"png",captureBeyondViewport:false,fromSurface:true})).data,"base64"));
      await evaluate("document.querySelector('[data-action=admin-bank-detail-close]').click();return true;");
      await waitFor("return !document.querySelector('.pa-bank-sheet')&&!!document.querySelector('[data-action=admin-draft-review-stop]')",14000);
      await evaluate("document.querySelector('[data-action=admin-draft-review-stop]').click();document.querySelector('.admin-side-nav [data-action=admin-tab][data-tab=overview]').click();window.__qaBankItems=false;return true;");
      await waitFor("return !!document.querySelector('#admin-dashboard-title')",12000);
      console.log("RACCOURCI REVUE PREMIER BROUILLON — OK",width+"x"+height,first.title);
      if(width===390){
        // Parcours du vrai composant public sur données QA uniquement :
        // thème historique fusionné → correction RLS simulée → PNG rouvert.
        await evaluate("window.__qaBankItems=true;window.__qaBankLegacyTheme=true;window.__qaBankCorrectedTheme=null;document.querySelector('[data-action=admin-review-queue]').click();return true;");
        await waitFor("return !!document.querySelector('.pa-bank-sheet-hero img')?.naturalWidth",14000);
        await evaluate("document.querySelector('[data-action=pa-bank-sheet-tab][data-tab=classify]').click();return true;");
        await waitFor("return document.querySelector('#pa-bank-primary-theme-status')?.textContent.includes('fusionnée')",14000);
        const denied=await evaluate("return {disabled:document.querySelector('form[data-form=catalog-publish] button[type=submit]')?.disabled,edit:!!document.querySelector('.pa-bank-primary-theme [data-action=admin-edit-draft]')};");
        assert.deepEqual(denied,{disabled:true,edit:true},"Publication interdite quand thème fusionné");
        await evaluate("document.querySelector('.pa-bank-primary-theme [data-action=admin-edit-draft]').click();return true;");
        await waitFor("return !!document.querySelector('#edit-draft-theme')",12000);
        const initial=await evaluate("return {values:[...document.querySelector('#edit-draft-theme').options].map(x=>x.value),disabled:document.querySelector('form[data-form=admin-edit-draft] button[type=submit]')?.disabled};");
        assert.ok(!initial.values.includes("tests")&&initial.values.includes("hygiene")&&initial.disabled);
        await evaluate("const e=document.querySelector('#edit-draft-theme');e.value='hygiene';e.dispatchEvent(new Event('change',{bubbles:true}));return true;");
        await waitFor("return document.querySelector('form[data-form=admin-edit-draft] button[type=submit]')?.disabled===false",12000);
        await evaluate("document.querySelector('form[data-form=admin-edit-draft]').requestSubmit();return true;");
        await waitFor("return document.querySelector('[data-action=admin-draft-review-resume]')?.disabled===false && !document.querySelector('.pa-bank-sheet')",14000);
        await evaluate("document.querySelector('[data-action=admin-draft-review-resume]').click();return true;");
        await waitFor("return !!document.querySelector('.pa-bank-sheet-hero img')?.naturalWidth",14000);
        await evaluate("document.querySelector('[data-action=pa-bank-sheet-tab][data-tab=classify]').click();return true;");
        await waitFor("return !!document.querySelector('.pa-bank-primary-theme [role=status]')",12000);
        const checked=await evaluate("return {text:document.querySelector('.pa-bank-primary-theme')?.textContent||'',progress:document.querySelector('.pa-bank-review-progress')?.textContent||'',approved:document.querySelector('form[data-form=catalog-publish] input[name=confirmed]')?.checked};");
        assert.match(checked.text,/Hygiène/);
        assert.match(checked.progress,/1 image/);
        assert.equal(checked.approved,false,"Aucune approbation automatique");
        const shot=await command("Page.captureScreenshot",{format:"png",captureBeyondViewport:false,fromSurface:true});
        await writeFile(resolve("artifacts/admin-bank-real/primary-category-390px.png"),Buffer.from(shot.data,"base64"));
        await evaluate("document.querySelector('[data-action=admin-draft-review-stop]').click();document.querySelector('.admin-side-nav [data-action=admin-tab][data-tab=overview]').click();window.__qaBankLegacyTheme=false;window.__qaBankCorrectedTheme=null;window.__qaBankItems=false;return true;");
        console.log("CATÉGORIE PUBLIQUE CORRIGÉE — OK",width);
      }
    }
    console.log("VRAI DASHBOARD SUPER ADMIN — QA simulée",width+"x"+height,readiness.labels);
    if(width>=1200)continue; // Fiche Banque couverte séparément aux largeurs mobile/tablette.

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
