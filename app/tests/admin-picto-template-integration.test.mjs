import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const app=readFileSync(new URL("../src/app.js",import.meta.url),"utf8");
test("La vraie banque admin permet une préparation puis confirmation explicite",()=>{
 for(const name of ["getAdminPictoTemplateChoices","saveAdminPictoTemplateDraft","confirmAdminPictoTemplateChoices",
     "listClientPictoTemplateChoices","renderAdminPictoTemplatePicker","renderClientPictoTemplateOptions",
     "data-action=\"admin-template-choices-open\"","data-action=\"approved-template-open\""])
  assert.ok(app.includes(name),name);
 const stage=app.split('if(a==="picto-template-stage")')[1]?.split('if(a==="picto-template-confirm")')[0]||"";
 const confirm=app.split('if(a==="picto-template-confirm")')[1]?.split('if(a==="approved-template-open")')[0]||"";
 assert.match(stage,/saveAdminPictoTemplateDraft/);
 assert.doesNotMatch(stage,/confirmAdminPictoTemplateChoices/);
 assert.match(confirm,/window\.confirm\(confirmationMessage/);
 assert.match(confirm,/confirmAdminPictoTemplateChoices/);
});
test("Sans tables Supabase, aucune fiche client ni sélection admin non confirmée n'apparaît",()=>{
 assert.match(app,/let TEMPLATE_CHOICES_RELEASED=false/);
 for(const name of ["pictau_templates","pictau_picto_template_drafts",
       "pictau_picto_template_choices","pictau_picto_template_confirmations"])
   assert.ok(app.includes(name),name);
 assert.match(app,/if\(q\.error\)throw q\.error/);
 assert.match(app,/check\.data\?\.user\?\.id!==uid/);
 assert.match(app,/templateChoicesProbe\+\+/);
 assert.match(app,/resetClientPictoTemplates\(\)/);
});

test("Le portage L3 n'introduit aucun import de module en double",()=>{
 const specifiers=[...app.matchAll(/^import [^\n]+ from "([^"]+)";/gm)].map(match=>match[1]);
 const duplicates=specifiers.filter((value,index)=>specifiers.indexOf(value)!==index);
 assert.deepEqual(duplicates,[], "Imports répétés : "+duplicates.join(", "));
});

test("Les états et gestionnaires L3 ne sont pas déclarés deux fois",()=>{
 for(const token of ["const adminTemplateChoices=","const clientPictoTemplates=",
   "function resetAdminTemplateChoices(){","function resetClientPictoTemplates(){",
   "function renderClientPictoTemplateModal(){"])
  assert.equal(app.split(token).length-1,1,"Déclaration en double : "+token);
});
