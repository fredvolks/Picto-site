import test from "node:test";
import assert from "node:assert/strict";
import {renderAdminNamedTemplateBank,renderNamedTemplateHandoff,confirmPublishedNamedTemplateEdit} from "../src/admin-template-bank-ui.js";
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

test("Portage public : la confirmation du gabarit publié précède toute écriture réseau",async()=>{
 const {readFileSync}=await import("node:fs");
 const app=readFileSync(new URL("../src/app.js",import.meta.url),"utf8");
 const block=app.split('if(a==="admin-named-template-save")')[1]
   .split('if(a==="admin-named-template-publish")')[0];
 assert.ok(block.includes('confirmPublishedNamedTemplateEdit(current,state.language==="fr"'));
 assert.ok(block.indexOf('confirmPublishedNamedTemplateEdit')<
   block.indexOf('adminNamedTemplates.busy=true'));
 assert.ok(block.indexOf('confirmPublishedNamedTemplateEdit')<
   block.indexOf('await supabaseClient()'));
 assert.match(block,/saved\.is_published\?/);
 assert.match(block,/Gabarit publié mis à jour/);
 assert.match(block,/PDF archivés restent inchangés/);
});


test("Une vraie banque vide propose le premier carré ou rectangle, jamais une démo",()=>{
 const html=renderAdminNamedTemplateBank({templates:[],fr:true});
 assert.match(html,/Aucun gabarit encore enregistré/);
 assert.match(html,/data-action="admin-named-template-starter" data-shape="square"/);
 assert.match(html,/data-action="admin-named-template-starter" data-shape="portrait"/);
 assert.match(html,/rien n’est publié automatiquement/);
 assert.doesNotMatch(html,/Démonstration locale|autobus/);
 const en=renderAdminNamedTemplateBank({templates:[],fr:false});
 assert.match(en,/Prepare a square/);
 assert.match(en,/Prepare a tall rectangle/);
});

test("Erreur réelle de réseau : pouvoir réessayer sans inventer de gabarits",()=>{
 const html=renderAdminNamedTemplateBank({templates:[],busy:true,error:"Erreur <HTTP>"});
 assert.match(html,/role="alert">Erreur &lt;HTTP&gt;/);
 assert.match(html,/data-action="admin-named-template-refresh"/);
 assert.doesNotMatch(html,/data-action="admin-named-template-starter"/);
 const waiting=renderAdminNamedTemplateBank({templates:[],busy:true,loading:true});
 assert.doesNotMatch(waiting,/data-action="admin-named-template-starter"/);
});

test("Premier modèle : pas d'écriture Supabase sans Enregistrer",async()=>{
 const {readFileSync}=await import("node:fs");
 const app=readFileSync(new URL("../src/app.js",import.meta.url),"utf8");
 const section=app.split('if(a==="admin-named-template-starter")')[1]
   ?.split('if(a==="admin-named-template-new")')[0];
 assert.ok(section,"Le parcours de premier gabarit est codé");
 assert.match(section,/state\.currentPreset=\{\.\.\.DEFAULT_PRESET,shape\}/);
 assert.match(section,/shape!=="square"&&shape!=="portrait"/);
 assert.doesNotMatch(section,/supabaseClient\(|\.insert\(|\.rpc\(/);
 assert.match(app,/if\(a==="admin-named-template-refresh"\)/);
});


test("Les gabarits publiés proposent de choisir les vraies fiches clients",()=>{
 const empty=renderNamedTemplateHandoff({templates:[],fr:true,choicesReady:true});
 assert.match(empty,/Enregistrez d’abord votre gabarit/);
 assert.doesNotMatch(empty,/admin-template-go-published/);
 const ready=renderNamedTemplateHandoff({templates:[{is_published:true}],choicesReady:true});
 assert.match(ready,/admin-template-go-published/);
 assert.match(ready,/enregistrez puis confirmez/);
 const blocked=renderNamedTemplateHandoff({templates:[{is_published:true}],choicesReady:false});
 assert.doesNotMatch(blocked,/admin-template-go-published/);
 assert.match(blocked,/n’est pas encore vérifiée/);
});

test("Le site public Maquette Banque donne accès direct aux choix dans Classer",async()=>{
 const {readFileSync}=await import("node:fs");
 const app=readFileSync(new URL("../src/app.js",import.meta.url),"utf8");
 const start=app.indexOf('const sheetClassify=selectedAsset?');
 const end=app.indexOf('const sheetSaveDialog=',start);
 assert.ok(start>=0&&end>start);
 const sheet=app.slice(start,end);
 assert.ok(sheet.includes('pa-bank-customer-templates'));
 assert.ok(sheet.includes('admin-template-choices-open'));
 assert.ok(sheet.includes('adminTemplatePanel'));
 assert.ok(sheet.includes('privatePreviewBody'));
 assert.ok(sheet.includes('Le serveur n’a pas confirmé les choix'));
 // Aucun choix publié avant l'action de confirmation existante.
 const action=app.split('if(a==="admin-template-go-published"){')[1]
   ?.split('if(a==="admin-template-choices-open"){')[0];
 assert.ok(action);
 assert.ok(action.includes('bankFilters.status="published"'));
 assert.ok(action.includes('bankPanel="browse"'));
 assert.ok(action.includes('refreshPrivateBank(client,uid)'));
 assert.doesNotMatch(action,/\.insert\(|\.update\(|\.delete\(|\.rpc\(/);
 assert.ok(app.includes('Aucun pictogramme publié'));
});
