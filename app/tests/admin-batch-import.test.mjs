import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {
 draftTitleFromFilename,preparePrivateDraftBatch,importPrivateDraftBatch,
 MAX_PRIVATE_DRAFT_BATCH
} from "../src/admin-import.js";

const header=Uint8Array.from([137,80,78,71,13,10,26,10]);
function png(name,bytes=header,type="image/png"){
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
 assert.match(app,/privateImport\.loading\|\|batchImport\.busy/);
 assert.match(app,/await importPrivateDraft\(client,userId,file,metadata\)/);
});
