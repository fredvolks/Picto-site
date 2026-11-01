import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const html=readFileSync("index.html","utf8");
const css=readFileSync("src/site.css","utf8");
const js=readFileSync("src/site.js","utf8");
const plan=readFileSync("forfait.html","utf8");
const read=path=>readFileSync(path,"utf8");

test("La page d'accueil a un seul bouton d'inscription, vers la page du forfait",()=>{
 assert.equal((html.match(/class="signup-button"/g)||[]).length,1);
 assert.match(html,/class="signup-button" href="\.\/forfait\.html"/);
 assert.doesNotMatch(html,/class="plan"|id="forfait"|Tarif à confirmer|Inscriptions à venir/);
 assert.doesNotMatch(html,/checkout|Stripe|paiement sécurisé|<form\b/i);
 assert.equal((html.match(/>Créer mon compte</g)||[]).length,1);
});
test("Page de création Design 5, tarif mensuel et parcours non transactionnel",()=>{
 assert.match(plan,/class="signup-page"/);
 assert.match(plan,/9,99/);
 assert.match(plan,/data-fr=/);assert.match(plan,/data-en=/);
 for(const id of ["signup-name","signup-email","signup-password","signup-consent"])
   assert.match(plan,new RegExp('id="'+id+'"'));
 assert.match(plan,/id="signup-form"/);
 assert.match(plan,/href="\.\/app\/"/);
 assert.match(plan,/href="\.\/conditions\.html"/);
 assert.match(plan,/href="\.\/confidentialite\.html"/);
 assert.match(plan,/Les inscriptions ne sont pas encore ouvertes/);
 assert.match(plan,/event\.preventDefault\(\)/);
 assert.doesNotMatch(plan,/auth\.signUp\(|checkout\.sessions|stripe\.redirectToCheckout|fetch\(/i);
 assert.doesNotMatch(plan,/type="checkbox" checked/);
});
test("Le bouton Créer un compte de la connexion mène à la vraie page Design 5",()=>{
 const app=read("app/src/app.js");
 assert.match(app,/class="hosted-signup"/);
 assert.match(app,/href="\.\.\/forfait\.html"/);
 assert.doesNotMatch(app,/href="\.\.\/index\.html#forfait"/);
 assert.match(plan,/class="signup-page"/);
 assert.match(plan,/9,99/);
});
test("Connexion directe visible sur mobile et PC, sans faux menu",()=>{
 assert.equal((html.match(/class="signin login-link"/g)||[]).length,1);
 assert.match(html,/<a class="signin login-link" href="\.\/app\/"/);
 assert.match(html,/data-fr-aria="Se connecter à mon espace Pict-au"/);
 assert.match(html,/data-en-aria="Sign in to my Pict-au space"/);
 assert.doesNotMatch(html,/hamburger|menu-toggle|google-login|supabase/i);
 assert.match(html,/\.login-link\{[^}]*min-height:44px/);
 const loginPage=read("connexion.html");
 assert.match(loginPage,/href="\.\/app\/"/);
 assert.match(loginPage,/class="info-back" href="\.\/forfait\.html"/);
 assert.match(loginPage,/data-fr="Créer un compte"/);
 assert.match(loginPage,/data-en="Create an account"/);
 assert.match(loginPage,/connectez-vous par courriel ou avec Google/);
 assert.match(loginPage,/uniquement les pictogrammes approuvés/);
 assert.match(loginPage,/Super Admin nécessite un compte expressément autorisé/);
});

test("Design 5 : exactement trois pictogrammes noirs et blancs avec légende séparée",()=>{
 assert.match(html,/<body data-pictau-home-design="5">/);
 assert.equal((html.match(/class="p-card card-[123]"/g)||[]).length,3);
 assert.equal((html.match(/class="picto-art"/g)||[]).length,3);
 assert.equal((html.match(/class="picto-label"/g)||[]).length,3);
 assert.equal((html.match(/<svg[^>]+aria-hidden="true"/g)||[]).length,3,"Les trois pictos sont décoratifs, pas des commandes interactives");
 for(const [fr,en] of [["Trouver","Find"],["Personnaliser","Personalize"],["Imprimer","Print"]])
   assert.match(html,new RegExp('data-fr="'+fr+'" data-en="'+en+'"'));
 assert.match(html,/\.picto-label\{[^}]*border-top:1\.8px solid #2c3834/);
 assert.match(html,/\.picto\{[^}]*border:1\.8px solid #2c3834/s);
 assert.match(html,/\.poster-tiles\{position:relative;display:grid;grid-template-columns:repeat\(3/);
 assert.doesNotMatch(html,/class="steps"|class="benefits"/);
});

test("L'accroche et le trio sont présentés une seule fois, sans fausse offre commerciale",()=>{
 assert.match(html,/Des pictogrammes/);
 assert.match(html,/pour un quotidien/);
 assert.match(html,/plus simple\./);
 assert.equal((html.match(/class="poster-bottom"/g)||[]).length,1);
 assert.equal((html.match(/class="poster-tiles"/g)||[]).length,1);
 assert.doesNotMatch(html,/Trouvez, personnalisez et imprimez vos supports visuels/);
 assert.doesNotMatch(html,/<form\b|Stripe|checkout\.sessions/i);
 assert.equal((html.match(/class="signup-button" href="\.\/forfait\.html"/g)||[]).length,1);
});

test("Design 5 : vrais repères accessibles et aucun faux appareil ou image privée",()=>{
 assert.match(html,/class="art-badge"/);
 assert.match(html,/class="poster-heading"/);
 assert.match(html,/class="poster-tiles"/);
 assert.match(html,/class="picto-art"/);
 assert.match(html,/\.p-card\{[^}]*aspect-ratio:/);
 assert.match(html,/@media\(min-width:751px\) and \(max-width:980px\) and \(orientation:portrait\)/);
 const heroMarkup=html.match(/<main\b[\s\S]*?<\/main>/)?.[0];
 assert.ok(heroMarkup,"La vitrine doit conserver son contenu principal");
 assert.doesNotMatch(heroMarkup,/<img\b|laptop-lines|phone-lines|phone-heading/,"Pas de faux appareils ou images de démonstration dans les pictogrammes");
 assert.doesNotMatch(html,/Illustrations fictives pour essayer le parcours/);
});

test("Langues FR/EN et pages d'information existantes préservées",()=>{
 assert.match(js,/localStorage\.setItem\("pictau-language"/);
 for(const item of ["contact.html","conditions.html","confidentialite.html","connexion.html","forfait.html"]){
  assert.match(read(item),/data-fr=/);
  assert.match(read(item),/data-en=/);
  assert.match(read(item),/href="\.\/index\.html"/);
 }
 for(const dest of ["contact.html","conditions.html","confidentialite.html"])
  assert.ok(html.includes('href="./'+dest+'"'));
});
test("Responsive de 320px au PC : accessibilité et défilement au zoom",()=>{
 assert.match(html,/100dvh/);
 assert.match(html,/@media\(max-width:520px\)/);
 assert.match(html,/@media\(max-width:750px\)/);
 assert.match(html,/@media\(max-height:545px\) and \(orientation:landscape\)/);
 assert.match(html,/@media\(max-height:500px\) and \(orientation:portrait\)/);
 assert.match(html,/overflow-y:auto/);
 assert.match(html,/class="skip"/);
 assert.match(html,/prefers-reduced-motion:reduce/);
 assert.match(html,/a:focus-visible,button:focus-visible/);
 assert.match(html,/localStorage\.setItem\('pictau-language',lang\)/);
 assert.match(html,/localStorage\.getItem\('pictau-language'\)/);
});

test("Parcours public Pict-au : Mes fichiers PDF et Mes brouillons FR/EN",async()=>{
 const {renderOfficialComposer}=await import("../app/src/official-composer.js");
 for(const kind of ["routine","board"])for(const language of ["fr","en"]){
  const html=renderOfficialComposer({kind,language,items:[],escape:x=>String(x),icon:()=>""});
  const files='data-action="nav" data-page="files"';
  const drafts='data-action="nav" data-page="create"';
  assert.equal(html.split(files).length-1,1);
  assert.equal(html.split(drafts).length-1,1);
  assert.ok(html.indexOf(drafts)<html.indexOf(files));
  assert.match(html,language==="fr"?/Voir mes fichiers PDF/:/View my PDF files/);
  assert.match(html,language==="fr"?/Mes brouillons/:/My drafts/);
  assert.doesNotMatch(html,/Mes créations|My creations/);
  assert.match(html,/data-print-fit/,"L'aide d'impression publique demeure visible");
 }
 const router=read("app/src/app.js");
 assert.match(router,/if\(a==="nav"\)/);
 assert.match(router,/if\(state\.page==="files"&&authStatus\.user\)refreshFilesForCurrentUser\(\)/);
});

test("Mes brouillons publics : une page vide ou partielle ne masque pas les documents",async()=>{
 const {listEditableDraftsAvailablePage}=await import("../app/src/client-drafts.js");
 const uid="11111111-1111-4111-8111-111111111111";
 const row={id:"33333333-3333-4333-8333-333333333333",owner_id:uid,revision:1,
  kind:"routine",title:"Ma routine",content:{items:[],settings:{
   title:"Ma routine",widthCm:"3",paper:"letter",columns:"3"
  }}};
 function createMock(counts,mode=[]){
  let index=0;const ranges=[];
  const q={
   eq(name,val){assert.equal(name,"owner_id");assert.equal(val,uid);return q;},
   order(){return q;},
   async range(start,end){
    ranges.push([start,end]);
    const current=index++,count=counts[Math.min(current,counts.length-1)];
    const size=Math.max(0,Math.min(count-start,end-start+1));
    const data=Array.from({length:size},()=>({...row}));
    return {count,data:mode[current]==="empty"?[]:mode[current]==="partial"?data.slice(0,Math.max(0,size-2)):data,error:null};
   }
  };
  return {ranges,client:{auth:{async getUser(){return {data:{user:{id:uid}},error:null};}},
   from(name){assert.equal(name,"pictau_editable_drafts");return {
    select(fields,opts){assert.equal(opts.count,"exact");return q;}
   };}
  }};
 }
 const empty=createMock([31,31],["empty","full"]);
 const recovered=await listEditableDraftsAvailablePage(empty.client,uid,{page:0});
 assert.equal(recovered.items.length,30);assert.equal(recovered.total,31);
 assert.deepEqual(empty.ranges,[[0,29],[0,29]]);
 const partial=createMock([61,61],["partial","full"]);
 assert.equal((await listEditableDraftsAvailablePage(partial.client,uid,{page:0})).items.length,30);
 assert.equal(partial.ranges.length,2);
 const stale=createMock([61,31,31]);
 const remaining=await listEditableDraftsAvailablePage(stale.client,uid,{page:4});
 assert.equal(remaining.page,1);assert.equal(remaining.items.length,1);
 assert.deepEqual(stale.ranges,[[120,149],[60,89],[30,59]]);
 const contradictory=createMock([31,31,31],["empty","empty","empty"]);
 await assert.rejects(listEditableDraftsAvailablePage(contradictory.client,uid,{page:0}),/Actualisez Mes brouillons/);
 assert.equal(contradictory.ranges.length,3);
 const none=createMock([0]);
 assert.equal((await listEditableDraftsAvailablePage(none.client,uid,{page:2})).total,0);
});

test("Design 5 inscription : même charte et trio que la vitrine L’Affiche",()=>{
 assert.match(plan,/data-pictau-signup-design="5"/);
 for(const c of ["#f5f5f0","#26352f","#607a6f","#62766d","#d7e0d8"])
  assert.ok(plan.includes(c)&&html.includes(c),"Palette commune : "+c);
 assert.match(plan,/Créez et personnalisez vos repères visuels/);
 assert.equal((plan.match(/class="p-card card-[123]"/g)||[]).length,3);
 assert.equal((plan.match(/class="picto-art"/g)||[]).length,3);
 for(const label of ["Trouver","Personnaliser","Imprimer","Find","Personalize","Print"])
  assert.ok(plan.includes(label),"Libellé : "+label);
 assert.match(plan,/class="signup-login" href="\.\/app\/"/);
 assert.doesNotMatch(plan,/#e9f4f8|#28617c|#357b96|#255b74/i);
 assert.doesNotMatch(plan,/signup-plan-ray|rayon-decor|decorative-ray/i);
});
test("Design 5 inscription : formulaire accessible sur PC, tablette et mobile",()=>{
 assert.match(plan,/class="signup-skip"/);
 assert.match(plan,/@media\(max-width:899px\)/);
 assert.match(plan,/@media\(max-width:520px\)/);
 assert.match(plan,/grid-template-columns:minmax\(0,1\.08fr\) minmax\(0,\.92fr\)/);
 assert.match(plan,/\.signup-page\{width:min\(100% - 40px,760px\);display:flex;flex-direction:column/);
 assert.match(plan,/prefers-reduced-motion:reduce/);
 assert.doesNotMatch(plan,/(?:html|body|\\.signup-page)\\{[^}]*overflow(?:-y)?\\s*:\\s*hidden/,"Page must allow scrolling when zoomed; pictogram framing may clip its art");
 assert.match(plan,/for\(const element of document\.querySelectorAll\("\[data-fr-aria\]\[data-en-aria\]"\)\)/);
});

test('accueil → inscription utilise exactement le même logo et les mêmes dessins SVG',()=>{
 const a=html.match(/<a class="brand home-logo"[^>]*>(.*?)<\/a>/)?.[1];
 const b=plan.match(/<a class="brand home-logo signup-brand"[^>]*>(.*?)<\/a>/)?.[1];
 assert.ok(a);assert.equal(a,b);
 const pics=s=>[...s.matchAll(/<svg viewBox="0 0 92 92"[^>]*>[\s\S]*?<\/svg>/g)].map(m=>m[0]);
 assert.equal(pics(html).length,3);assert.deepEqual(pics(plan),pics(html));
 assert.match(plan,/\.signup-tiles \.picto-label\{[^}]*border-top:1\.8px solid #2c3834/);
});


test("logo Le Fil archivé et identique sur les en-têtes publics",()=>{
  const full=read("branding/pictau-logo-le-fil.svg");
  const compact=read("branding/pictau-logo-le-fil-mobile.svg");
  const pages=["index.html","forfait.html","connexion.html","contact.html","conditions.html","confidentialite.html"];
  assert.match(full,/viewBox="116 103 760 116"/);
  assert.match(full,/id="pictau-wordmark"/);
  assert.match(compact,/id="pictau-wordmark"/);
  assert.match(compact,/id="pictau-progress-tiles"/);
  const tiles=[...compact.matchAll(/<rect[^>]*width="(\d+)" height="(\d+)"[^>]*>/g)];
  assert.equal(tiles.length,3,"Le logo mobile doit afficher les trois carrés");
  for(const [,w,h] of tiles) assert.equal(w,h,"Les tuiles sont carrées");
  const glyphs=svg=>svg.match(/<g id="pictau-wordmark"[^>]*>([\s\S]*?)<\/g>/)?.[1];
  assert.equal(glyphs(compact),glyphs(full),"Lettrage identique sur mobile et PC");
  assert.doesNotMatch(full,/font-family|Comic Sans|Patrick Hand/);
  assert.doesNotMatch(compact,/font-family|Comic Sans|Patrick Hand/);
  for(const name of pages){
    const source=read(name);
    assert.match(source,/src="\.\/branding\/pictau-logo-le-fil\.svg"/,name+" image du logo");
    assert.match(source,/srcset="\.\/branding\/pictau-logo-le-fil-mobile\.svg"/,name+" version mobile");
    assert.match(source,/<picture><source media="\(max-width: 680px\)"/,name+" logo responsive");
  }
});
