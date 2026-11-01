import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {selectApprovedItem,addApprovedPage,canPrepareApproved} from "../src/official-composer.js";
import {planPreparedPdf} from "../src/print-pdf.js";
import {DEFAULT_PRESET} from "../src/core.js";

const app=readFileSync(new URL("../src/app.js",import.meta.url),"utf8");
const uid="33333333-3333-4333-8333-333333333333";
const row={id:uid,title_fr:"se laver les mains",title_en:"wash hands",
  theme:"hygiene",image_path:"items/"+uid+".png"};
const png=()=>{const b=new Uint8Array(40);b.set([137,80,78,71,13,10,26,10]);return new Blob([b],{type:"image/png"});};

test("Un pictogramme réellement approuvé peut préparer un tableau PDF avec une case",()=>{
 const items=selectApprovedItem([],row,"board");
 assert.equal(items.length,1);
 assert.ok(canPrepareApproved({kind:"board",items,widthCm:5,paper:"letter",columns:2}));
 const plan=planPreparedPdf({
  items:[{fr:row.title_fr,en:row.title_en,pngBlob:png()}],
  kind:"board",widthCm:5,paper:"letter",columns:2,language:"fr",
  title:"Mon tableau",preset:{...DEFAULT_PRESET,colored:false},separatorMode:"simple"
 });
 assert.equal(plan.pages.length,1);
 assert.equal(plan.widthMm,50);
 assert.equal(plan.kind,"board");
});
test("Une sélection officielle multiple respecte les pictos existants sans ouvrir une routine incomplète",()=>{
 const another={...row,id:"44444444-4444-4444-8444-444444444444",
   image_path:"items/44444444-4444-4444-8444-444444444444.png"};
 const existing=[selectApprovedItem([],row,"board")[0]];
 const result=addApprovedPage(existing,[row,another],"board");
 assert.equal(result.added,1);
 assert.equal(result.items.length,2);
 assert.equal(existing.length,1,"Ne jamais écraser le tableau existant");
 assert.deepEqual(result.items.map(x=>x.id),[row.id,another.id]);
 assert.throws(()=>selectApprovedItem([], {...row,image_path:"private/draft.png"},"board"),
   /invalide/);
});
test("La transition au tableau ne publie ni ne crée de PDF à elle seule",()=>{
 const start=app.indexOf("function openVerifiedCatalogBoard(){");
 const end=app.indexOf("function renderSingleApprovedAddFeedback(page){",start);
 assert.ok(start>=0&&end>start,"Fonction de navigation du vrai client");
 const source=app.slice(start,end);
 let reset=0,clearPrint=0,clearPreview=0,renders=0,scrolls=0;
 const state={page:"library",toast:"ancien message"};
 const run=new Function("state","resetSingleApprovedAdd","clearPdfReprintRetry",
   "clearClientPreview","render","window",
   "let clientNavigationEpoch=7;"+source+"openVerifiedCatalogBoard();return clientNavigationEpoch;");
 const next=run(state,()=>{reset++;},()=>{clearPrint++;},()=>{clearPreview++;},
   ()=>{renders++;},{scrollTo(){scrolls++;}});
 assert.equal(state.page,"boards");
 assert.equal(state.toast,"");
 assert.equal(next,8);
 assert.equal(reset,1);
 assert.equal(clearPrint,1);
 assert.equal(clearPreview,1);
 assert.equal(renders,1);
 assert.equal(scrolls,1);
 assert.doesNotMatch(source,/archivePdf|createPreparedPdf|publishReviewedPictogram|\.insert\(/);
});
test("Le clic de transition n'arrive qu'après relecture Supabase des fiches publiées",()=>{
 const singleStart=app.indexOf('if((a==="approved-add"||a==="approved-open-board")');
 const batchStart=app.indexOf('if((a==="catalog-bulk-add"||a==="catalog-bulk-open-board")');
 assert.ok(singleStart>0&&batchStart>0);
 const single=app.slice(singleStart,app.indexOf('if((a==="approved-remove"',singleStart));
 const batch=app.slice(batchStart,singleStart);
 for(const [name,source] of [["single",single],["batch",batch]]){
  const approval=source.indexOf("await loadApprovedSelection(");
  const open=source.indexOf("openVerifiedCatalogBoard();");
  assert.ok(approval>=0&&open>approval,
    name+": aucun passage au tableau avant la revalidation serveur");
  assert.match(source,/if\(!(?:stillCurrent|current)\(\)\)return/);
  assert.match(source,/if\(openBoard\)/);
 }
});
test("Les deux boutons bilingues sont présents sur les vraies cartes et la sélection",()=>{
 assert.ok(app.includes('data-action="approved-open-board"'));
 assert.ok(app.includes('data-action="catalog-bulk-open-board"'));
 assert.ok(app.includes("Ajouter et ouvrir le tableau"));
 assert.ok(app.includes("Add & open board"));
 assert.match(app,/officialComposer\.board\.length>=16/);
});
