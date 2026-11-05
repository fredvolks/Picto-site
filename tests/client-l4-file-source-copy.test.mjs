import test from "node:test";
import assert from "node:assert/strict";
import {duplicateMyDocumentSource} from "../app/src/client-files.js";

const uid="11111111-1111-4111-8111-111111111111";
const other="22222222-2222-4222-8222-222222222222";
const pdfId="33333333-3333-4333-8333-333333333333";
const sourceId="44444444-4444-4444-8444-444444444444";
const copyId="55555555-5555-4555-8555-555555555555";
const alternate="66666666-6666-4666-8666-666666666666";
const pictoId="77777777-7777-4777-8777-777777777777";

function mock({kind="routine",sourceKind=kind,pdfFirst,pdfAfterRead,
    draftAfterRead,wrongSessionAt=Infinity}={}){
  const pdf={id:pdfId,owner_id:uid,document_type:kind,source_draft_id:sourceId,...pdfFirst};
  const source={id:sourceId,owner_id:uid,kind:sourceKind,revision:3,
    title:"Routine du soir",content:{items:[{id:pictoId,title_fr:"Pause",
      title_en:"Break",theme:"autonomie",image_path:"items/"+pictoId+".png",
      customLabel:null}],settings:{title:"Routine du soir",widthCm:"5",
      paper:"letter",columns:"3"}}};
  const initialPdf=structuredClone(pdf),initialSource=structuredClone(source);
  const calls={auth:0,pdfReads:0,draftReads:0,inserts:[],updates:0,deletes:0};
  const client={
    auth:{async getUser(){
      calls.auth++;
      return{data:{user:{id:calls.auth>=wrongSessionAt?other:uid}},error:null};
    }},
    from(table){
      if(table==="pictau_documents")return{
        select(){return this;},eq(){return this;},
        async maybeSingle(){
          calls.pdfReads++;
          const chosen=calls.pdfReads>1&&pdfAfterRead!==undefined?pdfAfterRead:pdf;
          return{data:chosen===null?null:{...structuredClone(pdf),
            ...(calls.pdfReads>1&&pdfAfterRead!==undefined?pdfAfterRead:{})},error:null};
        }
      };
      if(table==="pictau_editable_drafts")return{
        select(){return this;},eq(){return this;},
        async maybeSingle(){
          calls.draftReads++;
          const replacement=calls.draftReads>1?draftAfterRead:undefined;
          return{data:replacement===null?null:{...structuredClone(source),
            ...(replacement||{})},error:null};
        },
        insert(payload){
          calls.inserts.push(structuredClone(payload));
          return{select(){return{async single(){return{
            data:{...structuredClone(payload),id:copyId,revision:1},error:null
          };}}}};
        },
        update(){calls.updates++;throw Error("UPDATE interdit");},
        delete(){calls.deletes++;throw Error("DELETE interdit");}
      };
      throw Error("Table inattendue : "+table);
    }
  };
  return{client,calls,pdf,source,initialPdf,initialSource};
}
const duplicate=(m,kind="routine")=>duplicateMyDocumentSource(m.client,uid,pdfId,{
  sourceId,kind,language:"fr"
});

test("Copie liée : relecture privée du PDF et de la révision source avant INSERT",async()=>{
  for(const kind of ["routine","board"]){
    const m=mock({kind});
    const result=await duplicate(m,kind);
    assert.equal(result.id,copyId);
    assert.equal(result.kind,kind);
    assert.equal(result.title,"Copie de Routine du soir");
    assert.deepEqual(result.content.items,m.source.content.items);
    assert.equal(m.calls.pdfReads,2);
    assert.equal(m.calls.draftReads,2);
    assert.equal(m.calls.inserts.length,1);
    assert.equal(m.calls.inserts[0].owner_id,uid);
    assert.equal(m.calls.updates,0);
    assert.equal(m.calls.deletes,0);
    assert.deepEqual(m.pdf,m.initialPdf);
    assert.deepEqual(m.source,m.initialSource);
  }
});

test("Lien PDF supprimé ou dissocié pendant la lecture : aucune copie créée",async()=>{
  for(const changed of [null,{source_draft_id:alternate},
      {document_type:"board"},{owner_id:other}]){
    const m=mock({pdfAfterRead:changed});
    await assert.rejects(duplicate(m),/source liée à ce PDF a changé/);
    assert.equal(m.calls.pdfReads,2);
    assert.equal(m.calls.inserts.length,0);
    assert.deepEqual(m.pdf,m.initialPdf);
  }
  const initial=mock({pdfFirst:{source_draft_id:alternate}});
  await assert.rejects(duplicate(initial),/source liée à ce PDF a changé/);
  assert.equal(initial.calls.draftReads,0);
  assert.equal(initial.calls.inserts.length,0);
});

test("Brouillon révisé, supprimé ou dont le type a changé : aucune insertion",async()=>{
  for(const changed of [{revision:4},null,{kind:"board"}]){
    const m=mock({draftAfterRead:changed});
    await assert.rejects(duplicate(m),/brouillon source a changé|introuvable/);
    assert.equal(m.calls.pdfReads,2);
    assert.equal(m.calls.draftReads,2);
    assert.equal(m.calls.inserts.length,0);
    assert.deepEqual(m.source,m.initialSource);
  }
  const mismatch=mock({sourceKind:"board"});
  await assert.rejects(duplicate(mismatch),/ne correspond plus au PDF archivé/);
  assert.equal(mismatch.calls.inserts.length,0);
});

test("Session changée et identifiants invalides : pas de copie privée",async()=>{
  const loggedOut=mock({wrongSessionAt:5});
  await assert.rejects(duplicate(loggedOut),/Session/);
  assert.equal(loggedOut.calls.inserts.length,0);
  const invalid=mock();
  await assert.rejects(duplicateMyDocumentSource(invalid.client,uid,pdfId,{
    sourceId:alternate,kind:"sheet"
  }),/Source modifiable du PDF invalide/);
  assert.equal(invalid.calls.pdfReads,0);
  assert.equal(invalid.calls.inserts.length,0);
});
