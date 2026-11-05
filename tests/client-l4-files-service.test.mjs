import test from "node:test";
import assert from "node:assert/strict";
import {archivePdf,downloadMyDocument,listMyDocuments,renameMyDocument,normalizeDocumentTitle,
 normalizeDocumentSearch,normalizeDocumentSort,normalizeDocumentPeriod,normalizeDocumentSourceFilter,documentPeriodStart,documentPath,validatePdfBlob,FILES_BUCKET,lastDocumentPage,listMyDocumentsAvailablePage} from "../app/src/client-files.js";
const uid="11111111-1111-4111-8111-111111111111",other="22222222-2222-4222-8222-222222222222",docId="33333333-3333-4333-8333-333333333333",draftId="44444444-4444-4444-8444-444444444444";
const pdf=new Blob(["%PDF-1.4\n1 0 obj\n%%EOF"],{type:"application/pdf"});
async function hash(blob){const b=await crypto.subtle.digest("SHA-256",await blob.arrayBuffer());return [...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,"0")).join("");}
function mock({session=uid,roleError=null,insertError=null,blob=pdf,remoteHash=null}={}){
 const calls=[];
 const data={id:docId,owner_id:uid,title:"Ma routine du soir",document_type:"routine",
  byte_size:blob.size,sha256:remoteHash,created_at:"2026-10-28T10:00:00Z",source_draft_id:null};
 const client={auth:{async getUser(){calls.push("auth");return{data:{user:session?{id:session}:null},error:roleError};}},
  storage:{from(bucket){calls.push(["bucket",bucket]);assert.equal(bucket,FILES_BUCKET);return{
   async upload(path,file,opts){calls.push(["upload",path,file,opts]);return{error:insertError==="upload"?new Error("storage failure"):null};},
   async download(path){calls.push(["download",path]);return{data:blob,error:insertError==="download"?new Error("download failure"):null};},
   async remove(paths){calls.push(["remove",paths]);return{data:paths,error:null};}
  };}},
  from(table){calls.push(["table",table]);assert.equal(table,"pictau_documents");
   const q={
    eq(k,v){calls.push(["eq",k,v]);return q;},
    ilike(k,v){calls.push(["ilike",k,v]);return q;},
    gte(k,v){calls.push(["gte",k,v]);return q;},
    not(k,operator,value){calls.push(["not",k,operator,value]);return q;},
    is(k,value){calls.push(["is",k,value]);return q;},
    order(k,o){calls.push(["order",k,o]);return q;},
    async range(a,b){calls.push(["range",a,b]);return{data:a===0?[data]:[],count:1,error:null};},
    async maybeSingle(){return{data:insertError==="conflict"?null:data,error:null};},
    async single(){return{data:insertError==="insert"?null:{...data,id:awaitedId||docId},error:insertError==="insert"?new Error("insert failure"):null};},
    select(c){calls.push(["select",c]);return q;}
   };
   let awaitedId=null;
   return {
    select(c,o){calls.push(["select",c,o]);return q;},
    insert(payload){calls.push(["insert",payload]);awaitedId=payload.id;
     // Le serveur retourne les champs réellement écrits, nécessaires au contrôle
     // de l'original privé après un INSERT réussi.
     Object.assign(data,{
      id:payload.id,owner_id:payload.owner_id,title:payload.title,
      document_type:payload.document_type,storage_path:payload.storage_path,
      sha256:payload.sha256,byte_size:payload.byte_size,
      page_count:payload.page_count??null,source_draft_id:payload.source_draft_id??null
     });return q;},
    update(payload){calls.push(["update",payload]);data.title=payload.title;return q;}
   };
  }};
 return{client,calls,data};
}
test("Titre, recherche et chemin sont validés avant accès serveur",()=>{
 assert.equal(normalizeDocumentTitle(" Ma  routine "),"Ma routine");
 assert.throws(()=>normalizeDocumentTitle(" "),/titre/i);
 assert.throws(()=>normalizeDocumentTitle("nom\navec saut"),/invalide/);
 assert.equal(normalizeDocumentSearch("%admin"),"%admin");
 assert.throws(()=>normalizeDocumentSearch("nom\ninvalide"),/invalide/);
 assert.equal(documentPath(uid,docId),uid+"/"+docId+".pdf");
 assert.throws(()=>documentPath(uid,"../../../secret"),/invalide/);
});
test("Vérification vraie signature PDF, taille et SHA-256",async()=>{
 const r=await validatePdfBlob(pdf);
 assert.match(r.sha256,/^[a-f0-9]{64}$/);
 assert.equal(r.byte_size,pdf.size);
 await assert.rejects(validatePdfBlob(new Blob(["ceci n'est pas un PDF"],{type:"application/pdf"})),/signature PDF/);
 await assert.rejects(validatePdfBlob(new Blob(["%PDF-xxxx"],{type:"text/plain"})),/fichier PDF/);
});
test("Archiver : SHA-256 et chemin unique, sans upsert, puis confirmation serveur",async()=>{
 const m=mock();
 const result=await archivePdf(m.client,uid,pdf,{title:" Ma routine du soir ",documentType:"routine"});
 assert.equal(result.title,"Ma routine du soir");
 const upload=m.calls.find(x=>x[0]==="upload");
 assert.match(upload[1],new RegExp("^"+uid+"/[0-9a-f-]{36}\\.pdf$"));
 assert.equal(upload[3].upsert,false);
 const ins=m.calls.find(x=>x[0]==="insert")[1];
 assert.equal(ins.storage_path,upload[1]);assert.equal(ins.sha256,await hash(pdf));
 assert.equal(m.calls.filter(x=>x==="auth").length,4,
   "Le reçu SQL est suivi de deux contrôles Auth avant et après la relecture privée");
 assert.equal(m.calls.some(x=>x[0]==="remove"),false);
});
test("INSERT incertain : préserver le PDF privé, même sans documentId explicite",async()=>{
 const m=mock({insertError:"insert"});
 await assert.rejects(archivePdf(m.client,uid,pdf,{title:"Sauver la routine",documentType:"routine"}),/insert failure/);
 const upload=m.calls.find(x=>Array.isArray(x)&&x[0]==="upload");
 const insert=m.calls.find(x=>Array.isArray(x)&&x[0]==="insert");
 assert.ok(upload&&insert,"Le PDF et l'INSERT ont été tentés");
 assert.equal(insert[1].storage_path,upload[1],"La fiche peut déjà avoir été écrite malgré l'erreur");
 assert.equal(m.calls.filter(x=>Array.isArray(x)&&x[0]==="remove").length,0,
   "Ne jamais détruire un original qu'une ligne SQL peut référencer");
});
test("Session changée après INSERT : aucun faux succès ni suppression du PDF privé",async()=>{
 const m=mock();
 let checks=0;
 m.client.auth.getUser=async()=>{
  checks++;
  return {data:{user:{id:checks===3?other:uid}},error:null};
 };
 await assert.rejects(archivePdf(m.client,uid,pdf,{title:"Original",documentType:"routine"}),/Session/);
 assert.equal(checks,3,"Identité vérifiée avant/après la sauvegarde");
 assert.ok(m.calls.some(x=>Array.isArray(x)&&x[0]==="insert"));
 assert.equal(m.calls.filter(x=>Array.isArray(x)&&x[0]==="remove").length,0);
});
test("Sans compte valide, pas de téléchargement ou d'insertion",async()=>{
 const m=mock({session:other});
 await assert.rejects(archivePdf(m.client,uid,pdf,{title:"Routine test",documentType:"routine"}),/Session/);
 await assert.rejects(downloadMyDocument(m.client,uid,docId),/Session/);
 assert.equal(m.calls.some(x=>x[0]==="upload"),false);
});
test("La liste pagine et filtre uniquement les documents du propriétaire",async()=>{
 const m=mock();const r=await listMyDocuments(m.client,uid,{page:2,query:"routine",type:"routine"});
 assert.equal(r.total,1);
 assert.deepEqual(m.calls.find(x=>x[0]==="range"),["range",40,59]);
 assert.deepEqual(m.calls.find(x=>x[0]==="ilike"),["ilike","title","%routine%"]);
 assert.deepEqual(m.calls.filter(x=>x[0]==="eq")[0],["eq","owner_id",uid]);
});
test("Tri serveur : liste blanche, ordre alphabétique stable, pagination et isolation",async()=>{
 const sorts=[
  ["recent","created_at",false],["oldest","created_at",true],
  ["name-asc","title",true],["name-desc","title",false]
 ];
 for(const [sort,column,ascending] of sorts){
  assert.equal(normalizeDocumentSort(sort),sort);
  const m=mock();await listMyDocuments(m.client,uid,{sort,page:1,type:"routine"});
  assert.deepEqual(m.calls.filter(x=>x[0]==="order"),[
   ["order",column,{ascending}],["order","id",{ascending:true}]
  ]);
  assert.deepEqual(m.calls.find(x=>x[0]==="range"),["range",20,39]);
  assert.ok(m.calls.some(x=>x[0]==="eq"&&x[1]==="owner_id"&&x[2]===uid));
 }
 const invalid=mock();
 await assert.rejects(listMyDocuments(invalid.client,uid,{sort:"title;drop table"}),/Tri de documents invalide/);
 assert.equal(invalid.calls.length,0,"Tri invalide bloqué avant toute lecture ou authentification");
 const wrongUser=mock({session:other});
 await assert.rejects(listMyDocuments(wrongUser.client,uid,{sort:"name-asc"}),/Session/);
 assert.equal(wrongUser.calls.some(x=>Array.isArray(x)&&x[0]==="table"),false);
});
test("Téléchargement refuse un PDF modifié, protège son nom de chemin",async()=>{
 const good=mock({remoteHash:await hash(pdf)});
 const result=await downloadMyDocument(good.client,uid,docId);
 assert.equal(result.blob.size,pdf.size);
 assert.deepEqual(good.calls.find(x=>x[0]==="download"),["download",uid+"/"+docId+".pdf"]);
 const bad=mock({remoteHash:"f".repeat(64)});
 await assert.rejects(downloadMyDocument(bad.client,uid,docId),/endommagé|modifié/);
});
test("Renommer modifie seulement le titre et filtre l'ancien nom pour éviter la concurrence",async()=>{
 const m=mock();
 const r=await renameMyDocument(m.client,uid,docId,"Ma routine du soir","Routine du matin");
 assert.equal(r.changed,true);
 assert.deepEqual(m.calls.find(x=>x[0]==="update")[1],{title:"Routine du matin"});
 assert.ok(m.calls.some(x=>x[0]==="eq"&&x[1]==="title"&&x[2]==="Ma routine du soir"));
});

test("Renommer sans changement : relit le vrai document avant d'annoncer inchangé",async()=>{
 const m=mock();
 const result=await renameMyDocument(m.client,uid,docId,"Ma routine du soir","  Ma routine du soir  ");
 assert.deepEqual(result,{changed:false,title:"Ma routine du soir"});
 assert.ok(m.calls.some(x=>Array.isArray(x)&&x[0]==="select"&&x[1]==="id,title"),
   "La branche inchangée doit relire la fiche privée");
 assert.ok(m.calls.some(x=>Array.isArray(x)&&x[0]==="eq"&&x[1]==="owner_id"&&x[2]===uid));
 assert.equal(m.calls.filter(x=>x==="auth").length,2,"Session vérifiée avant et après lecture");
 assert.equal(m.calls.some(x=>Array.isArray(x)&&x[0]==="update"),false);
});
test("Renommer inchangé : document supprimé ou modifié ailleurs n'est jamais confirmé",async()=>{
 const missing=mock({insertError:"conflict"});
 await assert.rejects(renameMyDocument(missing.client,uid,docId,"Ma routine du soir","Ma routine du soir"),
  /document a changé|Actualisez la liste/);
 assert.equal(missing.calls.some(x=>Array.isArray(x)&&x[0]==="update"),false);
 const renamed=mock();renamed.data.title="Routine modifiée ailleurs";
 await assert.rejects(renameMyDocument(renamed.client,uid,docId,"Ma routine du soir","Ma routine du soir"),
  /document a changé|Actualisez la liste/);
 assert.equal(renamed.calls.some(x=>Array.isArray(x)&&x[0]==="update"),false);
});
test("Renommer inchangé : session étrangère ou remplacée après lecture interdite",async()=>{
 const alien=mock({session:other});
 await assert.rejects(renameMyDocument(alien.client,uid,docId,"Ma routine du soir","Ma routine du soir"),/Session/);
 assert.equal(alien.calls.some(x=>Array.isArray(x)&&x[0]==="select"),false);
 const changed=mock();let checks=0;
 changed.client.auth.getUser=async()=>({data:{user:{id:++checks===1?uid:other}},error:null});
 await assert.rejects(renameMyDocument(changed.client,uid,docId,"Ma routine du soir","Ma routine du soir"),/Session/);
 assert.equal(checks,2);
 assert.equal(changed.calls.some(x=>Array.isArray(x)&&x[0]==="update"),false);
});

test("Un PDF généré lie sa source modifiable, mais ne change pas les octets originaux",async()=>{
 const m=mock();
 const r=await archivePdf(m.client,uid,pdf,{
   title:"Nouvelle version du dodo",documentType:"routine",pageCount:1,sourceDraftId:draftId
 });
 assert.equal(r.source_draft_id,draftId);
 assert.equal(m.calls.find(x=>x[0]==="insert")[1].source_draft_id,draftId);
 assert.equal(m.calls.find(x=>x[0]==="upload")[2],pdf);
 const imported=mock();
 await archivePdf(imported.client,uid,pdf,{title:"PDF importé",documentType:"sheet"});
 assert.equal(Object.hasOwn(imported.calls.find(x=>x[0]==="insert")[1],"source_draft_id"),false,
   "Un PDF sans source n'en invente pas");
});
test("Un lien source usurpé ou hors type est rejeté avant lecture/stockage",async()=>{
 const m=mock();
 await assert.rejects(archivePdf(m.client,uid,pdf,{
  title:"Test source",documentType:"routine",sourceDraftId:"../../admin"
 }),/Source modifiable/);
 await assert.rejects(archivePdf(m.client,uid,pdf,{
  title:"Test source",documentType:"sheet",sourceDraftId:draftId
 }),/Source modifiable/);
 assert.equal(m.calls.length,0);
});


test("Historique PDF : dernier feuillet calculé sans page fantôme",()=>{
 assert.equal(lastDocumentPage(0),0);
 assert.equal(lastDocumentPage(1),0);
 assert.equal(lastDocumentPage(20),0);
 assert.equal(lastDocumentPage(21),1);
 assert.equal(lastDocumentPage(41),2);
 assert.throws(()=>lastDocumentPage(-1),/Décompte/);
 assert.throws(()=>lastDocumentPage(Number.NaN),/Décompte/);
});
function changingDocumentList(counts,{session=uid}={}){
 const ranges=[];
 const client={
  auth:{async getUser(){return {data:{user:{id:session}},error:null};}},
  from(table){assert.equal(table,"pictau_documents");const q={
   select(){return q;},eq(){return q;},ilike(){return q;},order(){return q;},
   async range(start,end){
    ranges.push([start,end]);
    const count=counts[Math.min(ranges.length-1,counts.length-1)];
    const rows=Array.from({length:Math.max(0,Math.min(end+1,count)-start)},(_,i)=>({id:"row-"+(start+i)}));
    return {data:rows,count,error:null};
   }
  };return q;}
 };
 return {client,ranges};
}
test("PDF supprimés sur un autre appareil : revient à la dernière page ayant des fichiers",async()=>{
 const fixture=changingDocumentList([41,41]);
 const result=await listMyDocumentsAvailablePage(fixture.client,uid,{page:3,query:"dodo",sort:"name-asc"});
 assert.equal(result.page,2);
 assert.equal(result.total,41);
 assert.deepEqual(result.items.map(x=>x.id),["row-40"]);
 assert.deepEqual(fixture.ranges,[[60,79],[40,59]]);
});
test("Archives toutes supprimées ailleurs : une seule lecture et retour à la page 1",async()=>{
 const fixture=changingDocumentList([0]);
 const result=await listMyDocumentsAvailablePage(fixture.client,uid,{page:4});
 assert.equal(result.page,0);
 assert.deepEqual(result.items,[]);
 assert.equal(result.total,0);
 assert.deepEqual(fixture.ranges,[[80,99]]);
});
test("Liste qui se réduit plusieurs fois : pas de boucle de requêtes ni de faux feuillet",async()=>{
 const fixture=changingDocumentList([45,23,20]);
 await assert.rejects(listMyDocumentsAvailablePage(fixture.client,uid,{page:3}),/Actualisez vos fichiers/);
 assert.deepEqual(fixture.ranges,[[60,79],[40,59],[20,39]]);
});
test("La correction ne contourne jamais la session propriétaire du service RLS",async()=>{
 const fixture=changingDocumentList([41],{session:other});
 await assert.rejects(listMyDocumentsAvailablePage(fixture.client,uid,{page:3}),/Session/);
 assert.equal(fixture.ranges.length,0);
});
function sequencedDocumentResponses(responses,{sessions=[uid]}={}){
 const ranges=[],users=[];
 const client={
  auth:{async getUser(){
   const user=sessions[Math.min(users.length,sessions.length-1)];
   users.push(user);
   return {data:{user:user?{id:user}:null},error:null};
  }},
  from(table){
   assert.equal(table,"pictau_documents");
   const query={
    select(){return query;},eq(){return query;},ilike(){return query;},order(){return query;},
    async range(start,end){
     ranges.push([start,end]);
     return responses[Math.min(ranges.length-1,responses.length-1)];
    }
   };
   return query;
  }
 };
 return {client,ranges,users};
}
test("Mes fichiers : data=null ou non-tableau ne devient jamais un faux dossier vide",async()=>{
 for(const invalid of [null,undefined,{}, ""]){
  const f=sequencedDocumentResponses([{data:invalid,count:1,error:null}]);
  await assert.rejects(listMyDocumentsAvailablePage(f.client,uid),/Réponse de la liste des fichiers invalide/);
  assert.equal(f.ranges.length,1);
 }
});
test("Mes fichiers : page temporairement vide avec compteur positif puis récupérée",async()=>{
 const f=sequencedDocumentResponses([
  {data:[],count:1,error:null},
  {data:[{id:"pdf-retrouve"}],count:1,error:null}
 ]);
 const r=await listMyDocumentsAvailablePage(f.client,uid,{page:0,query:"dodo",type:"routine",sort:"oldest"});
 assert.deepEqual(r.items,[{id:"pdf-retrouve"}]);
 assert.equal(r.total,1);
 assert.equal(r.page,0);
 assert.deepEqual(f.ranges,[[0,19],[0,19]]);
 assert.equal(f.users.length,4,"Chaque lecture revalide l'identité avant et après Supabase");
});
test("Mes fichiers : une page tronquée est relue plutôt que masquer des PDF",async()=>{
 const complete=Array.from({length:20},(_,i)=>({id:"pdf-"+i}));
 const f=sequencedDocumentResponses([
  {data:complete.slice(0,3),count:21,error:null},
  {data:complete,count:21,error:null}
 ]);
 const r=await listMyDocumentsAvailablePage(f.client,uid,{page:0});
 assert.deepEqual(r.items,complete);
 assert.equal(r.total,21);
 assert.deepEqual(f.ranges,[[0,19],[0,19]]);
 assert.equal(f.users.length,4,"Chaque requête conserve les contrôles Auth");
});
test("Mes fichiers : page définitivement tronquée refuse un faux historique complet",async()=>{
 const f=sequencedDocumentResponses([{data:[{id:"pdf-1"}],count:21,error:null}]);
 await assert.rejects(listMyDocumentsAvailablePage(f.client,uid,{page:0}),/Actualisez vos fichiers/);
 assert.deepEqual(f.ranges,[[0,19],[0,19],[0,19]]);
 assert.equal(f.users.length,6);
});
test("Mes fichiers : dernier feuillet partiel légitime reste affiché",async()=>{
 const f=sequencedDocumentResponses([{data:[{id:"pdf-21"}],count:21,error:null}]);
 const r=await listMyDocumentsAvailablePage(f.client,uid,{page:1});
 assert.equal(r.page,1);
 assert.deepEqual(r.items,[{id:"pdf-21"}]);
 assert.deepEqual(f.ranges,[[20,39]]);
});
test("Mes fichiers : trois pages annoncées non vides mais vides ne mentent pas au client",async()=>{
 const f=sequencedDocumentResponses([{data:[],count:2,error:null}]);
 await assert.rejects(listMyDocumentsAvailablePage(f.client,uid,{page:0}),/Actualisez vos fichiers/);
 assert.deepEqual(f.ranges,[[0,19],[0,19],[0,19]],"Trois essais maximum");
 assert.equal(f.users.length,6);
});
test("Mes fichiers : véritable archive vide confirmée sans relecture inutile",async()=>{
 const f=sequencedDocumentResponses([{data:[],count:0,error:null}]);
 const r=await listMyDocumentsAvailablePage(f.client,uid,{page:4});
 assert.equal(r.page,0);
 assert.equal(r.total,0);
 assert.deepEqual(r.items,[]);
 assert.deepEqual(f.ranges,[[80,99]]);
});
test("Mes fichiers : compteur et pagination incompatibles produisent une erreur",async()=>{
 for(const [page,data,count] of [
  [0,[{id:"fantome"}],0],
  [2,[{id:"hors-page"}],1],
  [0,Array.from({length:21},(_,i)=>({id:"pdf-"+i})),25],
  [0,[{id:"document1"},{id:"document2"}],1]
 ]){
  const f=sequencedDocumentResponses([{data,count,error:null}]);
  await assert.rejects(listMyDocumentsAvailablePage(f.client,uid,{page}),/Pagination des fichiers incohérente/);
  assert.equal(f.ranges.length,1);
 }
});
test("Mes fichiers : changement de compte entre deux lectures stoppe tout accès",async()=>{
 const f=sequencedDocumentResponses([{data:[],count:1,error:null}],{sessions:[uid,uid,other]});
 await assert.rejects(listMyDocumentsAvailablePage(f.client,uid,{page:0}),/Session/);
 assert.deepEqual(f.ranges,[[0,19]],"Aucune deuxième lecture après révocation de session");
});

test("Mes fichiers : périodes UTC glissantes validées avant toute lecture privée",async()=>{
 const now=Date.parse("2026-11-03T23:00:00.000Z");
 assert.equal(normalizeDocumentPeriod("month"),"month");
 assert.equal(documentPeriodStart("all",now),null);
 assert.equal(documentPeriodStart("week",now),"2026-10-27T23:00:00.000Z");
 assert.equal(documentPeriodStart("month",now),"2026-10-04T23:00:00.000Z");
 assert.equal(documentPeriodStart("year",now),"2025-11-03T23:00:00.000Z");
 // Une année bissextile et une date en fin de mois ne valent pas toujours 365 jours.
 assert.equal(documentPeriodStart("year",Date.parse("2025-03-01T10:15:00.000Z")),
   "2024-03-01T10:15:00.000Z");
 assert.equal(documentPeriodStart("year",Date.parse("2024-02-29T10:15:00.000Z")),
   "2023-02-28T10:15:00.000Z");
 assert.equal(documentPeriodStart("year",Date.parse("2025-01-31T22:45:00.000Z")),
   "2024-01-31T22:45:00.000Z");
 for(const period of ["today","7d","all;drop",null]){
   const m=mock();
   await assert.rejects(listMyDocuments(m.client,uid,{period}),/Période de documents invalide/);
   assert.equal(m.calls.length,0,"Aucun appel réseau pour une période inconnue");
 }
 assert.throws(()=>documentPeriodStart("week",Number.NaN),/Date de recherche invalide/);
});

test("Filtre période : borne SQL avant tri/pagination, sans élargir la lecture RLS",async()=>{
 const m=mock();
 const calls=[];
 const original=m.client.from;
 m.client.from=function(table){
   const base=original.call(m.client,table);
   const select=base.select;
   base.select=function(...args){
     const q=select.apply(base,args);
     q.gte=(name,value)=>{calls.push([name,value]);return q;};
     return q;
   };
   return base;
 };
 await listMyDocuments(m.client,uid,{page:1,type:"board",query:"soir",period:"month",sort:"oldest"});
 assert.equal(calls.length,1);
 assert.equal(calls[0][0],"created_at");
 const since=Date.parse(calls[0][1]);
 assert.ok(Number.isFinite(since));
 assert.ok(Math.abs(Date.now()-since-30*86400000)<30000);
 assert.deepEqual(m.calls.find(x=>Array.isArray(x)&&x[0]==="range"),["range",20,39]);
 assert.ok(m.calls.some(x=>Array.isArray(x)&&x[0]==="eq"&&x[1]==="owner_id"&&x[2]===uid));
 const otherUser=mock({session:other});
 await assert.rejects(listMyDocuments(otherUser.client,uid,{period:"week"}),/Session/);
 assert.equal(otherUser.calls.some(x=>Array.isArray(x)&&x[0]==="table"),false);
});

test("Mes fichiers : source liée ou non liée validée avant réseau et filtrée côté serveur",async()=>{
 assert.equal(normalizeDocumentSourceFilter(),"all");
 assert.equal(normalizeDocumentSourceFilter("linked"),"linked");
 assert.equal(normalizeDocumentSourceFilter("unlinked"),"unlinked");
 for(const source of ["draft;drop","published",null,["linked"],{}]){
   const m=mock();
   await assert.rejects(listMyDocuments(m.client,uid,{source}),/Filtre de source PDF invalide/);
   assert.equal(m.calls.length,0,"Paramètre invalide : aucun appel Auth ni RLS");
 }
 for(const [source,expected] of [
   ["linked",["not","source_draft_id","is",null]],
   ["unlinked",["is","source_draft_id",null]]
 ]){
   const m=mock();
   await listMyDocuments(m.client,uid,{
     page:1,query:"routine",type:"routine",sort:"name-asc",period:"week",source
   });
   const at=m.calls.findIndex(call=>Array.isArray(call)&&call[0]===expected[0]);
   assert.deepEqual(m.calls[at],expected);
   const orderAt=m.calls.findIndex(call=>Array.isArray(call)&&call[0]==="order");
   const rangeAt=m.calls.findIndex(call=>Array.isArray(call)&&call[0]==="range");
   assert.ok(at>=0&&at<orderAt&&at<rangeAt,"Présence de source filtrée avant tri et pagination");
   assert.deepEqual(m.calls.find(call=>Array.isArray(call)&&call[0]==="range"),["range",20,39]);
   assert.ok(m.calls.some(call=>Array.isArray(call)&&call[0]==="eq"&&
     call[1]==="owner_id"&&call[2]===uid),"Le propriétaire reste obligatoire");
   assert.ok(m.calls.some(call=>Array.isArray(call)&&call[0]==="ilike"),
     "Recherche sur le nom combinable avec le filtre source");
   assert.ok(m.calls.some(call=>Array.isArray(call)&&call[0]==="gte"),
     "Période serveur combinée avant les résultats");
 }
 const all=mock();
 await listMyDocuments(all.client,uid,{source:"all"});
 assert.equal(all.calls.some(call=>Array.isArray(call)&&["is","not"].includes(call[0])),false);
 const foreign=mock({session:other});
 await assert.rejects(listMyDocuments(foreign.client,uid,{source:"linked"}),/Session/);
 assert.equal(foreign.calls.some(call=>Array.isArray(call)&&call[0]==="table"),false,
   "Aucune requête SQL sous une autre identité");
});

// Les caractères autorisés dans un titre de PDF restent littéraux dans
// la recherche SQL : la RLS et la pagination du propriétaire sont conservées.
test("Recherche des PDF : _, % et antislash sont littéraux, sous le bon propriétaire",async()=>{
 const title=String.raw`PECS_50%\routine`;
 const m=mock();
 assert.equal(normalizeDocumentSearch(title),title);
 await listMyDocuments(m.client,uid,{query:title,type:"routine",period:"month"});
 assert.deepEqual(m.calls.find(x=>x[0]==="ilike"),
  ["ilike","title","%"+String.raw`PECS\_50\%\\routine`+"%"]);
 assert.ok(m.calls.some(x=>x[0]==="eq"&&x[1]==="owner_id"&&x[2]===uid));
 assert.deepEqual(m.calls.find(x=>x[0]==="range"),["range",0,19]);
});
