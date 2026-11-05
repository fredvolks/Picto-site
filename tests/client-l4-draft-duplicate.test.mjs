import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {duplicateEditableDraft,duplicatedDraftTitle,normalizeEditableDraft} from "../app/src/client-drafts.js";

const uid="11111111-1111-4111-8111-111111111111";
const other="22222222-2222-4222-8222-222222222222";
const originalId="33333333-3333-4333-8333-333333333333";
const copyId="44444444-4444-4444-8444-444444444444";
const imageId="55555555-5555-4555-8555-555555555555";
function source(kind="routine"){
  return {kind,items:[{id:imageId,title_fr:"Pause",title_en:"Break",theme:"autonomie",
    image_path:"items/"+imageId+".png",customLabel:null}],
    settings:{title:kind==="routine"?"Routine du soir":"Tableau du matin",
      widthCm:"5",paper:"letter",columns:"3"}};
}
function mock({kind="routine",session=uid,missing=false,newId=copyId,expireAfterRead=false}={}){
  const original=normalizeEditableDraft(source(kind));
  const row={id:originalId,owner_id:uid,kind,revision:7,title:original.title,
    content:structuredClone(original.content)};
  const originalSnapshot=JSON.stringify(row);
  const calls=[];
  let authCount=0,insertPayload=null;
  const chain={
    eq(column,value){calls.push(["eq",column,value]);return chain;},
    async maybeSingle(){calls.push(["read"]);return {data:missing?null:structuredClone(row),error:null};}
  };
  const client={
    auth:{async getUser(){
      authCount++;calls.push(["auth"]);
      return {data:{user:{id:expireAfterRead&&authCount>2?other:session}},error:null};
    }},
    from(table){
      calls.push(["table",table]);
      return {
        select(columns){calls.push(["select",columns]);return chain;},
        insert(payload){
          calls.push(["insert",payload]);insertPayload=structuredClone(payload);
          return {select(columns){calls.push(["returning",columns]);return{
            async single(){return {data:{...structuredClone(payload),id:newId,revision:1},error:null};}
          };}};
        }
      };
    }
  };
  return {client,calls,row,originalSnapshot,get insert(){return insertPayload;}};
}

test("Dupliquer crée une nouvelle fiche propriétaire, sans UPDATE ou DELETE de l'original",async()=>{
  const m=mock();
  const copied=await duplicateEditableDraft(m.client,uid,originalId,{language:"fr"});
  assert.equal(copied.id,copyId);
  assert.equal(copied.title,"Copie de Routine du soir");
  assert.equal(copied.content.settings.title,copied.title);
  assert.deepEqual(copied.content.items,m.row.content.items);
  assert.equal(m.insert.owner_id,uid);
  assert.equal(m.insert.kind,"routine");
  assert.equal(JSON.stringify(m.row),m.originalSnapshot);
  assert.deepEqual(m.calls.filter(x=>x[0]==="table").map(x=>x[1]),
    ["pictau_editable_drafts","pictau_editable_drafts"]);
  assert.ok(m.calls.some(x=>x[0]==="eq"&&x[1]==="owner_id"&&x[2]===uid));
  assert.ok(m.calls.some(x=>x[0]==="eq"&&x[1]==="id"&&x[2]===originalId));
  assert.equal(m.calls.filter(x=>x[0]==="insert").length,1);
  assert.equal(m.calls.filter(x=>x[0]==="auth").length,4);
});

test("Une copie de tableau en anglais garde les pictogrammes et les réglages",async()=>{
  const m=mock({kind:"board"});
  const row=await duplicateEditableDraft(m.client,uid,originalId,{language:"en"});
  assert.equal(row.title,"Copy of Tableau du matin");
  assert.equal(row.kind,"board");
  assert.equal(row.content.settings.paper,"letter");
  assert.equal(row.content.items[0].id,imageId);
});

test("Le préfixe est limité à 120 caractères sans perdre la validation du titre",()=>{
  const a=duplicatedDraftTitle("X".repeat(120),"fr");
  const b=duplicatedDraftTitle("X".repeat(120),"en");
  assert.equal(a.length,120);
  assert.equal(b.length,120);
  assert.ok(a.startsWith("Copie de "));
  assert.ok(b.startsWith("Copy of "));
  assert.throws(()=>duplicatedDraftTitle("Valid","es"),/Langue/);
  assert.throws(()=>duplicatedDraftTitle("Invalide\n","fr"),/Titre/);
});

test("Session différente ou expirée : aucune insertion de brouillon privé",async()=>{
  for(const opts of [{session:other},{expireAfterRead:true}]){
    const m=mock(opts);
    await assert.rejects(duplicateEditableDraft(m.client,uid,originalId),/Session/);
    assert.equal(m.insert,null);
  }
});

test("Brouillon introuvable, UUID mal formé ou langue invalide : aucune insertion",async()=>{
  const missing=mock({missing:true});
  await assert.rejects(duplicateEditableDraft(missing.client,uid,originalId),/introuvable/);
  assert.equal(missing.insert,null);
  const invalid=mock();
  await assert.rejects(duplicateEditableDraft(invalid.client,uid,"nope"),/Identifiant/);
  await assert.rejects(duplicateEditableDraft(invalid.client,uid,originalId,{language:"es"}),/Langue/);
  assert.equal(invalid.insert,null);
});

test("Copie depuis un PDF : genre de source vérifié avant tout INSERT",async()=>{
  const linked=mock({kind:"routine"});
  const result=await duplicateEditableDraft(linked.client,uid,originalId,{
    language:"fr",expectedKind:"routine"
  });
  assert.equal(result.kind,"routine");
  assert.equal(linked.calls.filter(x=>x[0]==="insert").length,1);
  const mismatch=mock({kind:"board"});
  await assert.rejects(
    duplicateEditableDraft(mismatch.client,uid,originalId,{expectedKind:"routine"}),
    /ne correspond plus au PDF archivé/
  );
  assert.equal(mismatch.insert,null);
  assert.equal(JSON.stringify(mismatch.row),mismatch.originalSnapshot);
  await assert.rejects(
    duplicateEditableDraft(mismatch.client,uid,originalId,{expectedKind:"sheet"}),
    /Type de source invalide/
  );
  assert.equal(mismatch.insert,null);
});

test("Le serveur doit fournir un nouvel identifiant",async()=>{
  const m=mock({newId:originalId});
  await assert.rejects(duplicateEditableDraft(m.client,uid,originalId),/nouvel identifiant/);
});

test("Mes brouillons propose réellement l'action et la branche de duplication privée",()=>{
  const app=readFileSync(new URL("../app/src/app.js",import.meta.url),"utf8");
  assert.match(app,/data-action="draft-duplicate"/);
  assert.match(app,/duplicateEditableDraft\(client,uid,id,\{language\}\)/);
  assert.match(app,/Copie enregistrée dans vos brouillons/);
  assert.match(app,/if\(copied\)void fetchEditableDrafts\(\)/);
});
