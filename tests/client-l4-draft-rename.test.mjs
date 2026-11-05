import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {normalizeEditableDraft,renameEditableDraft} from "../app/src/client-drafts.js";

const uid="11111111-1111-4111-8111-111111111111";
const other="22222222-2222-4222-8222-222222222222";
const id="33333333-3333-4333-8333-333333333333";
const image="55555555-5555-4555-8555-555555555555";

function mock({kind="routine",session=uid,staleRevision=false,casConflict=false,missing=false}={}){
  const source=normalizeEditableDraft({
    kind,
    items:[{id:image,title_fr:"Pause",title_en:"Break",theme:"autonomie",
      image_path:"items/"+image+".png",customLabel:null}],
    settings:{title:kind==="routine"?"Routine du soir":"Tableau du matin",
      widthCm:"5",paper:"letter",columns:"3"}
  });
  const row={id,owner_id:uid,revision:7,kind,title:source.title,
    content:structuredClone(source.content)};
  let writes=0,operation="",payload=null,conditions=[];
  const before=JSON.stringify(row);
  const query={
    eq(key,val){conditions.push([key,val]);return query;},
    select(){return query;},
    async maybeSingle(){
      if(operation==="read")return {data:missing?null:structuredClone(row),error:null};
      if(operation==="update"){
        if(casConflict)return {data:null,error:null};
        return {data:{...structuredClone(row),revision:8,title:payload.title,
          kind:payload.kind,content:structuredClone(payload.content)},error:null};
      }
      throw Error("Unexpected query");
    }
  };
  const client={
    auth:{async getUser(){return {data:{user:{id:session}},error:null};}},
    from(table){
      assert.equal(table,"pictau_editable_drafts");
      return {
        select(){operation="read";return query;},
        update(value){operation="update";writes++;payload=structuredClone(value);return query;}
      };
    }
  };
  return {client,row,before,conditions,get writes(){return writes;},
    get payload(){return payload;},expectedRevision:staleRevision?6:7};
}

test("Renommer une routine n'altère ni les pictos, ni les réglages ni l'original",async()=>{
  const m=mock();
  const renamed=await renameEditableDraft(m.client,uid,id,7,"  Ma   nouvelle  routine ");
  assert.equal(renamed.title,"Ma nouvelle routine");
  assert.equal(renamed.revision,8);
  assert.equal(renamed.content.settings.title,renamed.title);
  assert.deepEqual(renamed.content.items,m.row.content.items);
  assert.equal(renamed.content.settings.paper,"letter");
  assert.equal(renamed.content.settings.widthCm,"5");
  assert.equal(m.writes,1);
  assert.deepEqual(JSON.parse(m.before),m.row);
  for(const condition of [["owner_id",uid],["id",id],["revision",7]])
    assert.ok(m.conditions.some(x=>x[0]===condition[0]&&x[1]===condition[1]));
});

test("Renommer un tableau garde sa composition",async()=>{
  const m=mock({kind:"board"});
  const result=await renameEditableDraft(m.client,uid,id,7,"Communication du matin");
  assert.equal(result.kind,"board");
  assert.equal(result.title,"Communication du matin");
  assert.equal(result.content.items[0].id,image);
  assert.equal(m.writes,1);
});

test("Nom identique : pas d'écriture ni nouvelle version",async()=>{
  const m=mock();
  const result=await renameEditableDraft(m.client,uid,id,7,"Routine du soir");
  assert.equal(result.revision,7);
  assert.equal(m.writes,0);
});

test("Version périmée ou CAS perdu : aucune réécriture silencieuse",async()=>{
  const old=mock();
  await assert.rejects(
    renameEditableDraft(old.client,uid,id,6,"Nouveau titre"),
    error=>error.code==="DRAFT_REVISION_CONFLICT");
  assert.equal(old.writes,0);
  const race=mock({casConflict:true});
  await assert.rejects(
    renameEditableDraft(race.client,uid,id,7,"Nouveau titre"),
    error=>error.code==="DRAFT_REVISION_CONFLICT");
  assert.equal(race.writes,1);
});

test("Session étrangère, brouillon absent et identifiant invalide : aucune écriture",async()=>{
  const alien=mock({session:other});
  await assert.rejects(renameEditableDraft(alien.client,uid,id,7,"Test"),/Session/);
  assert.equal(alien.writes,0);
  const missing=mock({missing:true});
  await assert.rejects(renameEditableDraft(missing.client,uid,id,7,"Test"),
    error=>error.code==="DRAFT_NOT_FOUND");
  assert.equal(missing.writes,0);
  const invalid=mock();
  await assert.rejects(renameEditableDraft(invalid.client,uid,"invalid",7,"Test"),/Révision/);
  assert.equal(invalid.writes,0);
});

test("Titre vide, caractères de contrôle, longueur et révision invalides refusés",async()=>{
  const m=mock();
  for(const name of ["  ","X".repeat(121),"Erreur\nNom"]){
    await assert.rejects(renameEditableDraft(m.client,uid,id,7,name));
  }
  await assert.rejects(renameEditableDraft(m.client,uid,id,0,"Valide"),/Révision/);
  assert.equal(m.writes,0);
});

test("Mes brouillons propose le renommage FR/EN et protège la composition ouverte",()=>{
  const app=readFileSync(new URL("../app/src/app.js",import.meta.url),"utf8");
  const css=readFileSync(new URL("../app/src/styles.css",import.meta.url),"utf8");
  assert.match(app,/data-action="draft-rename-open"/);
  assert.match(app,/data-form="draft-rename"/);
  assert.match(app,/Nouveau nom du brouillon/);
  assert.match(app,/New draft name/);
  assert.match(app,/renameEditableDraft\(client,uid,id,doc.revision,title\)/);
  assert.match(app,/autosave\.busy\|\|autosave\.dirty\|\|autosave\.paused\|\|autosave\.conflict/);
  assert.match(app,/editableDrafts\.current\[doc\.kind\]\.revision=renamed\.revision/);
  assert.match(app,/officialComposer\.settings\[doc\.kind\]\.title=renamed\.title/);
  assert.match(app,/DRAFT_REVISION_CONFLICT/);
  assert.match(css,/\.pa-drafts-rename-form/);
  assert.match(css,/\.pa-drafts-rename-actions \.btn\{min-height:44px\}/);
});
