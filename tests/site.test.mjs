import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const html=readFileSync("index.html","utf8");
const css=readFileSync("src/site.css","utf8");
const js=readFileSync("src/site.js","utf8");
const read=path=>readFileSync(path,"utf8");

test("la vitrine est un site commercial unique, pas une application de démonstration",()=>{
  for(const id of ['id="accueil"','id="fonctionnalites"','id="forfait"'])
    assert.ok(html.includes(id),"Section introuvable: "+id);
  assert.equal((html.match(/class="plan"/g)||[]).length,1);
  assert.equal((html.match(/class="hero"/g)||[]).length,1);
  assert.doesNotMatch(html,/super admin|google-login|checkout|data-view=|mobile-dock/i);
  assert.doesNotMatch(html,/<form\b/i,"Aucun faux formulaire d'inscription");
  assert.doesNotMatch(html,/home-device|home-phone/i,"Pas de simulateur d'application");
});
test("un seul bouton Créer mon compte, situé uniquement dans le forfait",()=>{
  const plan=html.slice(html.indexOf('id="forfait"'),html.indexOf("</section>",html.indexOf('id="forfait"')));
  assert.equal((html.match(/class="signup-button"/g)||[]).length,1);
  assert.match(plan,/class="signup-button"[^>]*disabled/);
  assert.match(plan,/Créer mon compte/);
  assert.doesNotMatch(html.slice(0,html.indexOf('id="forfait"')),/Créer mon compte/);
  assert.match(plan,/id="signup-status"/);
});
test("Connexion visible sans menu sur tous les appareils, sans faux OAuth",()=>{
  assert.equal((html.match(/class="login-link"/g)||[]).length,1);
  assert.match(html,/<a class="login-link" href="\.\/connexion\.html">/);
  assert.doesNotMatch(html,/menu-toggle|hamburger|google-login|supabase/i);
  assert.match(css,/\.login-link\{/);
  assert.match(css,/@media\(max-width:680px\)/);
  assert.doesNotMatch(css,/\.login-link\s*\{[^}]*display\s*:\s*none/);
  const login=read("connexion.html");
  assert.match(login,/n.est pas encore ouvert/);
  assert.doesNotMatch(login,/<input\b/);
});
test("FR/EN, sélecteur de langue persistant et les pages de service",()=>{
  assert.match(html,/data-fr="Connexion" data-en="Sign in"/);
  assert.match(js,/localStorage\.setItem\("pictau-language"/);
  for(const path of ["contact.html","conditions.html","confidentialite.html","connexion.html"]){
    const text=read(path);
    assert.match(html,new RegExp('href="\\./'+path+'"'));
    assert.match(text,/data-fr=/);
    assert.match(text,/data-en=/);
    assert.match(text,/href="\.\/index\.html"/);
  }
});
test("responsive et accessibilité : page unique et défilement autorisé si nécessaire",()=>{
  assert.match(css,/100dvh/);
  assert.match(css,/overflow-y:auto/);
  assert.match(css,/\.viewport-content\{/);
  assert.doesNotMatch(css,/html,body\{[^}]*overflow:hidden/);
  assert.match(css,/@media\(max-height:520px\)/);
  for(const breakpoint of ["max-width:370px","max-width:680px","max-width:1100px"])
    assert.ok(css.includes(breakpoint));
  assert.match(css,/\.hero-visual\{display:none\}/);
  assert.match(html,/class="skip"/);
  assert.match(html,/aria-describedby="signup-status"/);
});

test("Direction artistique : portable illustratif Pict-au, pas de capture réelle inventée",()=>{
  assert.match(html,/class="hero-visual"/);
  assert.equal((html.match(/class="laptop-picto"/g)||[]).length,3);
  assert.equal((html.match(/class="laptop-screen"/g)||[]).length,1);
  assert.match(html,/Illustration conceptuelle/);
  assert.doesNotMatch(html,/capture réelle|fonctionnement garanti|site de démonstration/i);
  assert.doesNotMatch(css,/url\(https?:\/\//i,"Pas de photographie ni image tiers distante dans le héros");
  assert.ok(css.includes("--blue:#609dba"));
  assert.ok(css.includes("--yellow:#ffd16b"));
});
test("Trio compact sans faux prix, et aucun second appel à l'inscription",()=>{
  for(const label of ["Trouver","Personnaliser","Imprimer"])assert.ok(html.includes(">"+label+"<"));
  assert.equal((html.match(/class="benefit"/g)||[]).length,3);
  assert.equal((html.match(/class="plan"/g)||[]).length,1);
  assert.equal((html.match(/>Créer mon compte</g)||[]).length,1);
  assert.match(html,/Tarif à confirmer/);
  assert.match(html,/Inscriptions à venir/);
  assert.doesNotMatch(html,/9,99|Stripe|\$\/mois|paiement sécurisé/i);
});

test("Le visuel conceptuel comprend un ordinateur et un téléphone complémentaires",()=>{
  assert.equal((html.match(/class="laptop-screen"/g)||[]).length,1);
  assert.equal((html.match(/class="phone-display"/g)||[]).length,1);
  assert.equal((html.match(/class="phone-picto"/g)||[]).length,2);
  assert.match(html,/class="hero-visual" aria-hidden="true"/);
  assert.match(css,/@media\(max-width:680px\)\{\.phone\{display:none\}\}/);
  assert.doesNotMatch(html,/vraie capture de l.application|démo interactive/);
});

test("Libellés d'illustration bilingues, sans dupliquer les écrans",()=>{
  for(const english of ["snack","read","hello","bathroom","school"]){
    assert.ok(html.includes('data-en="'+english+'"'));
  }
  assert.equal((html.match(/class="phone"/g)||[]).length,1);
  assert.equal((html.match(/class="laptop"/g)||[]).length,1);
});
