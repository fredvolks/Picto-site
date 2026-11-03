import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const app=readFileSync(new URL("../app/src/app.js",import.meta.url),"utf8");
const css=readFileSync(new URL("../app/src/styles.css",import.meta.url),"utf8");
const desktop=readFileSync(new URL("../branding/pictau-logo-le-fil.svg",import.meta.url),"utf8");
const mobile=readFileSync(new URL("../branding/pictau-logo-le-fil-mobile.svg",import.meta.url),"utf8");
const admin=app.slice(app.indexOf("function adminBrandPicture(){"),app.indexOf("// BOUTIQUE CLIENT : structure premium"));
test("published Super Admin uses the actual public-home logos, never a fake P",()=>{
  assert.match(desktop,/pictau-wordmark/);
  assert.match(mobile,/pictau-wordmark/);
  assert.match(admin,/function adminBrandPicture\(\)/);
  assert.match(admin,/pictau-logo-le-fil\.svg/);
  assert.match(admin,/pictau-logo-le-fil-mobile\.svg/);
  assert.doesNotMatch(admin,/<span class="admin-brand-mark">P<\/span>/);
});
test("every published admin tab shares sage theme and retains role guard",()=>{
  assert.match(admin,/if\(!canOpenAdmin\(\)\)return renderRoleChecking\(\)/);
  assert.match(admin,/class="admin-workspace admin-sage-unified'/);
  for(const tab of ["overview","bank","requests","tools","templates","settings"])
    assert.match(admin,new RegExp('\\["'+tab+'",'));
  assert.match(css,/SUPER ADMIN — sauge sur toutes les vues/);
  assert.match(css,/\.admin-sage-unified \.admin-topbar/);
  assert.match(css,/\.admin-sage-unified \.admin-bank-controls/);
  assert.match(css,/\.admin-sage-unified \.pa-template-lite/);
});
test("published header shows an avatar profile and retains sign-out",()=>{
  assert.match(admin,/adminProfileControls\(\)/);
  assert.match(admin,/class="admin-profile-menu"/);
  assert.match(admin,/class="admin-avatar"/);
  assert.match(admin,/data-action="google-logout"/);
  assert.match(admin,/admin-topbar-brand-mobile/);
});
