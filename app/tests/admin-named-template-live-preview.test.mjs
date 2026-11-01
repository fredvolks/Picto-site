import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {
  namedTemplatePreviewState,namedTemplatePreviewCaption,renderAdminNamedTemplateBank
} from "../src/admin-template-bank-ui.js";

const app=readFileSync(new URL("../src/app.js",import.meta.url),"utf8");
function bodyBetween(start,end){
 const a=app.indexOf(start),b=app.indexOf(end,a+start.length);
 assert.ok(a>=0&&b>a,"Fonction attendue introuvable : "+start);
 return app.slice(a,b);
}
test("L3 : aperçu FR/EN exact au centième et sans valeurs arrondies",()=>{
 assert.deepEqual(namedTemplatePreviewState({widthCm:"4.25",rotationDeg:"-32.5",enabled:true}),
   {valid:true,widthCm:4.25,rotationDeg:-32.5});
 assert.deepEqual(namedTemplatePreviewState({widthCm:"3",rotationDeg:"9",enabled:false}),
   {valid:true,widthCm:5,rotationDeg:0});
 assert.match(namedTemplatePreviewCaption({widthCm:"4.25",rotationDeg:"-32.5",enabled:true,fr:true}),
   /4,25 cm · rotation -32,5° · aperçu indicatif/);
 assert.match(namedTemplatePreviewCaption({widthCm:"4.25",rotationDeg:"-32.5",enabled:true,fr:false}),
   /4.25 cm · rotation -32.5° · illustrative preview/);
 for(const change of [{widthCm:""},{widthCm:"  "},{widthCm:"8.333"},
   {widthCm:"0"},{widthCm:"10.01"},{widthCm:"Infinity"},
   {rotationDeg:""},{rotationDeg:"-180.01"},{rotationDeg:"0.005"},
   {rotationDeg:"NaN"},{rotationDeg:"181"}]){
   const entry={enabled:true,widthCm:5,rotationDeg:0,...change};
   assert.equal(namedTemplatePreviewState(entry).valid,false,JSON.stringify(entry));
   assert.match(namedTemplatePreviewCaption({...entry,fr:true}),/Aperçu indisponible/);
 }
 const html=renderAdminNamedTemplateBank({templates:[],widthCm:5,rotationDeg:0});
 assert.match(html,/step="\.01" data-input="admin-named-template-width"/);
 assert.match(html,/step="\.01" data-input="admin-named-template-rotation"/);
});
test("L3 : largeur change le vrai rendu et la rotation reste sur le dessin",()=>{
 const source=bodyBetween("function adminPreview(){","function renderAdminTemplate(){");
 const state={language:"fr",adminItem:"pomme",currentPreset:{
   shape:"square",colored:false,color:"#000000"
 }};
 const bank={loaded:true,widthCm:"4.25",rotationDeg:"-32.5"};
 const used=[];
 const customPicto=(item,p,size)=>{
   used.push(size);
   return '<div class="picto" style="--width:'+size+
     'cm"><div class="picto-artwork"><svg></svg></div><div class="picto-label">Exemple</div></div>';
 };
 const fn=new Function("state","adminNamedTemplates","samples","namedTemplatePreviewState",
   "namedTemplatePreviewCaption","esc","customPicto",source+"\nreturn adminPreview;")(
   state,bank,[{id:"pomme"}],namedTemplatePreviewState,namedTemplatePreviewCaption,String,customPicto);
 const html=fn();
 assert.equal(used.at(-1),4.25);
 assert.match(html,/--width:4\.25cm/);
 assert.match(html,/class="picto-artwork" style="transform:rotate\(-32\.5deg\);transform-origin:center center"/);
 assert.doesNotMatch(html,/<div class="picto"[^>]*rotate/);
 bank.widthCm="";const count=used.length;
 assert.match(fn(),/Aperçu indisponible/);
 assert.equal(used.length,count,"Ne pas dessiner une largeur fictive");
 bank.loaded=false;
 assert.match(fn(),/width:5cm/,"L'ancienne démo reste accessible sans table");
 assert.equal(used.at(-1),5);
});
test("L3 : aperçu recalculé au clavier, focus d'édition conservé",()=>{
 const source=bodyBetween("function adminLive(){","function routineLive(){");
 const bank={loaded:true,widthCm:"4.25",rotationDeg:"15"};
 let drawn="",caption="",placements=0;
 const stage={set innerHTML(v){drawn=v;}};
 const note={set textContent(v){caption=v;}};
 const doc={querySelector(sel){
   return sel==="#admin-stage"?stage:sel==="#admin-preview-caption"?note:null;
 }};
 const fn=new Function("document","adminPreview","layoutArtwork","updateArtFeedback",
   "namedTemplatePreviewCaption","adminNamedTemplates","state",
   source+"\nreturn adminLive;")(
     doc,()=>"<div>Réglages actualisés</div>",()=>{placements++;},()=>{},
     namedTemplatePreviewCaption,bank,{language:"fr"});
 fn();
 assert.equal(drawn,"<div>Réglages actualisés</div>");
 assert.match(caption,/4,25 cm · rotation 15°/);
 assert.equal(placements,1);
 bank.widthCm="5.75";bank.rotationDeg="-12";fn();
 assert.match(caption,/5,75 cm · rotation -12°/);
 assert.equal(placements,2);
 assert.match(app,/adminNamedTemplates\.widthCm=event\.target\.value;adminLive\(\)/);
 assert.match(app,/adminNamedTemplates\.rotationDeg=event\.target\.value;adminLive\(\)/);
 assert.match(app,/id="admin-preview-caption"[^>]*role="status" aria-live="polite"/);
});
test("L3 : validation avant toute sauvegarde réseau, sans toucher au login gelé",()=>{
 const save=bodyBetween('if(a==="admin-named-template-save"){','if(a==="admin-named-template-publish"){');
 assert.match(save,/const preview=namedTemplatePreviewState\(/);
 assert.match(save,/if\(!preview\.valid\)/);
 assert.ok(save.indexOf("if(!preview.valid)")<save.indexOf("await supabaseClient()"));
 const preview=bodyBetween("function adminPreview(){","function renderAdminTemplate(){");
 assert.match(preview,/adminNamedTemplates\.loaded/);
 assert.doesNotMatch(preview,/HOSTED_LOGIN_PICTOS|renderHostedAccess/);
});
