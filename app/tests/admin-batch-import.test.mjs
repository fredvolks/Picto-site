import {VALID_TEST_PNG_BYTES} from "./fixtures/valid-png.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {
 draftTitleFromFilename,preparePrivateDraftBatch,importPrivateDraftBatch,
 MAX_PRIVATE_DRAFT_BATCH
} from "../src/admin-import.js";

const header=Uint8Array.from([137,80,78,71,13,10,26,10]);
function png(name,bytes=VALID_TEST_PNG_BYTES,type="image/png"){
 const blob=new Blob([bytes],{type});return Object.assign(blob,{name});
}
const files=()=>[png("se_laver_les_mains.png"),png("ÉCOLE-02.PNG"),png("pomme.png")];

test("Émilie prépare 1 à 20 brouillons depuis les noms français, sans créer de doublon",async()=>{
 assert.equal(MAX_PRIVATE_DRAFT_BATCH,20);
 assert.equal(draftTitleFromFilename("École-12.PNG"),"École 12");
 assert.equal(draftTitleFromFilename("  goûter_tôt.png"),"goûter tôt");
 const plan=await preparePrivateDraftBatch(files(),"HYGIENE");
 assert.equal(plan.length,3);
 assert.deepEqual(plan.map(x=>x.metadata.titleFr),["se laver les mains","ÉCOLE 02","pomme"]);
 assert.ok(plan.every(x=>x.metadata.theme==="HYGIENE"));
 for(const value of ["../secret.png","picto.svg","x\n.png","x".repeat(120)+".png",".png","....png"]){
  assert.throws(()=>draftTitleFromFilename(value),/invalide|PNG/);
 }
 assert.equal(draftTitleFromFilename("pictau.png"),"pictau");
});
test("Prévalidation intégrale : un PNG faux ou un doublon bloque la totalité, sans upload",async()=>{
 const invalid=[png("bon.png"),png("faux.png",new TextEncoder().encode("<svg>bad</svg>"))];
 let imported=0;
 await assert.rejects(importPrivateDraftBatch(null,"user",invalid,"autres",{
  importOne:async()=>{imported++;}
 }),/signature/i);
 assert.equal(imported,0);
 await assert.rejects(preparePrivateDraftBatch([png("pomme_rouge.png"),png("POMME-ROUGE.png")]),/même nom/);
 await assert.rejects(preparePrivateDraftBatch(Array.from({length:21},(_,i)=>png("n"+i+".png"))),/20/);
 await assert.rejects(preparePrivateDraftBatch([]),/20/);
 await assert.rejects(preparePrivateDraftBatch([png("x.png",header,"image/svg+xml")]),/PNG/);
 await assert.rejects(preparePrivateDraftBatch([png("ok.png")],"../secrets"),/thème/);
});
test("Le lot crée des brouillons strictement séquentiels et confirme chaque succès",async()=>{
 let inFlight=0,peak=0;
 const calls=[],progress=[];
 const report=await importPrivateDraftBatch({},"verified-admin",files(),"hygiene",{
  importOne:async(_client,uid,file,metadata)=>{
   inFlight++;peak=Math.max(peak,inFlight);
   assert.equal(uid,"verified-admin");
   calls.push({file:file.name,title:metadata.titleFr,theme:metadata.theme});
   await Promise.resolve();inFlight--;
  },
  onProgress:value=>progress.push(value)
 });
 assert.equal(report.completed,3);
 assert.equal(report.failedIndex,null);
 assert.equal(report.error,"");
 assert.equal(peak,1,"Pas d'uploads parallèles concurrents");
 assert.deepEqual(calls.map(x=>x.title),["se laver les mains","ÉCOLE 02","pomme"]);
 assert.deepEqual(progress.map(p=>p.completed),[1,2,3]);
 assert.ok(progress.every(p=>p.total===3));
});
test("Une erreur de serveur stoppe le lot sans réessayer ni importer les autres",async()=>{
 const calls=[];
 const report=await importPrivateDraftBatch({},"verified-admin",files(),"autres",{
  importOne:async(_c,_u,file)=>{
   calls.push(file.name);
   if(file.name==="ÉCOLE-02.PNG")throw new Error("Importation incertaine : PNG conservé");
  }
 });
 assert.deepEqual(calls,["se_laver_les_mains.png","ÉCOLE-02.PNG"]);
 assert.equal(report.completed,1);
 assert.equal(report.failedIndex,1);
 assert.equal(report.name,"ÉCOLE 02");
 assert.match(report.error,/incertaine/);
});
test("Changement de session arrête les fichiers restants, sans créer de deuxième import",async()=>{
 let sent=0,confirmed=0;
 const report=await importPrivateDraftBatch({},"admin",files(),"autres",{
  isCurrent:()=>confirmed===0,
  importOne:async()=>{sent++;confirmed++;}
 });
 assert.equal(sent,1);assert.equal(report.completed,1);
 assert.equal(report.failedIndex,1);
 assert.match(report.error,/Session/);
});
test("Une erreur d'affichage après INSERT n'entraîne aucune répétition de l'import",async()=>{
 let sent=0;
 const report=await importPrivateDraftBatch({},"admin",[png("pause.png")],"autres",{
  importOne:async()=>{sent++;},onProgress:()=>{throw new Error("DOM indisponible");}
 });
 assert.equal(sent,1);assert.equal(report.completed,1);assert.equal(report.error,"");
});
test("Le vrai Super Admin affiche le lot, le prévalide et conserve l'import simple",()=>{
 const app=readFileSync(new URL("../src/app.js",import.meta.url),"utf8");
 assert.match(app,/data-form="admin-batch-import"/);
 assert.match(app,/data-field="admin-batch-files"/);
 assert.match(app,/multiple/);
 assert.match(app,/MAX_PRIVATE_DRAFT_BATCH/);
 assert.match(app,/data-field="admin-batch-theme"/);
 assert.match(app,/window\.confirm/);
 assert.match(app,/await importPrivateDraftBatch\(client,uid,files,theme/);
 assert.match(app,/isCurrent:current/);
 assert.match(app,/if\(report\.error\)/);
 assert.match(app,/batchImport\.files=\[\]/);
 assert.match(app,/batchImport\.request\+\+/);
 assert.match(app,/batchImport\.busy=true/);
 assert.match(app,/privateImport\.loading\|\|privateImport\.checking\|\|!privateImport\.validated\|\|batchImport\.busy/);
 assert.match(app,/await importPrivateDraft\(client,userId,file,metadata\)/);
});

test("Émilie corrige chaque nom français avant l'import sans modifier les PNG",async()=>{
 const input=files();
 const titles=[" Se laver  les mains ","École","Pomme verte"];
 const entries=await preparePrivateDraftBatch(input,"hygiene",titles);
 assert.deepEqual(entries.map(x=>x.metadata.titleFr),["Se laver les mains","École","Pomme verte"]);
 assert.deepEqual(entries.map(x=>x.file),input);
 assert.deepEqual(titles,[" Se laver  les mains ","École","Pomme verte"]);
 const calls=[];
 const report=await importPrivateDraftBatch({},"verified-admin",input,"hygiene",{
  titles,importOne:async(_c,_uid,file,metadata)=>{calls.push([file.name,metadata.titleFr]);}
 });
 assert.equal(report.completed,3);
 assert.equal(report.failedIndex,null);
 assert.deepEqual(calls.map(x=>x[1]),["Se laver les mains","École","Pomme verte"]);
});

test("Des noms corrigés incohérents bloquent tout le lot AVANT la première écriture",async()=>{
 const input=files();
 for(const titles of [
  ["Lavage","École"],["Nom","École","Pomme","Extra"],
  ["Pause"," PAUSE ","Pomme"],["","École","Pomme"],
  ["   ","École","Pomme"],["a".repeat(101),"École","Pomme"],
  ["Bon",null,"Pomme"],"noms"
 ]){
  let writes=0;
  await assert.rejects(importPrivateDraftBatch({},"admin",input,"hygiene",{
   titles,importOne:async()=>{writes++;}
  }),/noms|nom français|même nom/i);
  assert.equal(writes,0);
 }
 const sameNames=[png("pomme_rouge.png"),png("POMME-ROUGE.png")];
 const fixed=await preparePrivateDraftBatch(sameNames,"autres",["Pomme rouge","Pomme verte"]);
 assert.deepEqual(fixed.map(e=>e.metadata.titleFr),["Pomme rouge","Pomme verte"]);
 let writes=0;
 await assert.rejects(importPrivateDraftBatch({},"admin",
  [png("vrai.png"),png("faux.png",new TextEncoder().encode("<svg>bad</svg>"))],"autres",{
   titles:["Vrai","Autre"],importOne:async()=>{writes++;}
  }),/signature/i);
 assert.equal(writes,0);
});

test("Formulaire de lot : titres éditables bilingues, sauvegardés au clavier et verrouillés pendant l'envoi",()=>{
 const app=readFileSync(new URL("../src/app.js",import.meta.url),"utf8");
 const style=readFileSync(new URL("../src/styles.css",import.meta.url),"utf8");
 assert.match(app,/data-input="admin-batch-title"/);
 assert.match(app,/data-index="'\+index/);
 assert.match(app,/maxlength="100" required/);
 assert.match(app,/batchImport\.titles\[index\]=event\.target\.value/);
 assert.match(app,/batchImport\.titles=titles/);
 assert.match(app,/titles=\[\.\.\.batchImport\.titles\]/);
 assert.match(app,/titles,isCurrent:current/);
 assert.match(app,/batchImport\.files=\[\];batchImport\.titles=\[\]/);
 assert.match(app,/Corrigez le nom français/);
 assert.match(app,/Edit each French title/);
 assert.match(app,/batchImport\.busy\?' disabled'/);
 assert.match(app,/esc\(batchImport\.titles\[index\]/);
 assert.match(style,/\.admin-batch-list input\[type="text"\]/);
 assert.match(style,/min-height:44px/);
 assert.match(style,/@media\(max-width:480px\)\{\.admin-batch-list li/);
});

const confirmedDraftIds=[
 "11111111-1111-4111-8111-111111111111",
 "22222222-2222-4222-8222-222222222222",
 "33333333-3333-4333-8333-333333333333"
];

test("Après un lot complet, seuls les IDs SQL des trois vrais reçus sont conservés",async()=>{
 let sent=0;
 const report=await importPrivateDraftBatch({},"admin",files(),"autres",{
  importOne:async()=>({id:confirmedDraftIds[sent++],status:"draft"})
 });
 assert.equal(sent,3);
 assert.equal(report.completed,3);
 assert.equal(report.error,"");
 assert.deepEqual(report.confirmedIds,confirmedDraftIds);
});
test("En cas d'échec partiel, préserver uniquement les reçus déjà confirmés",async()=>{
 let calls=0;
 const report=await importPrivateDraftBatch({},"admin",files(),"autres",{
  importOne:async()=>{
   if(calls++===1)throw Error("ACK privé incertain");
   return{id:confirmedDraftIds[0],status:"draft"};
  }
 });
 assert.equal(calls,2,"Pas de troisième import ni de tentative automatique");
 assert.equal(report.completed,1);
 assert.equal(report.failedIndex,1);
 assert.deepEqual(report.confirmedIds,[confirmedDraftIds[0]]);
 assert.match(report.error,/incertain/);
});
test("Session invalidée après un reçu : conserver le progrès et arrêter sans doublon",async()=>{
 let count=0,active=true;
 const report=await importPrivateDraftBatch({},"admin",files(),"autres",{
  isCurrent:()=>active,
  importOne:async()=>{count++;active=false;return{id:confirmedDraftIds[0],status:"draft"};}
 });
 assert.equal(count,1);
 assert.equal(report.completed,1);
 assert.equal(report.failedIndex,1);
 assert.deepEqual(report.confirmedIds,[confirmedDraftIds[0]]);
 assert.match(report.error,/Session/);
});
test("ID de reçu erroné ou répété : ne jamais annoncer une nouvelle fiche valide",async()=>{
 for(const ids of [["pas-un-uuid"],[confirmedDraftIds[0],confirmedDraftIds[0]]]){
  let calls=0;
  const report=await importPrivateDraftBatch({},"admin",files(),"autres",{
   importOne:async()=>({id:ids[Math.min(calls++,ids.length-1)],status:"draft"})
  });
  assert.equal(report.failedIndex,ids.length-1);
  assert.equal(report.completed,ids.length-1);
  assert.deepEqual(report.confirmedIds,ids.length===1?[]:[confirmedDraftIds[0]]);
  assert.match(report.error,/Reçu du brouillon invalide/);
 }
});
test("L'écran ouvre après succès uniquement un brouillon revenu de la Banque sous le même admin",()=>{
 const app=readFileSync(new URL("../src/app.js",import.meta.url),"utf8");
 const start=app.indexOf("if(event.target.matches('form[data-form=\"admin-batch-import\"]'))");
 const end=app.indexOf("const form=event.target.closest('form[data-form=\"admin-import\"]')",start);
 assert.ok(start>0&&end>start);
 const body=app.slice(start,end);
 assert.match(body,/if\(!report\.error\)/);
 assert.match(body,/Array\.isArray\(report\.confirmedIds\)/);
 assert.match(body,/report\.confirmedIds\]\.reverse\(\)/);
 assert.match(body,/row\.id===id&&/);
 assert.match(body,/row\.created_by===uid&&row\.status==="draft"/);
 assert.match(body,/void openAdminPreview\(imported\.id\)/);
 assert.doesNotMatch(body,/publishReviewedPictogram|upsert\(/);
});
