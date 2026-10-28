import test from "node:test";import assert from "node:assert/strict";import {readFileSync} from "node:fs";
const html=readFileSync("index.html","utf8"),css=readFileSync("src/site.css","utf8");
test("unique real sales page without hidden views",()=>{
 for(const s of ['id="accueil"','id="fonctionnalites"','id="forfait"'])assert.ok(html.includes(s));
 assert.equal((html.match(/class="plan"/g)||[]).length,1);
 assert.doesNotMatch(html,/d[ée]mo|d[ée]monstration|super admin|google-login|checkout/i);
 assert.doesNotMatch(html,/mobile-dock|data-view=/i);
});
test("viewport fit and responsive design",()=>{
 assert.match(css,/100dvh/);assert.match(css,/overflow:hidden/);
 for(const v of ["max-width:680px","max-width:1050px"])assert.ok(css.includes(v));
});
