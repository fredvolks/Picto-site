import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {renderClientFiles} from "../src/client-files-ui.js";
const esc=v=>String(v).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/"/g,"&quot;");
const id="33333333-3333-4333-8333-333333333333",uid="11111111-1111-4111-8111-111111111111";
const doc={id,title:"Routine d'école",document_type:"routine",created_at:"2026-11-02T12:00:00Z",page_count:2};
const files={items:[doc],total:1,page:0,query:"",type:"all",sort:"recent",loading:false,busy:false,
  error:"",message:"",renameId:null,draft:{title:"",documentType:"routine"}};
const view=(overrides={},language="fr")=>renderClientFiles({language,logged:true,files:{...files,...overrides},
  uid,escape:esc,icon:()=>"*"});
test("Mobile : seul Aperçu et Réimprimer sont visibles sans ouvrir d'autres actions",()=>{
 const html=view();
 const start=html.indexOf('<div class="files-entry-actions">');
 const end=html.indexOf('</article>',start);
 assert.ok(start>0&&end>start);
 const block=html.slice(start,end);
 const primary=block.slice(0,block.indexOf('<details class="files-entry-more">'));
 assert.match(primary,/data-action="files-preview"/);
 assert.match(primary,/data-action="files-reprint"/);
 assert.doesNotMatch(primary,/files-download|files-rename-open|files-edit-source/);
 assert.match(block,/<summary>Autres actions<\/summary>/);
 assert.match(block,/data-action="files-download" data-id="/);
 assert.match(block,/Télécharger le PDF original/);
 assert.match(block,/data-action="files-rename-open"/);
 assert.doesNotMatch(block,/files-edit-source/);
 assert.match(view({},"en"),/<summary>More actions<\/summary>/);
});
test("Brouillon associé : Modifier la source reste possible et ne modifie jamais l'original",()=>{
 const html=view({items:[{...doc,source_draft_id:"44444444-4444-4444-8444-444444444444"}]});
 assert.ok(html.indexOf('data-action="files-edit-source"')>html.indexOf('<details class="files-entry-more">'));
 assert.match(html,/data-action="files-reprint"/);
});
test("Renommer ouvre le volet et met le focus sur le champ nouvellement rendu",()=>{
 const html=view({renameId:id});
 assert.match(html,/<details class="files-entry-more" open>/);
 assert.match(html,/data-form="files-rename"/);
 const app=readFileSync(new URL("../src/app.js",import.meta.url),"utf8");
 assert.match(app,/root\.querySelector\("#rename-"\+el\.dataset\.id\)\?\.focus\(\{preventScroll:false\}\)/);
});
test("320px, tablette et PC : gestes de 44px, pas de débordement dans l'action primaire",()=>{
 const css=readFileSync(new URL("../src/styles.css",import.meta.url),"utf8");
 assert.match(css,/\.files-entry-primary>\.btn\{min-height:44px/);
 assert.match(css,/\.files-entry-more>summary\{/);
 assert.match(css,/\.files-entry-more-actions>\.btn\{min-height:44px/);
 assert.match(css,/@media screen and \(max-width:780px\)/);
 assert.match(css,/@media screen and \(max-width:380px\)/);
 assert.match(css,/\.files-entry-primary>\.btn\{min-width:0;width:100%;grid-column:auto\}/);
});
test("Pas d'action privée sur l'écran non authentifié",()=>{
 const html=renderClientFiles({language:"fr",logged:false,files,uid:null,escape:esc,icon:()=>""});
 assert.doesNotMatch(html,/files-entry-more|files-reprint|files-download|Routine d'école/);
});
