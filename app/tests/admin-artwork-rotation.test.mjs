import {DEFAULT_PRESET,scaleMetrics} from "../src/core.js";
import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {
 validateArtworkRotation,rotatedInkCanvasGeometry,makeRotatedPrivatePng,
 privateInkPreviewVariants,renderPrivateInkComparison,privateInkDraftMetadata
} from "../src/admin-artwork-rotation.js";

const app=readFileSync(new URL("../src/app.js",import.meta.url),"utf8");
const moduleSource=readFileSync(new URL("../src/admin-artwork-rotation.js",import.meta.url),"utf8");
const PNG=Uint8Array.from([137,80,78,71,13,10,26,10,0,0,0,0,0,0]);

test("Rotation privée : valeurs entières ±180 seulement, centrées sur l'encre",()=>{
 for(const v of [-180,-90,0,45,90,180])assert.equal(validateArtworkRotation(v),v);
 for(const v of [NaN,Infinity,181,-181,"15",0.5,null,{},undefined])
  assert.throws(()=>validateArtworkRotation(v),/Rotation/);
 const straight=rotatedInkCanvasGeometry(100,50,0);
 assert.deepEqual({width:straight.width,height:straight.height},{width:104,height:54});
 const quarter=rotatedInkCanvasGeometry(100,50,90);
 assert.ok(quarter.width>=54&&quarter.width<=55);
 assert.ok(quarter.height>=104&&quarter.height<=105);
 assert.equal(quarter.radians,Math.PI/2);
 for(const [w,h] of [[0,10],[10,0],[1201,10],[10,1201],[Infinity,5],["12",20]])
  assert.throws(()=>rotatedInkCanvasGeometry(w,h,30),/Dimensions/);
});
test("Exporter une rotation privée produit un nouveau PNG et referme le bitmap",async()=>{
 const previous={createImageBitmap:globalThis.createImageBitmap,
  document:globalThis.document,File:globalThis.File};
 let closed=0,created=0,rotated=0,drawn=0,origin=null;
 try{
  globalThis.createImageBitmap=async blob=>{
   assert.equal(blob.type,"image/png");
   return {width:100,height:50,close(){closed++;}};
  };
  globalThis.document={createElement(name){
   assert.equal(name,"canvas");created++;
   const canvas={width:0,height:0,getContext(type){
    assert.equal(type,"2d");
    return {clearRect(){},translate(x,y){origin=[x,y];},
      rotate(angle){rotated=angle;},drawImage(_bitmap,x,y){
       assert.equal(x,-50);assert.equal(y,-25);drawn++;}};
   },toBlob(fn,type){
    assert.equal(type,"image/png");
    fn(new Blob([PNG],{type:"image/png"}));
   }};
   return canvas;
  }};
  globalThis.File=class MockFile extends Blob{
   constructor(parts,name,{type}={}){super(parts,{type});this.name=name;}
  };
  const input=new Blob([PNG],{type:"image/png"});
  const rotatedFile=await makeRotatedPrivatePng(input,90,"École Pomme");
  assert.equal(rotatedFile.type,"image/png");
  assert.equal(rotatedFile.name,"ecole-pomme-rotation-90.png");
  assert.equal(created,1);assert.equal(drawn,1);assert.equal(closed,1);
  assert.equal(rotated,Math.PI/2);
  assert.ok(origin[0]>0&&origin[1]>0);
 }finally{
  for(const [key,value] of Object.entries(previous)){
   if(value===undefined)delete globalThis[key];else globalThis[key]=value;
  }
 }
});
test("PNG interdit, navigateur incompatible ou retour trop volumineux : aucun faux enregistrement",async()=>{
 await assert.rejects(()=>makeRotatedPrivatePng(new Blob(["<svg>"],{type:"image/svg+xml"}),45),
   /PNG privé/);
 await assert.rejects(()=>makeRotatedPrivatePng(new Blob([PNG],{type:"image/png"}),15),
   /navigateur/);
});
test("L'éditeur agit sur un nouveau brouillon après confirmation explicite, jamais sur l'original",()=>{
 assert.match(app,/data-input="admin-art-rotation"/);
 assert.match(app,/min="-180" max="180" step="1"/);
 assert.match(app,/data-admin-ink-preview/);
 assert.match(app,/transform-origin:center/);
 assert.match(app,/validateArtworkRotation\(angle\)/);
 assert.match(app,/if\(a==="admin-art-rotation-save"\)/);
 assert.match(app,/window\.confirm/);
 assert.match(app,/makeRotatedPrivatePng\(inkBlob,angle,asset\.title_fr\)/);
 assert.match(app,/await importPrivateDraft\(client,uid,file/);
 assert.match(app,/privateInkDraftMetadata\(asset,angle\)/);
 assert.match(app,/state\.toast=message/);
 const branch=app.slice(app.indexOf('if(a==="admin-art-rotation-save")'),
  app.indexOf('if(a==="download-admin-preview")'));
 assert.doesNotMatch(branch,/\.update\(|\.upsert\(|archivePdf|setAdminTemplatePublication|publishCatalog|remove\(/);
 assert.match(branch,/adjustBusy=true/);
 assert.match(branch,/privatePreview\.request===ticket/);
 assert.match(moduleSource,/export async function makeRotatedPrivatePng/);
});

test("Comparateur du vrai PNG : carré coloré, sans contour, portrait, même encre",()=>{
 const original={...DEFAULT_PRESET};
 const variants=privateInkPreviewVariants(original);
 assert.deepEqual(variants.map(v=>v.key),["square-color","square-plain","portrait-color"]);
 assert.deepEqual(variants.map(v=>v.shape),["square","square","portrait"]);
 assert.deepEqual(variants.map(v=>v.colored),[true,false,true]);
 assert.ok(variants.every(v=>v.widthCm===5));
 assert.deepEqual(original,DEFAULT_PRESET,"Le gabarit courant ne doit jamais changer");
 for(const v of variants){
  assert.notEqual(v.preset,original);
  assert.equal(v.preset.shape,v.shape);
  assert.equal(v.preset.colored,v.colored);
 }
 variants[0].preset.bandMm=18;
 assert.equal(DEFAULT_PRESET.bandMm,12);
 assert.throws(()=>privateInkPreviewVariants({shape:"triangle"}),/invalides/);
});
test("Trois rendus FR/EN du même vrai dessin avec rotation et mesures fidèles",()=>{
 const calls=[];
 const render=({fr=true,rotationDeg=35,asset={title_fr:"Pomme",title_en:"Apple"},inkUrl="blob:https://local.example/123"}={})=>
  renderPrivateInkComparison({
   asset,inkUrl,fr,rotationDeg,preset:DEFAULT_PRESET,
   scaleMetrics,fmtRaw:n=>Number(n).toFixed(3),
   customPicto:(item,preset,width)=>{
    calls.push({item,preset,width});
    return '<div class="picto" data-shape="'+preset.shape+'" data-border="'+preset.colored+'">'+item.image+'</div>';
   }
  });
 const fr=render();
 assert.equal(calls.length,3);
 assert.equal((fr.match(/data-private-preview=/g)||[]).length,3);
 assert.equal((fr.match(/data-admin-ink-preview/g)||[]).length,3);
 assert.equal((fr.match(/rotate\(35deg\)/g)||[]).length,3);
 assert.match(fr,/Carré · contour coloré/);
 assert.match(fr,/Carré · sans contour coloré/);
 assert.match(fr,/Portrait · contour coloré/);
 assert.match(fr,/height:6\.750cm/);
 assert.match(fr,/height:5\.000cm/);
 assert.match(fr,/class="color-shell no-color"/);
 assert.equal(calls[0].item,calls[1].item,"Les trois cartes sont le même dessin réel");
 assert.deepEqual(calls.map(c=>c.width),[5,5,5]);
 assert.equal(calls[2].preset.shape,"portrait");
 const en=render({fr:false,rotationDeg:-90});
 assert.match(en,/Square · no colored border/);
 assert.match(en,/Portrait · colored border/);
 assert.equal((en.match(/rotate\(-90deg\)/g)||[]).length,3);
});
test("Comparer des PNG privés ne permet ni URL dangereuse ni texte HTML injecté",()=>{
 let called=0;
 const args={
  asset:{title_fr:"<img src=x onerror=alert(1)>"},
  inkUrl:"blob:https://local.example/123",rotationDeg:0,preset:DEFAULT_PRESET,
  customPicto:(item)=>{called++;return '<div class="picto">'+item.image+'</div>';},
  scaleMetrics,fmtRaw:n=>Number(n).toFixed(3)
 };
 const html=renderPrivateInkComparison(args);
 assert.equal(called,3);
 assert.doesNotMatch(html,/<img src=x onerror/);
 assert.match(html,/data-admin-ink-preview/);
 for(const invalid of [{inkUrl:"https://example.com/image.png"},{rotationDeg:45.5},
    {asset:null},{preset:{...DEFAULT_PRESET,shape:"evil"}}]){
  assert.throws(()=>renderPrivateInkComparison({...args,...invalid}),/invalide|indisponible/i);
 }
});
test("Le curseur met à jour TOUS les aperçus privés, sans publier ni créer de gabarit",()=>{
 assert.match(app,/renderPrivateInkComparison\(\{/);
 assert.match(app,/privatePreview\.inkUrl,rotationDeg:privatePreview\.rotationDeg/);
 assert.match(app,/for\(const ink of root\.querySelectorAll\("\[data-admin-ink-preview\]"\)\)/);
 const block=app.slice(app.indexOf('const privateInkCard='),app.indexOf('const adminTemplatePanel=',app.indexOf('const privateInkCard=')));
 assert.match(block,/data-input="admin-art-rotation"/);
 assert.match(block,/data-action="admin-art-rotation-save"/);
 assert.doesNotMatch(block,/\.upsert\(|\.update\(|setAdminTemplatePublication\(/);
});

test("Le dessin recadré à 0° crée un vrai nouveau PNG privé, sans rotation forcée",async()=>{
 assert.deepEqual(privateInkDraftMetadata({
  title_fr:"Se laver les mains",title_en:"Wash hands",theme:"hygiene"
 },0),{
  titleFr:"Se laver les mains (recadré)",titleEn:"Wash hands (cropped)",theme:"hygiene"
 });
 assert.deepEqual(privateInkDraftMetadata({
  title_fr:"Pomme",title_en:"Apple",theme:"alimentation"
 },-45),{
  titleFr:"Pomme (rotation -45°)",titleEn:"Apple (rotated -45°)",theme:"alimentation"
 });
 assert.throws(()=>privateInkDraftMetadata({title_fr:""},0),/Fiche privée/);
 assert.throws(()=>privateInkDraftMetadata({title_fr:"Pomme"},0.5),/Rotation/);

 const old={createImageBitmap:globalThis.createImageBitmap,
  document:globalThis.document,File:globalThis.File};
 let bitmapClosed=0,angleValue=null,draws=0;
 try{
  globalThis.createImageBitmap=async()=>({
   width:40,height:50,close(){bitmapClosed++;}
  });
  globalThis.document={createElement:()=>({
   width:0,height:0,
   getContext:()=>({clearRect(){},translate(){},
    rotate(radians){angleValue=radians;},drawImage(){draws++;}}),
   toBlob:done=>done(new Blob([PNG],{type:"image/png"}))
  })};
  globalThis.File=class MockFile extends Blob{
   constructor(data,name,{type}={}){super(data,{type});this.name=name;}
  };
  const prepared=await makeRotatedPrivatePng(new Blob([PNG],{type:"image/png"}),0,"École");
  assert.equal(prepared.name,"ecole-recadre.png");
  assert.equal(prepared.type,"image/png");
  assert.equal(angleValue,0);
  assert.equal(draws,1);
  assert.equal(bitmapClosed,1);
 }finally{
  for(const [key,value] of Object.entries(old)){
   if(value===undefined)delete globalThis[key];else globalThis[key]=value;
  }
 }
});
test("L'interface propose le recadrage même à 0°, sans changer l'original",()=>{
 const section=app.slice(app.indexOf('const privateInkCard='),app.indexOf('const adminTemplatePanel='));
 assert.match(section,/Créer un brouillon recadré/);
 assert.match(section,/Create cropped private draft/);
 assert.match(section,/même à 0°/);
 assert.match(section,/data-action="admin-art-rotation-save" class="btn btn-primary btn-small"'\+\(privatePreview\.adjustBusy\?' disabled'/);
 const action=app.slice(app.indexOf('if(a==="admin-art-rotation-save")'),
  app.indexOf('if(a==="download-admin-preview")'));
 assert.match(action,/angle===0\?"Créer un brouillon privé/);
 assert.match(action,/angle===0\?"Dessin recadré/);
 assert.match(action,/await makeRotatedPrivatePng\(inkBlob,angle,asset\.title_fr\)/);
 assert.match(action,/await importPrivateDraft\(client,uid,file,privateInkDraftMetadata\(asset,angle\)\)/);
 assert.match(action,/privatePreview\.request===ticket/);
 assert.doesNotMatch(action,/privatePreview\.rotationDeg===0\)return/);
 assert.doesNotMatch(action,/\.upsert\(|\.update\(/);
 const slider=app.slice(app.indexOf('if(event.target.dataset.input==="admin-art-rotation")'),
  app.indexOf('if(canOpenAdmin()&&state.adminTab==="templates"'));
 assert.match(slider,/save\.disabled=false/);
 assert.match(slider,/Créer un brouillon recadré/);
});
