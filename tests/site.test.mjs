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
test("Connexion visible sans menu, en haut sur mobile comme sur PC",()=>{
 assert.equal((html.match(/class="login-link"/g)||[]).length,1);
 assert.match(html,/<a class="login-link" href="\.\/app\/">/);
 assert.doesNotMatch(html,/hamburger|menu-toggle|google-login|supabase/i);
 assert.doesNotMatch(css,/\.login-link\s*\{[^}]*display\s*:\s*none/);
 const loginPage=read("connexion.html");
 assert.match(loginPage,/href="\.\/app\/"/);
 assert.match(loginPage,/connectez-vous par courriel ou avec Google/);
 assert.match(loginPage,/uniquement les pictogrammes approuvés/);
 assert.doesNotMatch(loginPage,/utiliser les pictogrammes d.exemple et accéder à la connexion Google/);
 assert.match(loginPage,/Super Admin nécessite un compte expressément autorisé/);
});
test("Pictogrammes issus des illustrations de l'app : trait séparateur noir et étiquettes centrées",()=>{
 assert.equal((html.match(/class="pictau-picto /g)||[]).length,5);
 assert.equal((html.match(/class="pictau-art"/g)||[]).length,5);
 assert.equal((html.match(/class="pictau-label"/g)||[]).length,5);
 for(const id of ["toilette","collation","lire","ecole","pause"])
   assert.match(html,new RegExp('data-example="'+id+'"'));
 assert.match(css,/\.pictau-label\{[^}]*border-top:2px solid #111/s);
 assert.match(css,/\.pictau-picto\{[^}]*border:2px solid #111/s);
 assert.match(css,/\.pictau-label\{[^}]*align-items:center;justify-content:center/s);
 assert.doesNotMatch(html,/laptop-lines|phone-lines|phone-heading|laptop-subheading/);
 assert.doesNotMatch(css,/\.laptop-lines\b|\.phone-line\b/);
});
test("Bénéfices de taille réelle et alignés au centre",()=>{
 assert.equal((html.match(/class="benefit"/g)||[]).length,3);
 for(const label of ["Trouver","Personnaliser","Imprimer"])assert.match(html,new RegExp(">"+label+"<"));
 assert.match(css,/\.benefit\{[^}]*align-items:center;justify-content:center/s);
 assert.match(css,/\.benefit strong\{[^}]*font-size:clamp\(14px/);
});
test("Deux appareils illustratifs sans paysage, photo ni fausse disponibilité",()=>{
 assert.equal((html.match(/class="laptop"/g)||[]).length,1);
 assert.equal((html.match(/class="phone"/g)||[]).length,1);
 assert.match(html,/Illustrations d.exemple de l.application Pict-au/);
 assert.match(html,/class="hero-visual" aria-hidden="true"/);
 assert.doesNotMatch(html,/paysage|maison|produit à acheter|<img\b/i);
 assert.ok(css.includes("--blue:#609dba"));
 assert.ok(css.includes("--yellow:#ffd16b"));
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
test("Responsive de 320px jusqu'au PC : accessibilité et défilement à zoom élevé",()=>{
 assert.match(css,/100dvh/);
 assert.match(css,/overflow-y:auto/);
 assert.match(css,/@media\(max-width:370px\)/);
 assert.match(css,/@media\(max-width:680px\)/);
 assert.match(css,/@media\(max-width:1100px\)/);
 assert.match(css,/@media\(max-height:520px\)/);
 assert.match(html,/class="skip"/);
 assert.match(css,/prefers-reduced-motion:reduce/);
});
