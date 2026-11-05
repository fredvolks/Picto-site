import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {VALID_TEST_PNG_BYTES} from "./fixtures/valid-png.mjs";
import {importPrivateDraft} from "../src/admin-import.js";

const uid="11111111-1111-4111-8111-111111111111";
const uploadToken="22222222-2222-4222-8222-222222222222";
const realId="33333333-3333-4333-8333-333333333333";
const png=()=>Object.assign(new Blob([VALID_TEST_PNG_BYTES],{type:"image/png"}),{name:"pomme.png"});

function mock({dbRowId=realId,dropInsertAck=false,hiddenRow=false}={}){
  let stored=null,reads=0;
  const inserted=[],uploaded=[],removed=[];
  const client={
    auth:{getUser:async()=>({data:{user:{id:uid}},error:null})},
    from(table){
      if(table==="pictau_admins")return {
        select(columns){
          assert.equal(columns,"user_id");
          return {eq(field,id){
            assert.equal(field,"user_id");assert.equal(id,uid);
            return {maybeSingle:async()=>({data:{user_id:uid},error:null})};
          }};
        }
      };
      if(table==="pictau_assets")return{
        async insert(record){
          inserted.push(record);
          stored={id:dbRowId,...record};
          if(dropInsertAck)throw Error("Accusé perdu après INSERT");
          return {error:null};
        },
        select(columns){
          assert.match(columns,/created_by/);
          return {eq(field,value){
            assert.equal(field,"image_path");
            return {async maybeSingle(){
              reads++;
              return {data:hiddenRow?null:stored?.image_path===value?stored:null,error:null};
            }};
          }};
        }
      };
      throw Error("Table inattendue : "+table);
    },
    storage:{
      from(bucket){
        assert.equal(bucket,"pictau-drafts");
        return {
          upload:async(path,blob,options)=>{
            uploaded.push({path,blob,options});return {error:null};
          },
          remove:async paths=>{removed.push(...paths);return {error:null};}
        };
      }
    }
  };
  return{client,inserted,uploaded,removed,get reads(){return reads;}};
}
test("Le vrai INSERT renvoie l'ID SQL relu sous session Super Admin",async()=>{
  const m=mock();
  const receipt=await importPrivateDraft(m.client,uid,png(),
    {titleFr:"Pomme",titleEn:"Apple",theme:"alimentation"},()=>uploadToken);
  assert.deepEqual(receipt,{
    id:realId,status:"draft",imagePath:`imports/${uid}/${uploadToken}.png`
  });
  assert.equal(m.inserted.length,1);
  assert.equal(m.inserted[0].status,"draft");
  assert.equal(m.inserted[0].published_at,null);
  assert.equal(m.uploaded.length,1);
  assert.equal(m.uploaded[0].options.upsert,false);
  assert.ok(m.reads>0);
  assert.deepEqual(m.removed,[]);
});
test("ACK d'INSERT perdu : la relecture retrouve l'unique brouillon sans retransfert",async()=>{
  const m=mock({dropInsertAck:true});
  const receipt=await importPrivateDraft(m.client,uid,png(),{titleFr:"Pomme"},()=>uploadToken);
  assert.equal(receipt.id,realId);
  assert.equal(receipt.status,"draft");
  assert.equal(m.inserted.length,1);
  assert.equal(m.uploaded.length,1);
  assert.deepEqual(m.removed,[]);
});
test("ID SQL incohérent ou SELECT invisible : pas de faux reçu ni nettoyage dangereux",async()=>{
  for(const opts of [{dbRowId:"mauvais-id"},{hiddenRow:true}]){
    const m=mock(opts);
    await assert.rejects(importPrivateDraft(m.client,uid,png(),{titleFr:"Pomme"},()=>uploadToken),
      /incertaine|vérification manuelle/i);
    assert.equal(m.inserted.length,1);
    assert.equal(m.uploaded.length,1);
    assert.deepEqual(m.removed,[]);
  }
});
test("L'écran ouvre le brouillon relu dans la Banque, jamais une publication automatique",()=>{
  const source=readFileSync(new URL("../src/app.js",import.meta.url),"utf8");
  const start=source.indexOf("const form=event.target.closest('form[data-form=\"admin-import\"]')");
  const end=source.indexOf('root.addEventListener("change",function(event)',start);
  assert.ok(start>0&&end>start);
  const handler=source.slice(start,end);
  assert.match(handler,/const receipt=await importPrivateDraft\(client,userId,file,metadata\)/);
  assert.match(handler,/bankFilters\.status="draft"/);
  assert.match(handler,/bankFilters\.sort="recent"/);
  assert.match(handler,/row\.id===receipt\.id/);
  assert.match(handler,/row\.created_by===userId&&row\.status==="draft"/);
  assert.match(handler,/bankPanel="browse";bankSelectionId=imported\.id/);
  assert.match(handler,/void openAdminPreview\(imported\.id\)/);
  assert.doesNotMatch(handler,/publishReviewedPictogram|\.upsert\(/);
});
