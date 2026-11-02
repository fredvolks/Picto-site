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
test("L3 : la largeur change le vrai rendu privé et seule l'image pivote",()=>{
 const source=bodyBetween("function adminPreview(){","function adminRealPreviewCaption(){");
 const state={language:"fr",currentPreset:{shape:"square",colored:false,color:"#000000"}};
 const bank={loaded:true,widthCm:"4.25",rotationDeg:"-32.5"};
 const pictoId="11111111-1111-4111-8111-111111111111";
 const privateBank={items:[{id:pictoId,title_fr:"Pomme",title_en:"Apple"}]};
 const privatePreview={id:pictoId,loading:false,error:"",url:"blob:private-image",inkUrl:"blob:real-ink"};
 const used=[];
 const customPicto=(item,p,size)=>{
   used.push({size,image:item.image});
   return '<div class="picto" style="--width:'+size+
     'cm"><div class="picto-artwork">'+item.image+'</div><div class="picto-label">Pomme</div></div>';
 };
 const fn=new Function("state","adminNamedTemplates","privateBank","privatePreview","namedTemplatePreviewState",
   "namedTemplatePreviewCaption","esc","customPicto","icon",source+"\nreturn adminPreview;")(
   state,bank,privateBank,privatePreview,namedTemplatePreviewState,
   namedTemplatePreviewCaption,String,customPicto,()=>'<span></span>');
 const html=fn();
 assert.equal(used.at(-1).size,4.25);
 assert.match(used.at(-1).image,/src="blob:real-ink"/);
 assert.match(html,/--width:4\\.25cm/);
 assert.match(html,/class="picto-artwork" style="transform:rotate\\(-32\\.5deg\\);transform-origin:center center"/);
 assert.doesNotMatch(html,/<div class="picto"[^>]*rotate/);
 bank.widthCm="";const count=used.length;
 assert.match(fn(),/Aperçu indisponible/);
 assert.equal(used.length,count,"Refuser une largeur invalide");
 bank.loaded=false;
 assert.match(fn(),/--width:5cm/,"Sans table, largeur 5 cm sur la vraie image, pas de démo");
 assert.equal(used.at(-1).size,5);
 privatePreview.url=null;
 assert.match(fn(),/Choisissez une vraie image/,"Aucune fausse image par défaut");
});
test("L3 : aperçu actualisé au clavier avec légende de l'image réelle",()=>{
 const source=bodyBetween("function adminLive(){","function routineLive(){");
 const captionSource=bodyBetween("function adminRealPreviewCaption(){","function renderAdminTemplate(){");
 const pictoId="11111111-1111-4111-8111-111111111111";
 const bank={loaded:true,widthCm:"4.25",rotationDeg:"15"};
 const privateBank={items:[{id:pictoId,title_fr:"Pomme",title_en:"Apple"}]};
 const privatePreview={id:pictoId,url:"blob:real",loading:false};
 const state={language:"fr"};
 const realCaption=new Function("state","privateBank","privatePreview","adminNamedTemplates",
  "namedTemplatePreviewState","namedTemplatePreviewCaption",captionSource+"\nreturn adminRealPreviewCaption;")(
   state,privateBank,privatePreview,bank,namedTemplatePreviewState,namedTemplatePreviewCaption);
 let drawn="",caption="",placements=0;
 const stage={set innerHTML(v){drawn=v;}};
 const note={set textContent(v){caption=v;}};
 const doc={querySelector(sel){
   return sel==="#admin-stage"?stage:sel==="#admin-preview-caption"?note:null;
 }};
 const fn=new Function("document","adminPreview","layoutArtwork","updateArtFeedback",
   "adminRealPreviewCaption",source+"\nreturn adminLive;")(
     doc,()=>"<div>Réglages actualisés</div>",()=>{placements++;},()=>{},realCaption);
 fn();
 assert.equal(drawn,"<div>Réglages actualisés</div>");
 assert.match(caption,/Pomme · 4\\.25 cm · 15° · aperçu privé/);
 assert.equal(placements,1);
 bank.widthCm="5.75";bank.rotationDeg="-12";fn();
 assert.match(caption,/Pomme · 5\\.75 cm · -12°/);
 assert.equal(placements,2);
 assert.match(app,/adminNamedTemplates\\.widthCm=event\\.target\\.value;adminLive\\(\\)/);
 assert.match(app,/adminNamedTemplates\\.rotationDeg=event\\.target\\.value;adminLive\\(\\)/);
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
