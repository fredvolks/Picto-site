import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {renderClientFiles,documentRenameFeedback} from "../app/src/client-files-ui.js";
const esc=x=>String(x).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/"/g,"&quot;");
const uid="11111111-1111-4111-8111-111111111111",id="33333333-3333-4333-8333-333333333333";
const files={items:[],total:0,page:0,query:"",type:"all",loading:false,busy:false,error:"",message:"",
 renameId:null,sort:"recent",draft:{title:"",documentType:"routine"}};
const ui=(logged,language="fr",r=files,currentUid=uid)=>renderClientFiles({language,logged,files:r,uid:currentUid,escape:esc,icon:()=>"<svg></svg>"});
test("Mes fichiers non connecté : jamais de formulaire d'upload ou PDF fictif",()=>{
 const html=ui(false);
 assert.match(html,/Mes fichiers/);
 assert.match(html,/Connectez-vous/);
 assert.doesNotMatch(html,/data-form="archive-pdf"/);
 assert.doesNotMatch(html,/files-reprint/);
});
test("Compte connecté : formulaire PDF réel, copie immuable, aucun faux statut imprimé",()=>{
 const html=ui(true);
 assert.match(html,/data-form="archive-pdf"/);
 assert.match(html,/accept="\.pdf,application\/pdf"/);
 assert.match(html,/Ajouter un PDF existant/);
 assert.match(html,/<details class="panel files-upload-panel" open>/);
 assert.ok(html.indexOf('class="panel files-upload-panel"')<html.indexOf('class="panel files-history"'),"L'ajout du premier PDF doit être visible avant l'historique vide");
 assert.doesNotMatch(html,/Votre PDF a été imprimé/);
});
test("Premier PDF : formulaire ouvert et visible avant l'historique en FR/EN",()=>{
 const fr=ui(true),en=ui(true,"en");
 assert.match(fr,/<details class="panel files-upload-panel" open>/);
 assert.match(en,/<details class="panel files-upload-panel" open>/);
 assert.match(fr,/Aucun PDF enregistré\. Ajoutez votre premier document/);
 assert.match(en,/No PDFs saved yet\. Add your first document/);
 assert.equal((fr.match(/data-form="archive-pdf"/g)||[]).length,1,"Un seul formulaire réel");
 assert.equal((en.match(/data-form="archive-pdf"/g)||[]).length,1);
 assert.ok(fr.indexOf('data-form="archive-pdf"')<fr.indexOf('class="panel files-history"'));
});

test("Archives existantes : liste d'abord, import optionnel fermé",()=>{
 const doc={id,title:"Routine du soir",document_type:"routine",created_at:"2026-10-28T10:20:00Z"};
 const page=ui(true,"fr",{...files,total:1,items:[doc]});
 assert.match(page,/<details class="panel files-upload-panel"><summary/);
 assert.doesNotMatch(page,/<details class="panel files-upload-panel" open>/);
 assert.ok(page.indexOf('Routine du soir')<page.indexOf('data-form="archive-pdf"'));
});

test("Filtre sans résultat et chargement : ne pas annoncer faussement une archive vide",()=>{
 const filtered=ui(true,"fr",{...files,query:"absent",total:0});
 assert.match(filtered,/Aucun document ne correspond aux filtres/);
 assert.doesNotMatch(filtered,/Aucun PDF enregistré|files-upload-panel" open/);
 const kind=ui(true,"en",{...files,type:"board",total:0});
 assert.match(kind,/No documents match your filters/);
 assert.doesNotMatch(kind,/files-upload-panel" open/);
 const fetching=ui(true,"fr",{...files,loading:true,total:0});
 assert.match(fetching,/Chargement des fichiers privés/);
 assert.doesNotMatch(fetching,/files-upload-panel" open|Aucun PDF enregistré/);
 const error=ui(true,"fr",{...files,error:"Indisponible",total:0});
 assert.match(error,/Indisponible/);
 assert.doesNotMatch(error,/files-upload-panel" open/);
});

test("Tri Mes fichiers : options FR/EN et sélection conservée",()=>{
 const html=ui(true,"fr",{...files,sort:"name-desc"});
 assert.match(html,/<label for="files-sort">Trier par<\/label>/);
 assert.match(html,/<select id="files-sort" name="sort">/);
 assert.match(html,/<option value="name-desc" selected>Nom Z à A<\/option>/);
 assert.match(ui(true,"en",{...files,sort:"oldest"}),/<option value="oldest" selected>Oldest first<\/option>/);
 assert.doesNotMatch(ui(false),/id="files-sort"/);
});
test("Filtre de brouillon associé : choix bilingues",()=>{
 const html=ui(true,"fr",{...files,source:"linked"});
 assert.match(html,/Brouillon associé/);
 assert.match(html,/value="linked" selected>Avec brouillon/);
 assert.match(html,/data-action="files-reset-filters"/);
 assert.match(ui(true,"en",{...files,source:"unlinked"}),/value="unlinked" selected>Without draft/);
 assert.doesNotMatch(ui(false),/id="files-source"/);
});
test("Fichier enregistré : réimprimer, télécharger, renommer, date et type FR et EN",()=>{
 const doc={id,title:"Ma routine du soir",document_type:"routine",created_at:"2026-10-28T10:20:00Z",page_count:2};
 const data={...files,items:[doc],total:1,renameId:id};
 const html=ui(true,"fr",data);
 assert.match(html,/data-action="files-preview"/);
 assert.match(html,/data-action="files-reprint"/);
 assert.match(html,/data-action="files-download"/);
 assert.match(html,/data-form="files-rename"/);
 assert.match(html,/2 pages/);
 assert.match(ui(true,"en",data),/My files/);
 assert.match(ui(true,"en",data),/Download original PDF/);
});
test("Noms en base échappés dans l'interface et jamais transformés en HTML exécutable",()=>{
 const html=ui(true,"fr",{...files,items:[{id,title:'<img src=x onerror=alert(1)>',document_type:"routine",created_at:""}],total:1});
 assert.doesNotMatch(html,/<img src=x/);
 assert.match(html,/&lt;img/);
});

test("Aperçu d'une première page extrait du PDF original, avec fermeture accessible",()=>{
 const data={...files,items:[{id,title:"Routine du soir",document_type:"routine",created_at:""}],
   total:1,preview:{id,title:"Routine du soir",url:"blob:https://exemple.invalid/preview"}};
 const html=ui(true,"fr",data);
 assert.match(html,/role="dialog" aria-modal="true"/);
 assert.match(html,/data-action="files-preview-close"/);
 assert.match(html,/data-action="files-preview"/);
 assert.match(html,/Page du PDF original enregistré/);
 assert.match(html,/src="blob:https:\/\/exemple.invalid\/preview"/);
 assert.match(ui(true,"en",data),/Document preview/);
});
test("PDF externe sans miniature : explication et accès au fichier original",()=>{
 const data={...files,items:[{id,title:"Feuille",document_type:"sheet",created_at:""}],
   total:1,preview:{id,title:"Feuille",url:null}};
 const html=ui(true,"fr",data);
 assert.match(html,/Ce format PDF ne contient pas de miniature compatible/);
 assert.match(html,/Ouvrir le PDF original/);
 assert.doesNotMatch(html,/files-preview-figure/);
});
test("Aucun aperçu privé rendu sur page visiteur, même si un objet de vue subsiste",()=>{
 const data={...files,preview:{id,title:"Document privé",url:"blob:https://exemple.invalid/secret"}};
 assert.doesNotMatch(ui(false,"fr",data),/Document privé|files-preview-backdrop/);
});

test("PDF Pict-au multipage : commandes Page précédente/suivante et limites FR/EN",()=>{
 const pages=[{blob:{size:20}},{blob:{size:22}},{blob:{size:24}}];
 const info={id,title:"Tableau multipage",url:"blob:https://exemple.invalid/page2",pages,pageIndex:1};
 const list={...files,items:[{id,title:"Tableau multipage",document_type:"board",created_at:""}],total:1,preview:info};
 const html=ui(true,"fr",list);
 assert.match(html,/Page 2 \/ 3/);
 assert.match(html,/data-action="files-preview-previous"/);
 assert.match(html,/data-action="files-preview-next"/);
 assert.match(html,/Page 2 du PDF original/);
 assert.match(html,/aria-live="polite"/);
 assert.match(ui(true,"en",list),/Previous page/);
 assert.match(ui(true,"en",list),/Next page/);
 const first=ui(true,"fr",{...list,preview:{...info,pageIndex:0}});
 assert.match(first,/data-action="files-preview-previous" disabled/);
 const last=ui(true,"fr",{...list,preview:{...info,pageIndex:2}});
 assert.match(last,/data-action="files-preview-next" disabled/);
});

test("L'historique permet une réimpression en priorité avant l'archivage optionnel",()=>{
 const data={...files,items:[{id,title:"Routine du dodo",document_type:"routine",created_at:"2026-10-28T11:00:00Z"}],total:1};
 const html=ui(true,"fr",data);
 assert.ok(html.indexOf("Routine du dodo")<html.indexOf('data-form="archive-pdf"'),"Routine déjà archivée visible avant le formulaire d'ajout");
 assert.match(html,/data-action="files-reprint" data-id="33333333-3333-4333-8333-333333333333"/);
 assert.match(html,/data-action="files-preview" data-id="33333333-3333-4333-8333-333333333333"/);
 assert.match(html,/data-action="files-download" data-id="33333333-3333-4333-8333-333333333333"/);
 assert.doesNotMatch(html,/data-action="files-duplicate"/);
 assert.doesNotMatch(html,/data-action="files-edit"/);
});

test("Mes fichiers : Modifier la source seulement si un brouillon associé existe",()=>{
 const link="44444444-4444-4444-8444-444444444444";
 const base={id,title:"Routine du dodo",document_type:"routine",created_at:"2026-10-28T12:00:00Z"};
 const related=ui(true,"fr",{...files,items:[{...base,source_draft_id:link}],total:1});
 assert.match(related,/data-action="files-edit-source" data-id="33333333-3333-4333-8333-333333333333"/);
 assert.match(related,/Modifier la source/);
 assert.match(related,/data-action="files-reprint"/);
 assert.match(ui(true,"en",{...files,items:[{...base,source_draft_id:link}],total:1}),/Edit source/);
 const historical=ui(true,"fr",{...files,items:[base],total:1});
 assert.doesNotMatch(historical,/data-action="files-edit-source"/,"Aucune source inventée pour un vieux PDF");
 const imported=ui(true,"fr",{...files,items:[{...base,document_type:"sheet",source_draft_id:null}],total:1});
 assert.doesNotMatch(imported,/data-action="files-edit-source"/);
});


test("Mes fichiers : créer une copie modifiable sans remplacer l'original",()=>{
 const link="44444444-4444-4444-8444-444444444444";
 const row={id,title:"Routine du soir",document_type:"routine",source_draft_id:link,created_at:""};
 const fr=ui(true,"fr",{...files,items:[row],total:1});
 const en=ui(true,"en",{...files,items:[row],total:1});
 assert.match(fr,/data-action="files-copy-source" data-id="33333333-3333-4333-8333-333333333333"/);
 assert.match(fr,/Créer une copie modifiable/);
 assert.match(en,/Create editable copy/);
 assert.ok(fr.indexOf('data-action="files-copy-source"')>fr.indexOf('<summary>Autres actions</summary>'));
 assert.match(fr,/data-action="files-reprint"/);
 assert.doesNotMatch(ui(true,"fr",{...files,items:[{...row,source_draft_id:null}],total:1}),/files-copy-source/);
 assert.doesNotMatch(ui(true,"fr",{...files,items:[{...row,document_type:"sheet"}],total:1}),/files-copy-source/);
 const busy=ui(true,"fr",{...files,items:[row],total:1,busy:true});
 assert.match(busy,/data-action="files-copy-source"[^>]* disabled/);
 const app=readFileSync(new URL("../app/src/app.js",import.meta.url),"utf8");
 const start=app.indexOf('if(a==="files-copy-source"');
 const end=app.indexOf('if(a==="files-edit-source"',start);
 assert.ok(start>=0&&end>start);
 const section=app.slice(start,end);
 assert.match(section,/duplicateMyDocumentSource\(client,uid,file\.id/);
 assert.match(section,/sourceId:file\.source_draft_id,kind:file\.document_type/);
 assert.match(section,/clientNavigationEpoch!==navigation/);
 assert.doesNotMatch(section,/archivePdf\(|deleteEditableDraft\(|\.update\(/);
});

test("Après copie confirmée, accéder à Mes brouillons en un geste, sans faux raccourci",()=>{
  const frNotice="Copie modifiable créée dans Mes brouillons (Créer). Le PDF original et sa source restent inchangés.";
  const enNotice="Editable copy saved in My drafts (Create). The original PDF and its source are unchanged.";
  const fr=ui(true,"fr",{...files,message:frNotice,copySourceMessage:frNotice});
  const en=ui(true,"en",{...files,message:enNotice,copySourceMessage:enNotice});
  assert.match(fr,/data-action="nav" data-page="create">Voir Mes brouillons<\/button>/);
  assert.match(en,/data-action="nav" data-page="create">Open My drafts<\/button>/);
  assert.match(fr,/role="status"/);
  assert.doesNotMatch(ui(true,"fr",{...files,message:frNotice}),/data-page="create"/,
    "Un message sans confirmation de copie n'offre pas le raccourci");
  assert.doesNotMatch(ui(true,"fr",{...files,message:"PDF archivé",copySourceMessage:frNotice}),/data-page="create"/,
    "Une autre opération ne réutilise pas l'ancien raccourci");
  assert.doesNotMatch(ui(false,"fr",{...files,message:frNotice,copySourceMessage:frNotice}),/data-page="create"/,
    "Pas de raccourci privé pour un visiteur");
  const app=readFileSync(new URL("../app/src/app.js",import.meta.url),"utf8");
  const begin=app.indexOf('if(a==="files-copy-source"');
  const end=app.indexOf('if(a==="files-edit-source"',begin);
  const section=app.slice(begin,end);
  assert.ok(begin>=0&&end>begin);
  assert.match(section,/await duplicateMyDocumentSource\(client,uid,file\.id/);
  assert.ok(section.indexOf("await duplicateMyDocumentSource")<section.indexOf("clientFiles.copySourceMessage=clientFiles.message"),
    "Le bouton n'apparaît qu'après réussite du service");
  assert.match(app,/clientFiles\.copySourceMessage=null;clientFiles\.renameId=null/);
});

test("Téléchargement de secours : lien réel au PDF privé validé, FR/EN et geste utilisateur",()=>{
 const retry={uid,id,url:"blob:https://pictau.example/1111-aaaa",filename:"Routine du dodo.pdf"};
 const data={...files,reprintRetry:retry,message:"Téléchargement du PDF original demandé."};
 const fr=ui(true,"fr",data);
 assert.match(fr,/class="pa-pdf-retry"/);
 assert.match(fr,/data-pdf-retry="true"/);
 assert.match(fr,/href="blob:https:\/\/pictau\.example\/1111-aaaa"/);
 assert.match(fr,/download="Routine du dodo\.pdf"/);
 assert.match(fr,/Si le téléchargement automatique n’a pas démarré/);
 const en=ui(true,"en",data);
 assert.match(en,/Download original PDF/);
 assert.match(en,/If the automatic download did not start/);
 assert.doesNotMatch(ui(false,"fr",data),/data-pdf-retry/,
   "Le visiteur anonyme ne voit jamais un lien sur un ancien document");
});

test("Lien privé : UID différent, URL non-blob et injection de nom rejetés ou échappés",()=>{
 const retry={uid,id,url:"blob:https://pictau.example/secret",filename:"Routine & soir.pdf"};
 const data={...files,reprintRetry:retry};
 assert.doesNotMatch(ui(true,"fr",data,"22222222-2222-4222-8222-222222222222"),/data-pdf-retry/);
 assert.doesNotMatch(ui(true,"fr",{...files,reprintRetry:{...retry,url:"javascript:alert(1)"}}),/data-pdf-retry/);
 assert.doesNotMatch(ui(true,"fr",{...files,reprintRetry:{...retry,url:"https://example.com/public.pdf"}}),/data-pdf-retry/);
 const escaped=ui(true,"fr",{...files,reprintRetry:{...retry,filename:'<img src=x onerror=alert(1)>.pdf'}});
 assert.match(escaped,/download="&lt;img src=x onerror=alert\(1\)>\.pdf"/);
 assert.doesNotMatch(escaped,/<img src=x/);
});

test("Un import PDF à récupérer bloque le nouvel upload sans cacher l'historique",()=>{
 const html=renderClientFiles({language:"fr",logged:true,files,uid,pendingPdf:true,
   escape:esc,icon:()=>"<svg></svg>"});
 assert.match(html,/Une copie attend sa confirmation/);
 assert.match(html,/<button type="submit" class="btn btn-primary" disabled>/);
 assert.match(html,/Réessayer l’archivage/);
 assert.match(html,/data-form="files-filter"/,"Les fichiers déjà archivés restent disponibles");
 const en=renderClientFiles({language:"en",logged:true,files,uid,pendingPdf:true,
   escape:esc,icon:()=>"<svg></svg>"});
 assert.match(en,/awaiting confirmation/);
 assert.match(en,/Retry archiving/);
 assert.doesNotMatch(ui(false),/Une copie attend sa confirmation/);
});

test("L’archive se nomme Mes fichiers / My files et reste distincte de Mes brouillons",()=>{
 const fr=ui(true,"fr"),en=ui(true,"en");
 assert.match(fr,/<h1>Mes fichiers<\/h1>/);
 assert.match(en,/<h1>My files<\/h1>/);
 assert.doesNotMatch(fr,/Mes créations|Mes brouillons/);
 assert.doesNotMatch(en,/My creations|My drafts/);
});

test("Retour de renommage PDF honnête selon résultat serveur confirmé, FR/EN",()=>{
 assert.equal(documentRenameFeedback({changed:true},"fr"),"Nom mis à jour. Le PDF original est inchangé.");
 assert.equal(documentRenameFeedback({changed:true},"en"),"Name updated. Original PDF unchanged.");
 assert.equal(documentRenameFeedback({changed:false},"fr"),"Nom inchangé. Le PDF original est conservé.");
 assert.equal(documentRenameFeedback({changed:false},"en"),"Name unchanged. Original PDF preserved.");
});
test("Retour de renommage PDF : réponse serveur absente ou invalide n'est pas un succès",()=>{
 for(const result of [null,{},undefined,{changed:null},{changed:"false"}])
   assert.throws(()=>documentRenameFeedback(result,"fr"),/Résultat de renommage invalide/);
});

test("La page Mes fichiers transmet le résultat confirmé au message accessible",()=>{
 const source=readFileSync(new URL("../app/src/app.js",import.meta.url),"utf8");
 const begin=source.indexOf("const renameForm=event.target.closest('form[data-form=\"files-rename\"]')");
 const end=source.indexOf("const themeForm=event.target.closest",begin);
 assert.ok(begin>=0&&end>begin);
 const block=source.slice(begin,end);
 assert.match(block,/const result=await renameMyDocument\(client,uid,id,doc\.title,title\)/);
 assert.match(block,/documentRenameFeedback\(result,state\.language\)/);
 assert.match(block,/clientFiles\.message=feedback/);
 assert.doesNotMatch(block,/clientFiles\.message=state\.language==="fr"\?"Nom mis à jour/);
});


test("Chaque document montre uniquement Aperçu et Réimprimer au premier niveau",()=>{
 const doc={id,title:"Routine de classe",document_type:"routine",created_at:"2026-11-02T10:00:00Z"};
 const html=ui(true,"fr",{...files,total:1,items:[doc]});
 const start=html.indexOf('class="files-entry-actions"'),end=html.indexOf("</article>",start);
 const entry=html.slice(start,end);
 assert.ok(start>0&&end>start);
 const primary=entry.slice(entry.indexOf('class="files-entry-primary"'),entry.indexOf('<details class="files-entry-more"'));
 assert.match(primary,/data-action="files-preview"/);
 assert.match(primary,/data-action="files-reprint"/);
 assert.doesNotMatch(primary,/files-download|files-rename-open|files-edit-source/);
 assert.match(entry,/<details class="files-entry-more">/);
 assert.match(entry,/<summary>Autres actions<\/summary>/);
 assert.match(entry,/data-action="files-download"/);
 assert.match(entry,/Télécharger le PDF original/);
 assert.match(entry,/data-action="files-rename-open"/);
 assert.doesNotMatch(entry,/files-edit-source/);
 assert.match(ui(true,"en",{...files,total:1,items:[doc]}),/<summary>More actions<\/summary>/);
});
test("Modifier la source reste une action secondaire seulement pour PDF lié à un brouillon",()=>{
 const doc={id,title:"Mon tableau",document_type:"board",source_draft_id:"44444444-4444-4444-8444-444444444444",created_at:""};
 const html=ui(true,"fr",{...files,total:1,items:[doc]});
 assert.ok(html.indexOf('data-action="files-edit-source"')>html.indexOf('class="files-entry-more"'));
 assert.match(html,/data-action="files-rename-open"/);
});
test("Renommer garde Autres actions ouvert et le champ focus dans le code d'application",()=>{
 const doc={id,title:"Mon original",document_type:"routine",created_at:""};
 const html=ui(true,"fr",{...files,total:1,items:[doc],renameId:id});
 assert.match(html,/<details class="files-entry-more" open>/);
 assert.match(html,/data-form="files-rename"/);
 const src=readFileSync(new URL("../app/src/app.js",import.meta.url),"utf8");
 assert.match(src,/root\.querySelector\("#rename-"\+el\.dataset\.id\)\?\.focus\(\{preventScroll:false\}\)/);
});
test("Mobile 320 px et tablette : deux actions tactiles 44px et autres commandes conservées",()=>{
 const styles=readFileSync(new URL("../app/src/styles.css",import.meta.url),"utf8");
 assert.match(styles,/\.files-entry-primary>\.btn\{min-height:44px/);
 assert.match(styles,/\.files-entry-more>summary\{/);
 assert.match(styles,/\.files-entry-more-actions>\.btn\{min-height:44px/);
 assert.match(styles,/@media screen and \(max-width:380px\)/);
 assert.match(styles,/\.files-entry-more-actions\{grid-template-columns:minmax\(0,1fr\)\}/);
});

test("Mes fichiers : périodes FR/EN et réinitialisation des filtres accessibles",()=>{
 const fr=ui(true,"fr",{...files,period:"month",sort:"oldest",type:"routine",query:"soir"});
 assert.match(fr,/<select id="files-period" name="period">/);
 assert.match(fr,/<option value="month" selected>30 derniers jours<\/option>/);
 assert.match(fr,/data-action="files-reset-filters"/);
 assert.match(fr,/Tout afficher/);
 const en=ui(true,"en",{...files,period:"week"});
 assert.match(en,/<option value="week" selected>Last 7 days<\/option>/);
 assert.match(en,/Show all/);
 assert.doesNotMatch(ui(true),/data-action="files-reset-filters"/);
 assert.doesNotMatch(ui(false),/id="files-period"/);
});

test("Mes fichiers : période active avec zéro résultat n'invente pas un compte vide",()=>{
 const page=ui(true,"fr",{...files,period:"year"});
 assert.match(page,/Aucun document ne correspond aux filtres/);
 assert.doesNotMatch(page,/Aucun PDF enregistré|files-upload-panel" open/);
});

test("Mes fichiers : formulaire et bouton Effacer pilotent le filtre serveur sans modifier les PDF",()=>{
 const app=readFileSync(new URL("../app/src/app.js",import.meta.url),"utf8");
 assert.match(app,/period:clientFiles\.period/);
 assert.match(app,/clientFiles\.period=String\(data\.get\("period"\)\|\|"all"\)/);
 assert.match(app,/if\(a==="files-reset-filters"\)/);
 assert.match(app,/clientFiles\.query="";clientFiles\.type="all";clientFiles\.sort="recent";clientFiles\.period="all";/);
 assert.match(app,/clientFiles\.page=0;clientFiles\.renameId=null;/);
});
