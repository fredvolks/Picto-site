import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {assessDraftPrimaryTheme} from "../app/src/admin-quality.js";

const themes=[
 {code:"autres",merged_into:null},
 {code:"hygiene",merged_into:null},
 {code:"tests",merged_into:"autres"}
];
const record={id:"11111111-1111-4111-8111-111111111111",status:"draft",theme:"hygiene"};

test("L2: seule la catégorie principale active et vérifiée passe le précontrôle",()=>{
 assert.deepEqual(assessDraftPrimaryTheme(record,themes,{verified:true}),{state:"ready",target:null});
 assert.deepEqual(assessDraftPrimaryTheme({...record,theme:"tests"},themes,{verified:true}),
   {state:"merged",target:"autres"});
 assert.deepEqual(assessDraftPrimaryTheme({...record,theme:"disparu"},themes,{verified:true}),
   {state:"missing",target:null});
 assert.deepEqual(assessDraftPrimaryTheme(record,themes),{state:"unknown",target:null});
 assert.deepEqual(assessDraftPrimaryTheme(record,null,{verified:true}),{state:"unknown",target:null});
 assert.deepEqual(assessDraftPrimaryTheme({...record,status:"published"},themes,{verified:true}),
   {state:"not-draft",target:null});
});

test("L2: public conserve la Banque existante et rend la correction possible sans publier",()=>{
 const app=readFileSync(new URL("../app/src/app.js",import.meta.url),"utf8");
 const css=readFileSync(new URL("../app/src/styles.css",import.meta.url),"utf8");
 assert.ok(app.includes("const primaryThemePreflight=assessDraftPrimaryTheme(chosen,themeUI.items"));
 assert.ok(app.includes('const primaryThemePanel=selectedAsset?.status==="draft"'));
 assert.ok(app.includes("const inspectorContent=renameForm+themeAssetPanel+privatePreviewBody+draftEditBody"));
 assert.ok(app.includes('data-action="admin-edit-draft"'));
 assert.ok(app.includes('data-action="admin-draft-review-resume"'));
 assert.ok(app.includes("themeUI.items.filter(t=>!t.merged_into).map(t=>t.code)"));
 assert.ok(app.includes("const proposedThemeReady=assessDraftPrimaryTheme("));
 assert.ok(app.includes("draftReviewQueue.seen.delete(assetId)"));
 assert.ok(app.includes('if(a==="admin-draft-review-resume")'));
 assert.match(app,/if\(assessDraftPrimaryTheme\(asset,themeUI\.items,\{/);
 assert.ok(app.includes("(publishedCatalog.publishing||!primaryThemeReady?' disabled':'')"));
 assert.ok(app.includes("DRAFT_METADATA_WRITES_ENABLED"));
 assert.ok(css.includes(".pa-bank-sheet .pa-bank-primary-theme .btn{min-height:44px"));
});

test("La navigation ne perd jamais les deux sortes de modifications d'une fiche",()=>{
 const app=readFileSync(new URL("../app/src/app.js",import.meta.url),"utf8");
 const start=app.indexOf("function hasUnsavedBankEdits(){");
 const end=app.indexOf("function confirmDiscardBankEdits(){",start);
 assert.ok(start>0&&end>start,"Détecteur de modifications en attente présent");
 const body=app.slice(start,end);
 assert.match(body,/const renameDirty=Boolean/);
 assert.match(body,/const metadataDirty=Boolean/);
 assert.match(body,/return renameDirty\|\|metadataDirty\|\|bankSheetDirty\(\)/,
   "Ne pas oublier les ajustements du PNG pendant l'édition des métadonnées");
 for(const action of ["close-admin-edit","refresh-admin-bank","admin-bank-page",
   "admin-draft-review-start","admin-preview","admin-rename"]){
   const begin=app.indexOf('if(a==="'+action+'")');
   assert.ok(begin>0,action+" doit exister");
   const control=app.slice(begin,begin+480);
   assert.ok(control.includes("confirmDiscardBankEdits()"),
     action+" doit refuser la navigation lorsque l'utilisateur annule");
 }
});

test("La navigation protège aussi la fermeture de l’aperçu et les actions historiques",()=>{
 const app=readFileSync(new URL("../app/src/app.js",import.meta.url),"utf8");
 const pending=app.slice(app.indexOf("function confirmDiscardBankEdits(){"),
   app.indexOf("function focusBankInspector(){"));
 assert.match(pending,/bankImageSheet\.busy\|\|draftEditor\.saving\|\|bankRename\.busy\|\|publishedCatalog\.publishing/,
   "Une écriture en cours ne peut pas être abandonnée sans reçu");
 for(const action of ["admin-theme-asset","admin-rename-cancel","close-admin-preview",
   "admin-review-next","admin-view-published"]){
   const start=app.indexOf('if(a==="'+action+'")');
   assert.ok(start>0,"Action existante : "+action);
   assert.ok(app.slice(start,start+490).includes("confirmDiscardBankEdits()"),
     action+" ne doit pas perdre une modification non enregistrée");
 }
});

test("L'ancien formulaire ne réapparaît pas après un abandon confirmé",()=>{
 const app=readFileSync(new URL("../app/src/app.js",import.meta.url),"utf8");
 for(const action of ["admin-preview","admin-preview-retry","close-admin-preview",
   "admin-draft-review-next","admin-draft-review-stop","admin-review-next"]){
   const start=app.indexOf('if(a==="'+action+'")');
   assert.ok(start>=0,action+" existe");
   const code=app.slice(start,start+820);
   assert.match(code,/clearDraftEditor\(\);clearBankRename\(\)/,
     "L'état du brouillon précédent doit être nettoyé : "+action);
 }
});
