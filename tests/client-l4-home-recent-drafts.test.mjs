import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const app=readFileSync(new URL("../app/src/app.js",import.meta.url),"utf8");
function section(start,end){
 const i=app.indexOf(start),j=app.indexOf(end,i+start.length);
 assert.ok(i>=0&&j>i,"Le parcours réel doit rester repérable : "+start);
 return app.slice(i,j);
}
const service=section("async function fetchHomeDrafts(","function composerSource(");
const home=section("function renderClientHome(){","function renderClientLibrary(){");
const open=section('if(a==="draft-open"','if(a==="draft-rename-open"');

test("Accueil : les deux brouillons les plus récents viennent de la liste PRIVÉE et non de Mes fichiers",()=>{
 assert.match(service,/listEditableDraftsAvailablePage\(client,uid,\{/);
 assert.match(service,/page:0,kind:"all",query:"",sort:"recent"/);
 assert.match(service,/homeDrafts\.items=result\.items\.slice\(0,2\)/);
 assert.doesNotMatch(service,/listMyDocuments|localStorage|publishReviewedPictogram|\.insert\(/);
 const drafts=section("async function fetchEditableDrafts(","// Les brouillons récents de l'accueil");
 assert.match(drafts,/kind:editableDrafts\.kind,query:editableDrafts\.query,sort:editableDrafts\.sort/);
 assert.doesNotMatch(service,/editableDrafts\.page=|editableDrafts\.kind=|editableDrafts\.query=/,
   "Le raccourci ne doit pas remplacer les filtres choisis dans Mes brouillons");
});

test("Changement de session et réponses périmées : aucune fiche d'un autre compte affichée",()=>{
 assert.match(service,/authStatus\.user\?\.id!==uid/);
 assert.match(service,/ticket!==homeDrafts\.request/);
 assert.match(service,/canOpenAdmin\(\)/);
 assert.match(app,/resetOfficialComposer\(\);resetEditableDrafts\(\);resetHomeDrafts\(\);/);
 const reset=section("function resetHomeDrafts(){","async function fetchHomeDrafts(");
 assert.match(reset,/homeDrafts\.request\+\+/);
 assert.match(reset,/homeDrafts\.items=\[\]/);
 assert.doesNotMatch(service,/roleReady\s*=\s*true|privateBank\.allowed\s*=\s*false/);
});

test("Accueil : vrais boutons Reprendre, titres échappés et erreurs distinctes FR/EN",()=>{
 assert.match(home,/class="pa-client-recent-drafts|pa-client-recent-drafts/);
 assert.match(home,/id="pa-client-recent-drafts-title"/);
 assert.match(home,/Mes brouillons récents/);
 assert.match(home,/My recent drafts/);
 assert.match(home,/summarizeEditableDraftItems\(doc,state\.language\)\.count/);
 assert.match(home,/data-action="draft-open" data-id="/);
 assert.match(home,/esc\(doc\.id\)/);
 assert.match(home,/esc\(doc\.title\)/);
 assert.match(home,/fr\?'Reprendre':'Resume'/);
 assert.match(home,/homeDrafts\.loading\?'<p role="status"/);
 assert.match(home,/homeDrafts\.error\?'<div><p role="alert"/);
 assert.match(home,/data-action="home-drafts-refresh"/);
 assert.doesNotMatch(home,/PDF créé|Copie publiée/);
});

test("Reprise : même relecture Auth et protection de la composition que Mes brouillons",()=>{
 assert.match(open,/state\.page==="home"\?homeDrafts\.items:editableDrafts\.items/);
 assert.match(open,/beginDraftReplacement\(draftAutosave,row\.kind/);
 assert.match(open,/confirmDiscard:/);
 assert.match(open,/loadEditableDraft\(client,uid,id\)/);
 assert.match(open,/clientNavigationEpoch!==navigation/);
 assert.match(open,/doc\.kind!==row\.kind/);
 assert.match(open,/officialComposer\[doc\.kind\]=doc\.content\.items/);
 assert.match(open,/editableDrafts\.current\[doc\.kind\]=\{id:doc\.id,revision:doc\.revision\}/);
 assert.doesNotMatch(open,/deleteEditableDraft\(|archivePdf\(|publishReviewedPictogram\(/);
});

test("Accueil : retour à la liste lors d'un échec, sans faire croire qu'un brouillon a été ouvert",()=>{
 assert.match(open,/if\(originPage==="home"\)/);
 assert.match(open,/homeDrafts\.error=stale\?/);
 assert.match(open,/if\(stale&&originPage!=="home"\)void fetchEditableDrafts\(\)/);
 const click=section("if(a===\"home-drafts-refresh\"","if(a===\"draft-page\"");
 assert.match(click,/state\.page==="home"/);
 assert.match(click,/void fetchHomeDrafts\(\)/);
 assert.match(app,/if\(state\.page==="home"&&SITE_EMBEDDED&&authStatus\.user\)/);
});
