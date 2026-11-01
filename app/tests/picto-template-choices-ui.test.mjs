import test from "node:test";
import assert from "node:assert/strict";
import {
 renderAdminPictoTemplatePicker,renderClientPictoTemplateOptions,confirmationMessage
} from "../src/picto-template-choices-ui.js";

const P="00000000-0000-4000-8000-000000000333";
const A="00000000-0000-4000-8000-000000000444";
const B="00000000-0000-4000-8000-000000000445";
const templates=[
 {id:A,name:"Carré 5 cm",shape:"square",width_cm:5,
  border_color:"#4775a9",colored:true,is_published:true},
 {id:B,name:"Vertical noir et blanc",shape:"portrait",width_cm:4,
  border_color:"#111111",colored:false,is_published:true}
].map(t=>({
  art_percent:70,square_center_mode:"upper_illustration_area",band_mm:12,
  stroke_mm:1.2,font_pt:14,separator_mm:1.2,font_color:"#111111",
  rotation_deg:0,...t
}));
test("Admin peut cocher plusieurs choix sur la fiche officielle",()=>{
 const html=renderAdminPictoTemplatePicker({
   catalogId:P,templates,selected:[A,B],confirmed:[A],
   revision:2,confirmedRevision:1,fr:true
 });
 assert.match(html,/data-input="picto-template-toggle"/);
 assert.match(html,/Confirmer la visibilité pour les clients/);
 assert.match(html,/Carré 5 cm/);
 assert.match(html,/Vertical noir et blanc/);
 assert.equal((html.match(/type="checkbox"/g)||[]).length,2);
 assert.match(html,/Sélection non confirmée/);
 assert.match(html,/data-action="picto-template-confirm"/);
});
test("La confirmation est bloquée si les modifications n'ont pas été sauvegardées",()=>{
 const html=renderAdminPictoTemplatePicker({
   catalogId:P,templates,selected:[A,B],confirmed:[A],
   revision:1,confirmedRevision:1,dirty:true
 });
 assert.match(html,/data-action="picto-template-confirm" disabled/);
 assert.doesNotMatch(html,/data-action="picto-template-stage" disabled/);
});
test("Sans brouillon serveur, le bouton confirmer reste désactivé",()=>{
 const html=renderAdminPictoTemplatePicker({
   catalogId:P,templates,selected:[],confirmed:[],revision:0
 });
 assert.match(html,/data-action="picto-template-confirm" disabled/);
});
test("Confirmation d'aucun gabarit demande encore une validation explicite",()=>{
 const text=confirmationMessage({pictoName:"Pomme",selected:[],fr:true});
 assert.match(text,/Confirmer 0 gabarit/);
 assert.match(text,/Pomme/);
});
test("Client voit uniquement les modèles publiés déjà fournis par la lecture serveur",()=>{
 const html=renderClientPictoTemplateOptions({
   pictoName:"Pomme",templates:templates.slice(0,1),selectedId:A
 });
 assert.match(html,/Choisir mon gabarit/);
 assert.equal((html.match(/type="radio"/g)||[]).length,1);
 assert.match(html,/checked/);
 assert.doesNotMatch(html,/Vertical noir et blanc/);
 const empty=renderClientPictoTemplateOptions({pictoName:"Pomme",templates:[]});
 assert.match(empty,/Aucun gabarit proposé/);
});
test("HTML échappé et aucun gabarit non publié dans la fiche client",()=>{
 const html=renderClientPictoTemplateOptions({
   pictoName:"<img src=x onerror=alert(1)>",
   templates:[{...templates[0],name:"<script>x</script>"}]
 });
 assert.ok(!html.includes("<script>"));
 assert.ok(!html.includes("<img src=x"));
 assert.match(html,/&lt;script&gt;/);
 assert.throws(()=>renderClientPictoTemplateOptions({
   templates:[{...templates[0],is_published:false}]
 }),/non publié/);
});

test("Un gabarit dépublié ne bloque plus indéfiniment la sélection du Super Admin",()=>{
 const revoked="00000000-0000-4000-8000-000000000449";
 const html=renderAdminPictoTemplatePicker({
   catalogId:P,templates,selected:[A,revoked],confirmed:[A,revoked],
   revision:3,confirmedRevision:2,fr:true
 });
 assert.match(html,/gabarits précédemment choisis ne sont plus publiés/);
 assert.match(html,/data-action="picto-template-remove-unpublished"/);
 assert.match(html,/Retirer les gabarits non publiés de ma sélection/);
 assert.match(html,/data-action="picto-template-stage" disabled/);
 assert.match(html,/data-action="picto-template-confirm" disabled/);
 assert.equal((html.match(/type="checkbox"/g)||[]).length,2);
 assert.doesNotMatch(html,/value="00000000-0000-4000-8000-000000000449"/);
});

test("Le retrait des modèles dépubliés reste possible en anglais, mais pas pendant la sauvegarde",()=>{
 const revoked="00000000-0000-4000-8000-000000000449";
 const loading=renderAdminPictoTemplatePicker({
   catalogId:P,templates,selected:[revoked],confirmed:[revoked],
   revision:2,confirmedRevision:1,busy:true,fr:false
 });
 assert.match(loading,/data-action="picto-template-remove-unpublished" disabled/);
 const idle=renderAdminPictoTemplatePicker({
   catalogId:P,templates,selected:[revoked],confirmed:[revoked],
   revision:2,confirmedRevision:1,busy:false,fr:false
 });
 assert.match(idle,/Remove unpublished templates from my selection/);
 assert.doesNotMatch(idle,/data-action="picto-template-remove-unpublished" disabled/);
});

