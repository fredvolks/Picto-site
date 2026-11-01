import test from "node:test";
import assert from "node:assert/strict";
import {renderAdminNamedTemplateBank,confirmPublishedNamedTemplateEdit} from "../src/admin-template-bank-ui.js";
const ID="00000000-0000-4000-8000-000000000123";
const row={id:ID,name:"Routine école",revision:3,is_published:false};
test("Le vrai Super Admin peut créer plusieurs gabarits nommés sans publication automatique",()=>{
 const html=renderAdminNamedTemplateBank({templates:[row],selectedId:ID,name:row.name,
   widthCm:5,rotationDeg:25});
 assert.match(html,/data-action="admin-named-template-save"/);
 assert.match(html,/data-action="admin-named-template-new"/);
 assert.match(html,/data-action="admin-named-template-publish"/);
 assert.match(html,/data-revision="3"/);
 assert.match(html,/data-publish="true"/);
 assert.match(html,/Brouillon/);
 assert.match(html,/data-input="admin-named-template-name"/);
 assert.match(html,/data-input="admin-named-template-rotation"/);
});
test("Dépublier un gabarit est un choix distinct de la sauvegarde des paramètres",()=>{
 const html=renderAdminNamedTemplateBank({templates:[{...row,is_published:true}],
   selectedId:ID,name:row.name,fr:false});
 assert.match(html,/Hide from clients/);
 assert.match(html,/data-publish="false"/);
 assert.match(html,/Update published template/);
 assert.match(html,/This template is published/);
 assert.match(html,/role="note"/);
});
test("Les champs et noms de gabarits sont échappés",()=>{
 const html=renderAdminNamedTemplateBank({templates:[{...row,name:"<script>x</script>"}],
   name:'"><img src=x onerror=alert(1)>'});
 assert.doesNotMatch(html,/<script>|<img/);
 assert.match(html,/&lt;script&gt;/);
 assert.match(html,/&quot;&gt;&lt;img/);
});
test("Pas de sélection fantôme ni de doublons",()=>{
 assert.throws(()=>renderAdminNamedTemplateBank({templates:[row,row]}),/incohérente/);
 assert.throws(()=>renderAdminNamedTemplateBank({templates:[row],
   selectedId:"00000000-0000-4000-8000-000000000124"}),/n'existe plus/);
});
test("Chargement ou sauvegarde bloque les actions concurrentes",()=>{
 const html=renderAdminNamedTemplateBank({templates:[row],busy:true});
 assert.match(html,/data-action="admin-named-template-save" disabled/);
 assert.match(html,/data-action="admin-named-template-publish"[^>]*disabled/);
});

test("Le site public réserve les gabarits au vrai Super Admin et ne simule jamais la sauvegarde",async()=>{
 const {readFileSync}=await import("node:fs");
 const source=readFileSync(new URL("../src/app.js",import.meta.url),"utf8");
 assert.match(source,/import \{listAdminNamedTemplates,saveAdminNamedTemplate,setAdminTemplatePublication,prepareNamedTemplateCopy\}/);
 assert.match(source,/if\(state\.adminTab==="templates"&&authStatus\.user\)void fetchAdminNamedTemplates\(\)/);
 assert.match(source,/if\(a==="admin-named-template-save"\)/);
 assert.match(source,/adminNamedTemplates\.loaded=false/);
 assert.match(source,/!adminNamedTemplates\.loaded/);
 assert.match(source,/resetAdminNamedTemplates\(\)/);
});

test("Dupliquer en français/anglais garde la source publiée, propose un brouillon explicite",()=>{
  for(const [fr,button] of [[true,"Dupliquer"],[false,"Duplicate"]]){
    const html=renderAdminNamedTemplateBank({
      templates:[{...row,is_published:true}],selectedId:ID,name:row.name,fr
    });
    assert.match(html,/data-action="admin-named-template-duplicate"/);
    assert.match(html,new RegExp(button));
    assert.match(html,/data-id="00000000-0000-4000-8000-000000000123"/);
    assert.match(html,/aria-label="(?:Dupliquer le gabarit|Duplicate template) Routine école"/);
    assert.match(html,/data-action="admin-named-template-publish"/);
  }
  const full=Array.from({length:100},(_,i)=>({
    id:`00000000-0000-4000-8000-${String(i+1).padStart(12,"0")}`,
    name:`Modèle ${i}`,revision:1,is_published:false
  }));
  const atLimit=renderAdminNamedTemplateBank({templates:full});
  assert.match(atLimit,/data-action="admin-named-template-duplicate"[^>]*disabled/);
});

test("Chargement et écriture désactivent les duplications concurrentes",()=>{
  for(const busy of [true,false]){
    const html=renderAdminNamedTemplateBank({templates:[row],busy,loading:!busy});
    assert.match(html,/data-action="admin-named-template-duplicate"[^>]*disabled/);
  }
});

test("Aucune modification publiée sans confirmation explicite; brouillon sans dialogue",()=>{
 const draft={...row,is_published:false};
 let prompts=0;
 assert.equal(confirmPublishedNamedTemplateEdit(draft,true,()=>{prompts++;return true;}),true);
 assert.equal(prompts,0);
 assert.throws(()=>confirmPublishedNamedTemplateEdit({...row,is_published:true}),/Confirmation explicite/);
 const published={...row,is_published:true};
 assert.equal(confirmPublishedNamedTemplateEdit(published,true,message=>{
   prompts++;
   assert.match(message,/immédiatement/);
   assert.match(message,/Dupliquer/);
   assert.match(message,/PDF déjà archivés restent inchangés/);
   return false;
 }),false);
 assert.equal(confirmPublishedNamedTemplateEdit(published,false,message=>{
   prompts++;
   assert.match(message,/already published/);
   assert.match(message,/Duplicate/);
   assert.match(message,/archived PDFs remain unchanged/);
   return true;
 }),true);
 assert.equal(prompts,2);
 assert.equal(confirmPublishedNamedTemplateEdit(published,true,()=>undefined),false,
   "Une réponse ambigüe ne doit jamais accepter la publication");
});

test("Avertissement visible uniquement pour le gabarit actif déjà publié",()=>{
 const pub={...row,is_published:true};
 const on=renderAdminNamedTemplateBank({templates:[pub],selectedId:ID,name:pub.name});
 assert.match(on,/Ce gabarit est publié/);
 assert.match(on,/Mettre à jour le gabarit publié/);
 assert.match(on,/Dupliquer/);
 const other=renderAdminNamedTemplateBank({templates:[pub],selectedId:null});
 assert.doesNotMatch(other,/Ce gabarit est publié/);
 assert.doesNotMatch(other,/Mettre à jour le gabarit publié/);
 const draft=renderAdminNamedTemplateBank({templates:[row],selectedId:ID,name:row.name});
 assert.doesNotMatch(draft,/Ce gabarit est publié/);
 assert.match(draft,/Enregistrer les modifications/);
});
