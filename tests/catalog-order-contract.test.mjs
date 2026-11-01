import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {moveCatalogChoice,selectVisibleCatalogPage,loadApprovedSelection} from "../app/src/catalog.js";

const uid="11111111-1111-4111-8111-111111111111";
const ids=[1,2,3].map(n=>"33333333-3333-4333-8333-"+String(n).padStart(12,"0"));
const row=id=>({id,title_fr:"Image officielle",title_en:"Official image",theme:"autonomie",
  image_path:"items/"+id+".png",published_at:"2026-11-01T13:00:00Z"});
test("le client déplace des choix de pages distinctes sans changer l'ordre d'origine",async()=>{
 const origin=selectVisibleCatalogPage(new Map(),ids.map(row)).selected;
 const shifted=moveCatalogChoice(moveCatalogChoice(origin,ids[2],-1),ids[2],-1);
 assert.deepEqual([...shifted.keys()],[ids[2],ids[0],ids[1]]);
 assert.deepEqual([...origin.keys()],ids);
 const auth={auth:{getUser:async()=>({data:{user:{id:uid}},error:null})},
   from(table){assert.equal(table,"pictau_catalog_items");return {select(){return {in(col,selected){
     assert.equal(col,"id");return Promise.resolve({data:selected.map(row).reverse(),error:null});
   }}}}}};
 const rows=await loadApprovedSelection(auth,uid,[...shifted.keys()]);
 assert.deepEqual(rows.map(x=>x.id),[ids[2],ids[0],ids[1]]);
});
test("choix absent, direction invalide et limites : pas de mutation",()=>{
 const entries=selectVisibleCatalogPage(new Map(),ids.map(row)).selected;
 assert.deepEqual([...moveCatalogChoice(entries,ids[0],-1).keys()],ids);
 assert.throws(()=>moveCatalogChoice(entries,ids[0],0),/invalide/);
 assert.throws(()=>moveCatalogChoice(entries,"wrong",1),/invalide/);
 assert.deepEqual([...entries.keys()],ids);
});
test("la page connexion gelée n'est pas réécrite : commandes uniquement dans le catalogue",()=>{
 const app=readFileSync(new URL("../app/src/app.js",import.meta.url),"utf8");
 const css=readFileSync(new URL("../app/src/styles.css",import.meta.url),"utf8");
 assert.match(app,/data-action="catalog-bulk-move"/);
 assert.match(app,/moveCatalogChoice\(publishedCatalog\.bulkSelected,id,direction\)/);
 assert.match(app,/data-direction="-1"/);
 assert.match(app,/data-direction="1"/);
 assert.match(css,/\.pa-catalog-choice-controls button\{[\s\S]*?width:44px;height:44px/);
});
