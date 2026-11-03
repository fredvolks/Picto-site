import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const app=readFileSync(new URL("../src/app.js",import.meta.url),"utf8");
const catalog=readFileSync(new URL("../src/catalog.js",import.meta.url),"utf8");
const pdfRecovery=readFileSync(new URL("../src/pdf-recovery-ui.js",import.meta.url),"utf8");

function section(begin,end){
 const from=app.indexOf(begin),to=app.indexOf(end,from+begin.length);
 assert.ok(from>=0&&to>from,"Bloc applicatif introuvable : "+begin);
 return app.slice(from,to);
}
test("La publication humaine part du PNG prévisualisé et non d'une fiche rechargée",()=>{
 const preview=section("async function openAdminPreview(","function canOpenAdmin");
 assert.match(preview,/privatePreview\.review=\{\.\.\.result\.asset,blob:result\.blob\}/);
 const form=section('const publishForm=event.target.closest','const usedForm=event.target.closest');
 assert.match(form,/privatePreview\.review\?\.id!==asset\.id/);
 const capture=form.indexOf("const reviewed={...privatePreview.review}");
 const network=form.indexOf("const client=await supabaseClient()",capture);
 const publish=form.indexOf("await publishReviewedPictogram(client,uid,asset.id,reviewed)",network);
 assert.ok(capture>=0&&network>capture&&publish>network);
 assert.match(catalog,/sourceDigest!==reviewedDigest/);
 assert.match(catalog,/await verifyReviewedDraftStillCurrent\(client,uid,source\.asset\)/);
});
test("L'export officiel vérifie le catalogue après rendu et avant l'archive",()=>{
 const block=section('const officialForm=event.target.closest','const uploadForm=event.target.closest');
 const pdf=block.indexOf("const {blob,pageCount}=await createPreparedPdf({");
 const approved=block.indexOf("await verifyApprovedPrintSnapshots(client,uid,rows)",pdf);
 const right=block.indexOf("const finalCaptionPermission=await readCaptionPermission(client,uid)",approved);
 const store=block.indexOf("await archivePdf(client,uid,blob",right);
 assert.ok(pdf>=0&&approved>pdf&&right>approved&&store>right);
});
test("La fiche individuelle contrôle le PNG avant et après la création PDF",()=>{
 const block=section('if(a==="client-template-print")','if(a==="admin-preview")');
 const loaded=block.indexOf("downloadPublishedArtwork(client,uid,row)");
 const first=block.indexOf("verifyApprovedPrintSnapshot(client,uid,row)",loaded);
 const pdf=block.indexOf("createPreparedPdf({",first);
 const again=block.indexOf("verifyApprovedPrintSnapshot(client,uid,row)",pdf);
 const archive=block.indexOf("archivePdf(client,uid,blob",again);
 assert.ok(loaded>=0&&first>loaded&&pdf>first&&again>pdf&&archive>again);
});
test("Le compte et le PDF non archivé restent isolés lors d'un rafraîchissement Auth",()=>{
 assert.match(app,/if\(request!==authRefreshRequest\)return;/);
 assert.match(app,/quarantinedAuthPdf=holdPdfOnAuthError\(/);
 assert.match(app,/releasePdfForVerifiedUser\(quarantinedAuthPdf,verified\.id\)/);
 assert.match(app,/\+\+authRefreshRequest;quarantinedAuthPdf=null;/);
 assert.match(pdfRecovery,/export function releasePdfForVerifiedUser/);
 assert.doesNotMatch(pdfRecovery,/localStorage\.setItem|sessionStorage\.setItem/);
});
test("Un seul document temporaire protège tous les parcours PDF",()=>{
 const lock=section("function hasPrivatePdfWorkInProgress(){","const testClients=");
 for(const value of ["pdfExportBusy","pdfRecoveryBusy","officialComposer.busy",
  "clientPictoTemplates.busy","clientFiles.busy","Boolean(pendingGeneratedPdf)"])
  assert.ok(lock.includes(value),"Verrou manquant : "+value);
 for(const key of ['if(a==="archive-generated-routine"','if(a==="client-template-print")',
  'const officialForm=event.target.closest','const uploadForm=event.target.closest'])
  assert.match(app.slice(app.indexOf(key),app.indexOf(key)+380),
   /hasPrivatePdfWorkInProgress\(\)/);
});
test("Les spécificités du site public Banque et tableau restent en place",()=>{
 assert.match(app,/function openVerifiedCatalogBoard\(\)/);
 assert.match(app,/const privateProof=/);
 assert.match(app,/focusBankInspector\(\)/);
 assert.match(app,/const publishFeedback=state\.adminTab==="bank"/);
 assert.match(app,/\+publishFeedback\+body/);
});
