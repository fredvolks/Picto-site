import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const app=readFileSync(new URL("../src/app.js",import.meta.url),"utf8");

test("Le menu latéral Super Admin contient Clients de test sur mobile et PC",()=>{
  const nav=app.match(/function renderAdminWorkspace\(\)\{([\s\S]*?)\n\}\n\/\/ BOUTIQUE CLIENT/);
  assert.ok(nav,"L'espace Super Admin doit être présent");
  assert.match(nav[1],/\["test-clients",fr\?"Clients de test":"Test clients","users"\]/);
  assert.match(nav[1],/tabs\.map\(tab=>button\(tab\)\)/);
  assert.match(nav[1],/data-action="admin-tab" data-tab=/);
  assert.match(nav[1],/state\.adminTab==="overview"\?renderAdminHome\(\):state\.adminTab==="settings"\?renderAdminCaptionSettings\(\):renderAdmin\(\)/);
  assert.equal((nav[1].match(/\["test-clients",/g)||[]).length,1);
});
test("L'onglet affiche les vrais comptes de test et lance leur lecture",()=>{
 assert.match(app,/state\.adminTab==="test-clients"[\s\S]*?renderTestClients/);
 assert.match(app,/if\(state\.adminTab==="test-clients"&&authStatus\.user&&!testClients\.loading\)/);
 assert.match(app,/void fetchTestClientAccounts\(\)/);
 assert.match(app,/import \{listTestClients,createTestClient,setTestClientPlan,deleteTestClient\} from "\.\/test-clients\.js";/);
});
test("La navigation reste conditionnée à l'identité Super Admin",()=>{
 assert.match(app,/function renderAdminWorkspace\(\)\{\s*if\(!canOpenAdmin\(\)\)return renderRoleChecking\(\)/);
 assert.match(app,/if\(a==="admin-tab"\)\{\s*if\(!canOpenAdmin\(\)\)return;/);
});
