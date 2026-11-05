import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {normalizeEditableDraft,summarizeEditableDraftItems} from "../app/src/client-drafts.js";

const A="44444444-4444-4444-8444-444444444444";
const B="55555555-5555-4555-8555-555555555555";
const C="66666666-6666-4666-8666-666666666666";
const pictos=[
  {id:A,title_fr:"Pause",title_en:"Break",customLabel:"Ma pause",theme:"autonomie",image_path:"items/"+A+".png"},
  {id:B,title_fr:"Bonjour",title_en:"Hello",customLabel:null,theme:"social",image_path:"items/"+B+".png"},
  {id:C,title_fr:"Doudou",title_en:null,customLabel:null,theme:"objets",image_path:"items/"+C+".png"}
];
const settings={title:"Ma routine",widthCm:"5",paper:"letter",columns:"3"};
function draft(kind="routine",items=pictos){
  return {kind,content:normalizeEditableDraft({kind,items,settings}).content};
}

test("L'aperçu suit l'ordre des cartes et priorise les légendes du propriétaire",()=>{
  const source=draft();
  const before=structuredClone(source);
  assert.deepEqual(summarizeEditableDraftItems(source,"fr"),{
    count:3,labels:["Ma pause","Bonjour","Doudou"]
  });
  assert.deepEqual(summarizeEditableDraftItems(source,"en"),{
    count:3,labels:["Ma pause","Hello","Doudou"]
  });
  assert.deepEqual(source,before,"Un aperçu ne modifie jamais le brouillon");
});

test("Tableau vide : zéro pictogramme; tableaux et routines ont la même lecture",()=>{
  assert.deepEqual(summarizeEditableDraftItems(draft("board",[]),"en"),{count:0,labels:[]});
  assert.deepEqual(summarizeEditableDraftItems(draft("board"),"fr").labels,
    ["Ma pause","Bonjour","Doudou"]);
});

test("Rejeter une langue, un document ou une fiche mal formée",()=>{
  assert.throws(()=>summarizeEditableDraftItems(draft(),"de"),/invalide/);
  assert.throws(()=>summarizeEditableDraftItems({kind:"pdf",content:{items:pictos}}),/invalide/);
  assert.throws(()=>summarizeEditableDraftItems({kind:"routine",content:{items:null}}),/invalide/);
  assert.throws(()=>summarizeEditableDraftItems({kind:"routine",content:{items:[{title_fr:""}]}}),/invalide/);
  assert.throws(()=>summarizeEditableDraftItems({kind:"routine",content:{items:Array(11).fill(pictos[0])}}),/invalide/);
});

test("Mes brouillons : détails accessibles repliables, comptage FR/EN et échappement",()=>{
  const app=readFileSync(new URL("../app/src/app.js",import.meta.url),"utf8");
  const css=readFileSync(new URL("../app/src/styles.css",import.meta.url),"utf8");
  assert.match(app,/summarizeEditableDraftItems\(doc,state\.language\)/);
  assert.match(app,/preview\.count===1\?'pictogramme':'pictogrammes'/);
  assert.match(app,/preview\.count===1\?'pictogram':'pictograms'/);
  assert.match(app,/<details class="pa-drafts-preview"><summary>/);
  assert.match(app,/preview\.labels\.map\(label=>'<li>'\+esc\(label\)/);
  assert.match(app,/<\/ol><\/details>/);
  assert.match(css,/\.pa-drafts-preview summary:focus-visible/);
  assert.match(css,/\.pa-drafts-preview summary\{cursor:pointer;min-height:44px/);
});
