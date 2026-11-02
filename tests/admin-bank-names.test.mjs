import test from "node:test";
import assert from "node:assert/strict";
import {normalizeSheetNames,saveAdminSheetNames} from "../app/src/admin-sheet-names.js";
const uid="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const id="11111111-1111-4111-8111-111111111111";
function mock({row,owner=uid,denied=false}={}){
 const calls=[];let table="";
 const chain={
  eq(...args){calls.push(["eq",...args]);return this;},
  is(...args){calls.push(["is",...args]);return this;},
  update(payload){calls.push(["update",payload]);return this;},
  select(...args){calls.push(["select",...args]);return this;},
  async maybeSingle(){
    return {data:table==="pictau_admins"?{user_id:uid}:(denied?null:row),error:null};
  }
 };
 return {
  calls,
  auth:{async getUser(){return {data:{user:{id:owner}},error:null};}},
  from(name){table=name;calls.push(["from",name]);return chain;}
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

function uncertainSave({saved=true,transport=true,published=false,sessionRevoked=false}={}){
  let calls=0,authReads=0,assetReads=0;
  const next={id,created_by:uid,status:"draft",published_at:published?"2026-11-02T00:00:00Z":null,
    admin_name:"École",title_fr:saved?"école":"ancien",title_en:"school"};
  const client={
    auth:{async getUser(){authReads++;return {error:null,data:{user:{id:sessionRevoked&&authReads>=3?
      "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb":uid}}};}},
    from(table){
      const query={
        eq(){return this;},is(){return this;},
        update(){calls++;return this;},select(){return this;},
        async maybeSingle(){
          if(table==="pictau_admins")return {data:{user_id:uid},error:null};
          if(calls===1&&++assetReads===1){
            if(transport)throw new TypeError("Failed to fetch");
            return {data:null,error:{status:403,message:"Permission denied",code:"42501"}};
          }
          return {data:next,error:null};
        }
      };
      return query;
    }
  };
  return {client,getWrites:()=>calls};
}
const oldNames={admin_name:"École",title_fr:"ancien",title_en:"school"};
const newNames={adminName:"École",titleFr:"école",titleEn:"school"};
test("Réponse réseau perdue après UPDATE : relire le brouillon, confirmer sans deuxième écriture",async()=>{
  const {client,getWrites}=uncertainSave();
  const result=await saveAdminSheetNames(client,uid,id,oldNames,newNames);
  assert.equal(result.title_fr,"école");
  assert.equal(getWrites(),1);
});
test("Réseau perdu et serveur non modifié : aucune fausse confirmation",async()=>{
  const {client,getWrites}=uncertainSave({saved:false});
  await assert.rejects(saveAdminSheetNames(client,uid,id,oldNames,newNames),/non confirmée/);
  assert.equal(getWrites(),1);
});
test("Erreur définitive RLS : ne pas convertir en succès même si la relecture aurait les valeurs",async()=>{
  const {client}=uncertainSave({transport:false});
  await assert.rejects(saveAdminSheetNames(client,uid,id,oldNames,newNames),/Permission denied/);
});
test("La relecture d'un brouillon devenu publié ne vaut jamais confirmation",async()=>{
  const {client}=uncertainSave({published:true});
  await assert.rejects(saveAdminSheetNames(client,uid,id,oldNames,newNames),/non confirmée/);
});
test("Session révoquée entre écriture et relecture : ne jamais confirmer",async()=>{
  const {client}=uncertainSave({sessionRevoked:true});
  await assert.rejects(saveAdminSheetNames(client,uid,id,oldNames,newNames),/non confirmée/);
});
