import test from "node:test";
import assert from "node:assert/strict";
import {namedTemplatePrintSettings,loadConfirmedPrintSettings,applyClientBorderPreference} from "../src/client-template-print.js";
import {planPreparedPdf} from "../src/print-pdf.js";

const UID="00000000-0000-4000-8000-000000000002";
const PICTO="00000000-0000-4000-8000-000000000333";
const ID="00000000-0000-4000-8000-000000000444";
const OTHER="00000000-0000-4000-8000-000000000445";
const t={
 id:ID,name:"Carré bleu",is_published:true,shape:"square",width_cm:5,
 art_percent:70,square_center_mode:"upper_illustration_area",band_mm:12,
 stroke_mm:1.2,font_pt:14,separator_mm:1.2,
 border_color:"#4775a9",font_color:"#111111",colored:true,rotation_deg:20,
 choices:[{catalog_id:PICTO}]
};
function server({user=UID,rows=[t],onAuth=()=>{}}={}){
 let calls=0;
 const filters=[];
 const client={
  auth:{getUser:async()=>{calls++;onAuth(calls);return{data:{user:{id:user}},error:null};}},
  from(name){
   assert.equal(name,"pictau_templates","La sélection client ne lit pas les brouillons privés.");
   const query={
    select(fields){assert.match(fields,/choices:pictau_picto_template_choices!inner/);return this;},
    eq(field,value){filters.push([field,value]);return this;},
    order(){return this;},
    async limit(){
     return {data:rows.filter(row=>filters.every(([k,v])=>
       k==="is_published"?row.is_published===v:
       k==="choices.catalog_id"?row.choices?.[0]?.catalog_id===v:true)),
       error:null};
    }
   };
   return query;
  }
 };
 return {client,filters,calls:()=>calls};
}
test("Le gabarit confirmé fournit exactement le preset pour le PDF",()=>{
 const result=namedTemplatePrintSettings(t);
 assert.equal(result.templateId,ID);
 assert.equal(result.widthCm,5);
 assert.equal(result.preset.shape,"square");
 assert.equal(result.preset.rotationDeg,20);
 assert.equal(result.preset.artPercent,70);
 assert.equal(result.preset.color,"#4775a9");
 assert.equal(result.preset.colored,true);
 assert.equal(result.preset.fontColor,"#111111");
 assert.ok(!Object.hasOwn(result,"choices"));
});
test("Un modèle dépublié ou aux réglages malformés ne peut être imprimé",()=>{
 for(const changes of [
  {is_published:false},{width_cm:11},{art_percent:120},{font_color:"red"},
  {rotation_deg:181},{stroke_mm:null},{shape:"unknown"}, {colored:"true"},
  {square_center_mode:"other"}
 ])assert.throws(()=>namedTemplatePrintSettings({...t,...changes}),/invalide/);
});
test("Un modèle confirmé est relu depuis le catalogue et la session client réelle",async()=>{
 const api=server();
 const result=await loadConfirmedPrintSettings(api.client,UID,PICTO,ID);
 assert.equal(result.templateId,ID);
 assert.ok(api.calls()>=2);
 assert.deepEqual(api.filters,[["is_published",true],["choices.catalog_id",PICTO]]);
});
test("Un modèle absent de la sélection confirmée est refusé",async()=>{
 const api=server();
 await assert.rejects(loadConfirmedPrintSettings(api.client,UID,PICTO,OTHER),
   /n'est plus proposé/);
});
test("Un modèle dépublié ou d'un autre picto est refusé avant PDF",async()=>{
 for(const rows of [[{...t,is_published:false}],[{...t,choices:[{catalog_id:OTHER}]}]]){
  const api=server({rows});
  await assert.rejects(loadConfirmedPrintSettings(api.client,UID,PICTO,ID),
    /n'est plus proposé/);
 }
});
test("Une session révoquée pendant la requête bloque le choix",async()=>{
 let user=UID;
 const api=server({onAuth:count=>{if(count===2)user=OTHER;}});
 api.client.auth.getUser=async()=>{api._count=(api._count||0)+1;
   if(api._count===2)user=OTHER;
   return{data:{user:{id:user}},error:null};};
 await assert.rejects(loadConfirmedPrintSettings(api.client,UID,PICTO,ID),
   /La session a changé/);
});
test("Le PDF accepte une seule case avec dimensions et rotation enregistrées",()=>{
 const {preset,widthCm}=namedTemplatePrintSettings(t);
 const plan=planPreparedPdf({items:[{fr:"Pomme",en:"Apple",
  image:"<svg xmlns='http://www.w3.org/2000/svg'></svg>"}],
  kind:"board",columns:1,title:"Pomme",preset,widthCm,paper:"letter"});
 assert.equal(plan.totalWidthMm,52.4,"Le cadre coloré ajoute des marges autour de la case.");
 assert.equal(plan.edgeMm,1.2);
 const plain=planPreparedPdf({items:[{fr:"Pomme",en:"Apple",
   image:"<svg xmlns='http://www.w3.org/2000/svg'></svg>"}],kind:"board",
   columns:1,title:"Pomme",preset:{...preset,colored:false},widthCm,paper:"letter"});
 assert.equal(plain.totalWidthMm,50,"Sans contour coloré, aucune marge extérieure.");
 assert.equal(plan.widthMm,50);
 assert.equal(plan.preset.rotationDeg,20);
 assert.equal(plan.pages.length,1);
 assert.equal(plan.pages[0][0][0].fr,"Pomme");
});
test("Les valeurs de rotation hors bornes sont refusées par le générateur",()=>{
 const {preset,widthCm}=namedTemplatePrintSettings(t);
 for(const rotationDeg of [NaN,Infinity,181,"10"]){
  assert.throws(()=>planPreparedPdf({items:[{fr:"Pomme",en:"Apple",
    image:"<svg xmlns='http://www.w3.org/2000/svg'></svg>"}],
    kind:"board",columns:1,title:"Pomme",preset:{...preset,rotationDeg},widthCm}),
    /Gabarit PDF invalide/);
 }
});

test("Le client peut retirer et recolorer le contour du PDF sans changer le modèle publié",()=>{
 const settings=namedTemplatePrintSettings(t);
 const plain=applyClientBorderPreference(settings,{colored:false,borderColor:"#CC4422"});
 assert.equal(plain.preset.colored,false);
 assert.equal(plain.preset.color,"#cc4422");
 assert.equal(settings.preset.colored,true);
 assert.equal(settings.preset.color,"#4775a9");
 assert.equal(t.border_color,"#4775a9");
 const base=applyClientBorderPreference(settings);
 assert.deepEqual(base,settings);
 const restored=applyClientBorderPreference(settings,{colored:true,borderColor:"#607A6F"});
 const item={fr:"Pomme",en:"Apple",image:"<svg xmlns='http://www.w3.org/2000/svg'></svg>"};
 const without=planPreparedPdf({items:[item],kind:"board",columns:1,title:"Pomme",
   preset:plain.preset,widthCm:settings.widthCm,paper:"letter"});
 const withBorder=planPreparedPdf({items:[item],kind:"board",columns:1,title:"Pomme",
   preset:restored.preset,widthCm:settings.widthCm,paper:"letter"});
 assert.equal(without.totalWidthMm,50);
 assert.equal(withBorder.totalWidthMm,52.4);
 assert.equal(withBorder.preset.color,"#607a6f");
 assert.equal(withBorder.preset.rotationDeg,20,"La rotation approuvée reste intacte");
 assert.equal(withBorder.pages.length,1);
});
test("Les choix de contour malformés ne peuvent modifier le PDF",()=>{
 const settings=namedTemplatePrintSettings(t);
 for(const input of [{colored:"false"},{colored:0},{colored:undefined,borderColor:"red"},
   {borderColor:"transparent"},{borderColor:"#FFFFFF;url(x)"},{borderColor:""}]){
   assert.throws(()=>applyClientBorderPreference(settings,input),/invalide/);
 }
 assert.throws(()=>applyClientBorderPreference(null,{}),/invalide/);
});
