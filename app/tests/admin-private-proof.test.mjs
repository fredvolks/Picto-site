import test from "node:test";
import assert from "node:assert/strict";
import {createPrivateDraftProof,planPrivateDraftProof} from "../src/admin-proof.js";
import {planPreparedPdf} from "../src/print-pdf.js";
import {DEFAULT_PRESET} from "../src/core.js";

const uid="11111111-1111-4111-8111-111111111111";
const assetId="33333333-3333-4333-8333-333333333333";
const privatePath="imports/"+uid+"/"+assetId+".png";
const source={id:assetId,title_fr:"se laver les mains",title_en:"wash hands",
  theme:"hygiene",status:"draft",image_path:privatePath,created_at:"2026-11-01T10:00:00Z"};
function png(){
  const bytes=new Uint8Array(40);bytes.set([137,80,78,71,13,10,26,10]);
  return new Blob([bytes],{type:"image/png"});
}
function pdf(){return new Blob(["%PDF-1.4\\nprivate"],{type:"application/pdf"});}
function mock({roleGranted=true,session=uid,sourceAsset=source}={}){
  const calls=[];let activeUid=session,allowed=roleGranted,renderCalls=0;
  const client={
    auth:{async getUser(){calls.push("auth");return{data:{user:activeUid?{id:activeUid}:null},error:null};}},
    from(table){
      calls.push(table);
      if(table==="pictau_admins")return{
        select(){return{eq(){return{async maybeSingle(){
          return{data:allowed?{user_id:uid}:null,error:null};
        }}}}}
      };
      if(table==="pictau_assets")return{
        select(){return{eq(){return{async maybeSingle(){return{data:sourceAsset,error:null};}}}}}
      };
      throw Error("Write or unexpected table: "+table);
    },
    storage:{from(bucket){
      calls.push("storage:"+bucket);
      assert.equal(bucket,"pictau-drafts");
      return{async download(path){
        calls.push("download:"+path);assert.equal(path,privatePath);
        return{data:png(),error:null};
      }};
    }}
  };
  return {client,calls,refuse:()=>{allowed=false;},changeUser:()=>{activeUid="22222222-2222-4222-8222-222222222222";},
    generator:async()=>{renderCalls++;return{blob:pdf(),pageCount:1};},
    get renderCalls(){return renderCalls;}};
}

test("Émilie : PDF de contrôle 5 cm sans donner de statut publié ni de lien public",()=>{
  const sourcePng=png();
  const options=planPrivateDraftProof(source,sourcePng,{language:"fr"});
  assert.equal(options.kind,"board");
  assert.equal(options.paper,"letter");
  assert.equal(options.widthCm,5);
  assert.equal(options.columns,2);
  assert.equal(options.items.length,1);
  assert.equal(options.items[0].pngBlob,sourcePng);
  assert.equal(options.preset.colored,false);
  assert.match(options.title,/Épreuve privée/);
  const plan=planPreparedPdf(options);
  assert.equal(plan.pages.length,1);
  assert.equal(plan.widthMm,50);
  assert.equal(plan.preset.colored,false);
});
test("Épreuve privée anglaise garde le titre anglais et le véritable dessin",()=>{
  const options=planPrivateDraftProof(source,png(),{language:"en",preset:DEFAULT_PRESET});
  assert.match(options.title,/Private proof.*wash hands/);
  assert.equal(options.items[0].en,"wash hands");
  assert.equal(options.items[0].fr,"se laver les mains");
  assert.equal(planPreparedPdf(options).pages.length,1);
});
test("Épreuve privée refuse toute fiche déjà publiée et les entrées invalides",()=>{
  assert.throws(()=>planPrivateDraftProof({...source,status:"published"},png()),/brouillon privé/);
  assert.throws(()=>planPrivateDraftProof(source,null),/brouillon privé/);
  assert.throws(()=>planPrivateDraftProof(source,png(),{language:"invalid"}),/Langue/);
});
test("La génération ne fait que lire le brouillon et confirme deux fois les droits après calcul",async()=>{
  const m=mock();
  const blob=await createPrivateDraftProof(m.client,uid,assetId,{language:"fr"},m.generator);
  assert.equal(blob.type,"application/pdf");
  assert.equal(m.renderCalls,1);
  assert.equal(m.calls.filter(x=>x==="pictau_assets").length,1);
  assert.ok(m.calls.filter(x=>x==="pictau_admins").length>=4);
  assert.deepEqual(m.calls.filter(x=>x.startsWith("storage:")),["storage:pictau-drafts"]);
  assert.deepEqual(m.calls.filter(x=>x.startsWith("download:")),["download:"+privatePath]);
  assert.equal(m.calls.some(x=>/insert|upload|delete|approved|client-files/.test(x)),false);
});
test("Si le rôle est retiré pendant la création, le PDF ne sort jamais",async()=>{
  const m=mock();
  await assert.rejects(
    createPrivateDraftProof(m.client,uid,assetId,{},async()=>{
      m.refuse();return{blob:pdf(),pageCount:1};
    }),
    /droits Super Admin/
  );
});
test("Si la session change pendant la création, le PDF est refusé",async()=>{
  const m=mock();
  await assert.rejects(
    createPrivateDraftProof(m.client,uid,assetId,{},async()=>{
      m.changeUser();return{blob:pdf(),pageCount:1};
    }),
    /session Super Admin/
  );
});
test("Un compte non admin ne peut pas charger le PNG et n'appelle pas le générateur",async()=>{
  const m=mock({roleGranted:false});
  await assert.rejects(createPrivateDraftProof(m.client,uid,assetId,{},m.generator),/Super Admin/);
  assert.equal(m.renderCalls,0);
  assert.equal(m.calls.some(x=>x.startsWith("storage:")),false);
});
test("Un PDF invalide ou plusieurs pages sont refusés",async()=>{
  for(const result of [
    {blob:new Blob(["HTML"],{type:"application/pdf"}),pageCount:1},
    {blob:pdf(),pageCount:2},
    {blob:new Blob(["%PDF-1.4"],{type:"text/html"}),pageCount:1}
  ]){
    const m=mock();
    await assert.rejects(createPrivateDraftProof(m.client,uid,assetId,{},async()=>result),
      /PDF|Signature/);
  }
});
