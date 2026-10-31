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
test("Page de création Design 3, tarif mensuel et parcours non transactionnel",()=>{
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
test("Le bouton Créer un compte de la connexion mène à la vraie page Design 3",()=>{
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
 assert.doesNotMatch(html,/<img\b|laptop-lines|phone-lines|phone-heading/);
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
