import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {listEditableDraftsAvailablePage,listEditableDraftsPage,normalizeEditableDraftFilters} from "../app/src/client-drafts.js";

const uid="11111111-1111-4111-8111-111111111111";
const other="22222222-2222-4222-8222-222222222222";
const mkRow=i=>{
 const title="Routine "+i;
 return {id:i.toString(16).padStart(8,"0")+"-3333-4333-8333-333333333333",
  kind:"routine",title,revision:1,created_at:"2026-10-31T10:00:00Z",updated_at:"2026-10-31T10:00:00Z",
  content:{items:[],settings:{title,widthCm:"3",paper:"letter",columns:"3"}}};
};
function mock({counts=[63],session=uid,revoke=false,partial=false}={}){
 let call=0,authCalls=0;const ops=[],ranges=[];
 const selection={
  eq(field,value){ops.push(["eq",field,value]);return selection;},
  ilike(field,value){ops.push(["ilike",field,value]);return selection;},
  order(field,options){ops.push(["order",field,options]);return selection;},
  async range(start,end){
   ranges.push([start,end]);
   const count=counts[Math.min(call++,counts.length-1)];
   const len=Math.max(0,Math.min(end+1,count)-start);
   const data=Array.from({length:len},(_,i)=>mkRow(start+i+1));
   return {data:partial?data.slice(0,Math.max(0,len-1)):data,count,error:null};
  }
 };
 const client={
  auth:{async getUser(){authCalls++;return {data:{user:{id:revoke&&authCalls>=2?other:session}},error:null};}},
  from(table){ops.push(["from",table]);return{
   select(columns,settings){ops.push(["select",columns,settings]);return selection;}
  }}
 };
 return {client,ops,ranges};
}
test("Filtres : validation stricte avant accès à la banque",async()=>{
 assert.deepEqual(normalizeEditableDraftFilters({kind:"board",query:"  Soir  ",page:2}),{page:2,kind:"board",query:"Soir",sort:"recent"});
 assert.deepEqual(normalizeEditableDraftFilters(),{page:0,kind:"all",query:"",sort:"recent"});
 for(const f of [{kind:"admin"},{query:"x".repeat(81)},{query:"ligne\n2"},{sort:"invalid"},{page:-1},{page:1.4}])
   assert.throws(()=>normalizeEditableDraftFilters(f),/invalide/);
 const m=mock();
 await assert.rejects(listEditableDraftsPage(m.client,uid,{kind:"published"}),/invalide/);
 assert.equal(m.ops.length,0);
});
test("Type Tableau : filtre serveur propriétaire avant pagination",async()=>{
 const m=mock({counts:[31]});
 const page=await listEditableDraftsAvailablePage(m.client,uid,{kind:"board",page:1});
 assert.equal(page.page,1);assert.equal(page.total,31);assert.equal(page.items.length,1);
 assert.ok(m.ops.some(x=>x[0]==="eq"&&x[1]==="owner_id"&&x[2]===uid));
 assert.ok(m.ops.some(x=>x[0]==="eq"&&x[1]==="kind"&&x[2]==="board"));
 assert.equal(m.ops.some(x=>x[0]==="ilike"),false);
 assert.deepEqual(m.ranges,[[30,59]]);
});
test("Tri global : date et nom sont ordonnés au serveur avec ID stable",async()=>{
 for(const [sort,column,ascending] of [
  ["recent","updated_at",false],["oldest","updated_at",true],
  ["title-asc","title",true],["title-desc","title",false]]){
  const m=mock({counts:[61]});
  await listEditableDraftsPage(m.client,uid,{sort,page:1,kind:"routine",query:"soir"});
  assert.deepEqual(m.ops.filter(x=>x[0]==="order"),[
    ["order",column,{ascending}],["order","id",{ascending:true}]]);
  assert.deepEqual(m.ranges,[[30,59]]);
  assert.ok(m.ops.some(x=>x[0]==="eq"&&x[1]==="kind"&&x[2]==="routine"));
  assert.ok(m.ops.some(x=>x[0]==="ilike"&&x[2]==="%soir%"));
 }
});
test("Recherche : les jokers %, _ et antislash deviennent du texte littéral",async()=>{
 const m=mock({counts:[2]});
 await listEditableDraftsAvailablePage(m.client,uid,{page:0,query:"  Matin_%\\ "});
 const term=m.ops.find(x=>x[0]==="ilike");
 assert.deepEqual(term,["ilike","title","%Matin\\_\\%\\\\%"]);
 assert.ok(m.ops.some(x=>x[0]==="eq"&&x[1]==="owner_id"));
});
test("Recherche conservée lors du retour sur la dernière page valide",async()=>{
 const m=mock({counts:[61,31,31]});
 const page=await listEditableDraftsAvailablePage(m.client,uid,{page:4,kind:"routine",query:"Soir",sort:"title-desc"});
 assert.equal(page.page,1);assert.equal(page.items.length,1);
 assert.deepEqual(m.ranges,[[120,149],[60,89],[30,59]]);
 assert.equal(m.ops.filter(x=>x[0]==="eq"&&x[1]==="kind").length,3);
 assert.equal(m.ops.filter(x=>x[0]==="ilike"&&x[2]==="%Soir%").length,3);
 assert.equal(m.ops.filter(x=>x[0]==="order"&&x[1]==="title"&&x[2]?.ascending===false).length,3);
});
test("Filtres : zéro résultat réel vs réponse serveur incomplète",async()=>{
 const none=mock({counts:[0]});
 const result=await listEditableDraftsAvailablePage(none.client,uid,{query:"Introuvable",kind:"routine",page:3});
 assert.equal(result.page,0);assert.equal(result.total,0);assert.deepEqual(result.items,[]);
 const broken=mock({counts:[31,31,31],partial:true});
 await assert.rejects(listEditableDraftsAvailablePage(broken.client,uid,{query:"Soir"}),/Actualisez Mes brouillons/);
 assert.equal(broken.ranges.length,3);
});
test("Session étrangère ou révoquée : aucun résultat filtré",async()=>{
 const stranger=mock({session:other});
 await assert.rejects(listEditableDraftsAvailablePage(stranger.client,uid,{query:"test"}),/Session modifiée/);
 assert.equal(stranger.ops.length,0);
 const revoked=mock({counts:[1],revoke:true});
 await assert.rejects(listEditableDraftsAvailablePage(revoked.client,uid,{kind:"board"}),/Session modifiée/);
});
test("Interface FR/EN : recherche, type, état vide et réinitialisation",()=>{
 const app=readFileSync(new URL("../app/src/app.js",import.meta.url),"utf8");
 const css=readFileSync(new URL("../app/src/styles.css",import.meta.url),"utf8");
 for(const snippet of ['data-form="draft-filter"','data-action="draft-filter-reset"',
  'name="kind"','Rechercher un brouillon','Search drafts','Type de support','Document type',
  'Aucun brouillon ne correspond à votre recherche','No drafts match your search','Tout afficher','Show all',
  'name="sort"','Trier les brouillons','Sort drafts','Modifiés récemment','Recently edited',
  'Plus anciens','Oldest first','Nom A à Z','Name Z to A'])
  assert.ok(app.includes(snippet),"Libellé/contrôle manquant: "+snippet);
 assert.match(app,/editableDrafts\.page=0;editableDrafts\.message=""/);
 assert.match(app,/listEditableDraftsAvailablePage\(client,uid,\{page:editableDrafts\.page,kind:editableDrafts\.kind,query:editableDrafts\.query,sort:editableDrafts\.sort\}\)/);
 assert.match(css,/\.pa-drafts-filter/);
 assert.match(css,/@media\(max-width:480px\)/);
});
