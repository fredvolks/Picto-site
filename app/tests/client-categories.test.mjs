import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {CLIENT_CATEGORIES,clientCategoryLabel} from "../src/client-categories.js";
import {normalizeCatalogFilters,listPublishedCatalog} from "../src/catalog.js";

// Codes et libellés de pictau_themes contrôlés par SELECT lecture seule
// le 1er novembre 2026. Aucun accès direct client à cette table privée.
const expected=[
  ["actions","Verbes d’action","Action verbs"],
  ["alimentation","Alimentation","Food"],
  ["autonomie","Autonomie","Independence"],
  ["autres","Autres","Other"],
  ["consignes","Consignes","Instructions"],
  ["ecole","École","School"],
  ["etapes","Étapes","Steps"],
  ["hygiene","Hygiène","Hygiene"],
  ["lieux","Lieux","Places"],
  ["loisirs","Loisirs","Leisure"],
  ["objets","Objets significatifs","Meaningful objects"],
  ["sensoriel","Sensoriel","Sensory"],
  ["socialisation","Socialisation","Social skills"],
  ["transport","Transport","Transport"]
];
test("Les quatorze thèmes canoniques sont visibles et sans doublons, en FR et EN",()=>{
 assert.deepEqual(CLIENT_CATEGORIES,expected);
 assert.equal(CLIENT_CATEGORIES.length,14);
 assert.equal(new Set(CLIENT_CATEGORIES.map(item=>item[0])).size,14);
 assert.equal(CLIENT_CATEGORIES.some(row=>row[0]==="emotions"),false,
   "Émotions ne doit pas être affiché avant création par Émilie dans Supabase");
 assert.equal(clientCategoryLabel("etapes","fr"),"Étapes");
 assert.equal(clientCategoryLabel("objets","en"),"Meaningful objects");
 assert.equal(clientCategoryLabel("actions","fr"),"Verbes d’action");
 assert.equal(clientCategoryLabel("socialisation","en"),"Social skills");
});
test("Tous les filtres correspondent aux codes acceptés par le catalogue officiel",()=>{
 for(const [code] of CLIENT_CATEGORIES)
   assert.equal(normalizeCatalogFilters({theme:code}).theme,code);
 assert.throws(()=>normalizeCatalogFilters({theme:"autres;delete"}),/Catégorie invalide/);
 assert.equal(normalizeCatalogFilters({theme:"all"}).theme,"all");
});
test("L'application n'interroge pas la table des thèmes privés pour afficher les catégories",()=>{
 const app=readFileSync(new URL("../src/app.js",import.meta.url),"utf8");
 assert.match(app,/import \{CLIENT_CATEGORIES,clientCategoryLabel\} from "\.\/client-categories\.js";/);
 assert.doesNotMatch(app,/const CLIENT_CATEGORIES=\[/,
   "Une seule source de catégories affichées");
 assert.match(app,/CLIENT_CATEGORIES\.map\(/);
 assert.match(app,/data-action="catalog-clear-filters"/);
 assert.match(app,/data-action="request-open"/);
 assert.match(app,/if\(a==="catalog-clear-filters"/);
 assert.match(app,/state\.clientCategory="";state\.search="";publishedCatalog\.page=0/);
});
test("Le client ne filtre que les fiches approuvées, même si le lien multicatégorie manque",async()=>{
 const uid="11111111-1111-4111-8111-111111111111";
 for(const code of ["etapes","objets","autres","actions"]){
   const tables=[],filters=[];
   const client={
     auth:{async getUser(){return {data:{user:{id:uid}},error:null};}},
     from(table){
       tables.push(table);
       const attempt=tables.length;
       return {select(columns){
         if(attempt===1)assert.match(columns,/pictau_published_theme_links!inner/);
         else assert.doesNotMatch(columns,/pictau_published_theme_links/);
         return {
           eq(col,theme){
             filters.push([col,theme]);
             assert.equal(col,attempt===1?"published_filter.theme_code":"theme");
             assert.equal(theme,code);
             return this;
           },
           order(){return this;},
           async range(){
             if(attempt===1)return {data:null,count:null,error:{
               code:"PGRST200",message:"pictau_published_theme_links relation missing"
             }};
             return {data:[],count:0,error:null};
           }
         };
       }};
     }
   };
   const result=await listPublishedCatalog(client,uid,{theme:code});
   assert.deepEqual(tables,["pictau_catalog_items","pictau_catalog_items"]);
   assert.deepEqual(filters,[
     ["published_filter.theme_code",code],["theme",code]
   ]);
   assert.deepEqual(result.items,[]);
   assert.equal(result.total,0);
   assert.equal(result.categoryCoverage,"primary");
 }
});
test("Si le client perd la session, aucune requête catégorie privée n'est exécutée",async()=>{
 const uid="11111111-1111-4111-8111-111111111111";
 let accesses=0;
 const client={auth:{async getUser(){return {data:{user:null},error:null};}},
   from(){accesses++;throw Error("Un client déconnecté ne devrait pas lire le catalogue");}};
 await assert.rejects(listPublishedCatalog(client,uid,{theme:"objets"}),/session a changé/i);
 assert.equal(accesses,0);
});
