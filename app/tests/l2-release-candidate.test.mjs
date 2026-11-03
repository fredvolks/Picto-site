import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {listPublishedCatalog,normalizeCatalogFilters} from "../src/catalog.js";
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

test("La recherche du catalogue L2 garde les mots FR/EN et les apostrophes avant pagination",async()=>{
 const uid="11111111-1111-4111-8111-111111111111";
 const id="33333333-3333-4333-8333-333333333333";
 const row={id,title_fr:"Laver les mains",title_en:"Wash hands",theme:"hygiene",
   image_path:"items/"+id+".png",published_at:"2026-11-03T12:00:00Z"};
 const queries=[];
 const client={
   auth:{getUser:async()=>({data:{user:{id:uid}},error:null})},
   from(table){
     assert.equal(table,"pictau_catalog_items","Aucun accès aux brouillons");
     return {select(){return{
       or(expression){queries.push(expression);return this;},
       order(){return this;},
       range(first,last){
         assert.deepEqual([first,last],[0,23]);
         return Promise.resolve({data:[row],count:1,error:null});
       }
     };}};
   }
 };
 const found=await listPublishedCatalog(client,uid,{query:"laver mains"});
 assert.equal(found.total,1);
 assert.equal(found.items[0].id,id);
 assert.equal(queries[0],
   "and(or(title_fr.ilike.%laver%,title_en.ilike.%laver%),or(title_fr.ilike.%mains%,title_en.ilike.%mains%))");
 assert.equal(normalizeCatalogFilters({query:"l’école"}).query,"l’école");
 await listPublishedCatalog(client,uid,{query:"l'école"});
 assert.match(queries[1],/title_fr\.ilike\.%l’école%/);
 assert.match(queries[1],/title_fr\.ilike\.%l'école%/);
 assert.throws(()=>normalizeCatalogFilters({query:"laver%"}),/invalide/);
});

test("La vignette indisponible se réessaie sans publier et avec un contrôle de session",()=>{
 const css=readFileSync(new URL("../src/styles.css",import.meta.url),"utf8");
 const loader=section("async function loadPublishedArtworkPreview(img){","function observePublishedArtwork(){");
 assert.match(loader,/publishedCatalog\.loadingImages\.has\(id\)/);
 assert.match(loader,/await downloadPublishedArtwork\(client,uid,row\)/);
 assert.match(loader,/authStatus\.user\?\.id!==uid/);
 assert.match(loader,/\.classList\.remove\("is-unavailable"\)/);
 assert.doesNotMatch(loader,/publishReviewedPictogram|upload\(/);
 const retry=section('if(a==="catalog-image-retry"','if(a==="catalog-refresh"');
 assert.match(retry,/publishedCatalog\.items\.some\(row=>row\.id===id\)/);
 assert.match(retry,/loadPublishedArtworkPreview\(img\)/);
 const card=section("function renderClientLibrary(){","function renderClientUsed(){");
 assert.match(card,/pa-catalog-image-error/);
 assert.match(card,/pa-catalog-image-retry/);
 assert.match(card,/Image indisponible/);
 assert.match(card,/Image unavailable/);
 assert.match(css,/\.pa-catalog-art\.is-unavailable \.pa-catalog-image-retry/);
 assert.match(css,/min-height:44px/);
});
