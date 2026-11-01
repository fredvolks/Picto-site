import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {
 validateArtworkRotation,rotatedInkCanvasGeometry,makeRotatedPrivatePng
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
 assert.match(app,/titleFr:String\(asset\.title_fr/);
 assert.match(app,/state\.toast=message/);
 const branch=app.slice(app.indexOf('if(a==="admin-art-rotation-save")'),
  app.indexOf('if(a==="download-admin-preview")'));
 assert.doesNotMatch(branch,/\.update\(|\.upsert\(|archivePdf|setAdminTemplatePublication|publishCatalog|remove\(/);
 assert.match(branch,/adjustBusy=true/);
 assert.match(branch,/privatePreview\.request===ticket/);
 assert.match(moduleSource,/export async function makeRotatedPrivatePng/);
});
