import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {listPublishedCatalog} from "../src/catalog.js";
const uid="11111111-1111-4111-8111-111111111111";
const assetId="33333333-3333-4333-8333-333333333333";
const row={id:assetId,title_fr:"toilette",title_en:"bathroom",theme:"hygiene",
 image_path:"items/"+assetId+".png",published_at:"2026-10-28T12:00:00Z"};
function user(id=uid){return {auth:{getUser:async()=>({data:{user:id?{id}:null},error:null})}};}

// Teste le code ESM réellement livré sur le site Pages, jamais un fake catalogue.
test("L2: catégories principales restent consultables si la projection secondaire n'est pas installée",async()=>{
 const calls=[],reads=[];
 const client={...user(),from(table){
   calls.push(["from",table]);
   assert.equal(table,"pictau_catalog_items","Jamais de requête vers la banque privée");
   return {select(columns,opts){
     calls.push(["select",columns,opts]);
     const q={
       eq(k,v){calls.push(["eq",k,v]);return this;},
       or(v){calls.push(["or",v]);return this;},
       order(k,v){calls.push(["order",k,v]);return this;},
       range(first,last){
         calls.push(["range",first,last]);
         if(columns.includes("pictau_published_theme_links"))
           return Promise.resolve({data:null,count:null,error:{
             code:"PGRST200",
             message:"Could not find a relationship between pictau_catalog_items and pictau_published_theme_links in schema cache"
           }});
         reads.push(columns);
         return Promise.resolve({data:[row],count:1,error:null});
       }
     };
     return q;
   }};
 }};
 const result=await listPublishedCatalog(client,uid,{
   theme:"hygiene",query:"toilette",sort:"name",language:"en"
 });
 assert.equal(result.categoryCoverage,"primary");
 assert.deepEqual(result.items,[row]);
 assert.equal(result.total,1);
 assert.deepEqual(reads,["id,title_fr,title_en,theme,image_path,published_at"]);
 assert.deepEqual(calls.filter(x=>x[0]==="eq"),[
   ["eq","published_filter.theme_code","hygiene"],["eq","theme","hygiene"]
 ]);
 assert.equal(calls.filter(x=>x[0]==="or").length,2,
   "Recherche sur le serveur avant pagination dans les deux requêtes");
 assert.deepEqual(calls.filter(x=>x[0]==="order"&&x[1]==="title_en").map(x=>x[2]),[
   {ascending:true,nullsFirst:false},{ascending:true,nullsFirst:false}
 ]);
 assert.deepEqual(calls.filter(x=>x[0]==="range").map(x=>x.slice(1)),[[0,23],[0,23]]);
});

test("L2: une erreur RLS, réseau ou de relation non ciblée ne doit JAMAIS être cachée",async()=>{
 for(const err of [
   {code:"42501",message:"permission denied for table pictau_published_theme_links"},
   {code:"PGRST200",message:"relationship to private_drafts does not exist"},
   {code:"PGRST205",message:"table pictau_published_theme_links missing"},
   {code:"503",message:"network offline"},
   {code:"PGRST201",message:"ambiguous relationship"}
 ]){
   let requests=0;
   const client={...user(),from(table){
     assert.equal(table,"pictau_catalog_items");
     requests++;
     return {select(){return{
       eq(){return this;},order(){return this;},
       range:async()=>({data:null,count:null,error:err})
     };}};
   }};
   await assert.rejects(listPublishedCatalog(client,uid,{theme:"hygiene"}),x=>x===err);
   assert.equal(requests,1,"Aucun repli en réponse à "+err.code);
 }
});

test("L2: réauthentification entre la requête manquante et le repli, aucun résultat incohérent accepté",async()=>{
 let checked=0,queries=0;
 const client={auth:{getUser:async()=>{
   checked++;return{data:{user:checked<=1?{id:uid}:{id:"22222222-2222-4222-8222-222222222222"}},error:null};
 }},from(){queries++;return{select(){return{
   eq(){return this;},order(){return this;},
   range:async()=>({error:{code:"PGRST200",
     message:"pictau_published_theme_links relation missing"}})
 };}}}};
 await assert.rejects(listPublishedCatalog(client,uid,{theme:"hygiene"}),/session a changé/i);
 assert.equal(queries,1,"La session révoquée empêche une seconde requête");

 const stale={...user(),from(){return{select(fields){return{
   eq(){return this;},order(){return this;},
   range:async()=>fields.includes("pictau_published_theme_links")
     ?{error:{code:"PGRST200",message:"pictau_published_theme_links missing"}}
     :{data:[{...row,image_path:"imports/private.png"}],count:1,error:null}
 };}}}};
 await assert.rejects(listPublishedCatalog(stale,uid,{theme:"hygiene"}),/stockage approuvé/);
});

test("L2: avertissement FR/EN seulement si le filtre montre la catégorie principale",()=>{
 const app=readFileSync(new URL("../src/app.js",import.meta.url),"utf8");
 const library=app.split("function renderClientLibrary(){")[1]?.split("function renderClientUsed(){")[0]||"";
 const fetch=app.split("async function fetchPublishedCatalog(){")[1]?.split("let catalogImageObserver")[0]||"";
 const reset=app.split("function clearPublishedCatalog(){")[1]?.split("async function fetchPublishedCatalog(){")[0]||"";
 assert.match(library,/state\.clientCategory&&f\.loaded&&f\.categoryCoverage==="primary"/);
 assert.match(library,/seuls les pictogrammes dont c’est la catégorie principale/);
 assert.match(library,/only pictograms with this as their primary category/);
 assert.match(library,/role="status"/);
 assert.match(fetch,/publishedCatalog\.categoryCoverage=result\.categoryCoverage\|\|"all"/);
 assert.match(fetch,/publishedCatalog\.categoryCoverage="all"/);
 assert.match(reset,/publishedCatalog\.categoryCoverage="all"/);
 assert.doesNotMatch(library,/pictau_assets|pictau_asset_themes/);
});

