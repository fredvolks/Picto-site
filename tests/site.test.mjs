import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync,existsSync} from "node:fs";
const html=readFileSync("index.html","utf8"),js=readFileSync("src/site.js","utf8");
test("un seul forfait et aucun achat fictif",()=>{
  assert.equal((html.match(/class="home-plan"/g)||[]).length,1);
  assert.match(html,/Tarif à venir/);
  assert.doesNotMatch(html,/stripe|checkout|data-action="nav"/i);
});
test("site public marketing uniquement, sans démo client ni admin",()=>{
  assert.match(html,/id="fonctionnalites"/);
  assert.match(html,/id="avantages"/);
  assert.match(html,/id="forfait"/);
  assert.doesNotMatch(html,/d[ée]mo|d[ée]monstration|sample|localhost|super admin/i);
  assert.doesNotMatch(html,/login|connexion|google-login|supabase|auth\/v1/i);
  assert.ok(!existsSync("src/app.js"));
  assert.ok(!existsSync("src/google-auth.js"));
  assert.ok(!existsSync("src/data.js"));
  assert.ok(!existsSync("src/core.js"));
});
test("liens fonctionnels d'ancrage",()=>{
  const destinations=[...html.matchAll(/href="#([^"]+)"/g)].map(match=>match[1]);
  for(const target of destinations)assert.ok(html.includes('id="'+target+'"'),"Missing #"+target);
});
test("bilingue et responsive",()=>{
  assert.match(html,/name="viewport"/);
  assert.match(html,/data-lang="fr"/);
  assert.match(html,/data-lang="en"/);
  assert.match(js,/document\.documentElement\.lang/);
  for(const name of ["fonctionnalites","avantages","forfait"])assert.ok(html.includes('id="'+name+'"'));
});

test("le site dispose de 3 vues non déroulantes",()=>{
  assert.match(html,/data-view="home"/);
  assert.match(html,/class="mobile-dock"/);
  assert.match(js,/function changeView/);
  assert.match(js,/data-view-link/);
});
