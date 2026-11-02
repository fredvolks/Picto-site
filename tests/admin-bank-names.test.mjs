import test from "node:test";
import assert from "node:assert/strict";
import {normalizeSheetNames,saveAdminSheetNames} from "../app/src/admin-sheet-names.js";
const uid="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const id="11111111-1111-4111-8111-111111111111";
function mock({row,owner=uid,denied=false}={}){
 const calls=[];
 const chain={
  eq(...args){calls.push(["eq",...args]);return this;},
  is(...args){calls.push(["is",...args]);return this;},
  update(payload){calls.push(["update",payload]);return this;},
  select(...args){calls.push(["select",...args]);return this;},
  async maybeSingle(){
    return {data:denied?null:(calls.some(x=>x[0]==="update")?row:{user_id:uid}),error:null};
  }
 };
 return {
  calls,
  auth:{async getUser(){return {data:{user:{id:owner}},error:null};}},
  from(name){calls.push(["from",name]);return chain;}
 };
}
test("Validation FR obligatoire et champ EN facultatif",()=>{
 assert.deepEqual({...normalizeSheetNames({adminName:"  Bonjour  ",titleFr:" bonjour ",titleEn:"hello  "})},
   {admin_name:"Bonjour",title_fr:"bonjour",title_en:"hello"});
 assert.throws(()=>normalizeSheetNames({adminName:"",titleFr:"",titleEn:""}),/obligatoire|invalide/);
});
test("Une seule requête UPDATE modifie les trois noms avec contrôle de concurrence",async()=>{
 const db=mock({row:{id,created_by:uid,status:"draft",admin_name:"Bonjour",title_fr:"bonjour",title_en:"hello"}});
 const result=await saveAdminSheetNames(db,uid,id,{admin_name:null,title_fr:"ancien",title_en:null},
   {adminName:"Bonjour",titleFr:"bonjour",titleEn:"hello"});
 assert.equal(result.title_en,"hello");
 assert.equal(db.calls.filter(x=>x[0]==="update").length,1);
 const update=db.calls.find(x=>x[0]==="update")[1];
 assert.deepEqual(update,{admin_name:"Bonjour",title_fr:"bonjour",title_en:"hello"});
 assert.ok(db.calls.some(x=>x[0]==="eq"&&x[1]==="status"&&x[2]==="draft"));
 assert.ok(db.calls.some(x=>x[0]==="is"&&x[1]==="published_at"&&x[2]===null));
});
test("Une session différente est refusée avant écriture",async()=>{
 const db=mock({owner:"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"});
 await assert.rejects(saveAdminSheetNames(db,uid,id,{title_fr:"a"},{adminName:"a",titleFr:"a",titleEn:""}),/Session/);
 assert.equal(db.calls.filter(x=>x[0]==="update").length,0);
});
test("Un UPDATE sans ligne ne doit jamais annoncer une sauvegarde",async()=>{
 const db=mock({denied:true});
 await assert.rejects(saveAdminSheetNames(db,uid,id,{admin_name:null,title_fr:"ancien",title_en:null},
 {adminName:"Nouveau",titleFr:"nouveau",titleEn:"new"}),/refusée|modifiée/);
});
