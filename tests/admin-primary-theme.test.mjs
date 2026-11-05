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
