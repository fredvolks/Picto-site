import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {renderClientPictoTemplateOptions} from "../src/picto-template-choices-ui.js";
import {planPreparedPdf} from "../src/print-pdf.js";
import {DEFAULT_PRESET} from "../src/core.js";
const app=readFileSync(new URL("../src/app.js",import.meta.url),"utf8");
const T={
 id:"00000000-0000-4000-8000-000000000444",name:"Carré 5 cm",
 shape:"square",width_cm:5,art_percent:70,
 square_center_mode:"upper_illustration_area",band_mm:12,stroke_mm:1.2,
 separator_mm:1.2,font_pt:14,rotation_deg:20,border_color:"#4775A9",
 font_color:"#111111",colored:true,is_published:true
};
const view=options=>renderClientPictoTemplateOptions({
 pictoName:"Pomme",templates:[T],selectedId:T.id,...options
});
const item={fr:"Pomme",en:"Apple",image:"<svg xmlns='http://www.w3.org/2000/svg'></svg>"};

test("La fiche client propose Lettre et A4, avec labels FR/EN explicites",()=>{
 const fr=view({paper:"letter",fr:true});
 assert.match(fr,/for="pa-client-template-paper">Format du papier/);
 assert.match(fr,/value="letter" selected/);
 assert.match(fr,/Lettre \(8,5 × 11 po\)/);
 assert.match(fr,/value="a4"/);
 assert.match(fr,/A4 \(210 × 297 mm\)/);
 assert.match(fr,/format du papier ne change pas les dimensions réelles/);
 assert.match(fr,/data-input="client-template-border-enabled"/);
 const en=view({paper:"a4",fr:false,borderEnabled:false,borderColor:"#B34747"});
 assert.match(en,/Paper size/);
 assert.match(en,/Letter \(8\.5 × 11 in\)/);
 assert.match(en,/value="a4" selected/);
 assert.match(en,/Paper size does not change the pictogram/);
 assert.match(en,/data-input="client-template-border-color"/);
 assert.doesNotMatch(en,/value="letter" selected/);
});
test("Sans gabarit, choix absent; en préparation PDF, sélection bloquée",()=>{
 const empty=renderClientPictoTemplateOptions({templates:[],paper:"a4"});
 assert.doesNotMatch(empty,/pa-client-template-paper/);
 assert.match(empty,/Aucun gabarit proposé/);
 const busy=view({paper:"a4",busy:true});
 assert.match(busy,/data-input="client-template-paper" disabled/);
 assert.match(busy,/data-action="client-template-print" disabled/);
 for(const paper of ["A4","legal","","tabloid",null,0]){
  assert.throws(()=>view({paper}),/Format de papier invalide/);
 }
});
test("Lettre/A4 change seulement la page physique, jamais les dimensions du picto",()=>{
 const params={items:[item],kind:"board",columns:1,title:"Pomme",
  preset:{...DEFAULT_PRESET,rotationDeg:20,colored:false},widthCm:5};
 const letter=planPreparedPdf({...params,paper:"letter"});
 const a4=planPreparedPdf({...params,paper:"a4"});
 assert.equal(letter.pageW,215.9);
 assert.equal(letter.pageH,279.4);
 assert.equal(a4.pageW,210);
 assert.equal(a4.pageH,297);
 assert.equal(letter.widthMm,50);
 assert.equal(a4.widthMm,50);
 assert.equal(a4.heightMm,letter.heightMm);
 assert.equal(a4.preset.rotationDeg,20);
 assert.equal(letter.pages.length,1);
 assert.equal(a4.pages.length,1);
 assert.deepEqual(a4.pages[0][0][0],item);
});
test("L'intégration enregistre le format sélectionné et le valide avant PDF",()=>{
 assert.match(app,/borderEnabled:null,borderColor:null,paper:"letter"/);
 assert.match(app,/borderEnabled:f\.borderEnabled,borderColor:f\.borderColor,paper:f\.paper/);
 assert.match(app,/if\(TEMPLATE_CHOICES_RELEASED&&event\.target\.dataset\.input==="client-template-paper"\)/);
 assert.match(app,/if\(!\["letter","a4"\]\.includes\(event\.target\.value\)\)return/);
 const section=app.slice(app.indexOf('if(a==="client-template-print")'),
  app.indexOf('if(a==="admin-preview")'));
 assert.match(section,/printPaper=clientPictoTemplates\.paper/);
 assert.match(section,/!\["letter","a4"\]\.includes\(printPaper\)/);
 assert.match(section,/paper:printPaper,language:printLanguage,title/);
 assert.match(section,/const printPreset=applyPublishedImageScale/);
 assert.match(section,/applyClientBorderPreference\(settings,borderPreference\),approvedScale/);
 assert.match(section,/archivePdf\(client,uid,blob/);
 assert.match(app,/let TEMPLATE_CHOICES_RELEASED=false/);
});
test("Le dialogue garde le sélecteur de format dans l'ordre Tab et restaure le focus",()=>{
 assert.match(app,/button:not\(\[disabled\]\),input:not\(\[disabled\]\),select:not\(\[disabled\]\)/);
 const start=app.indexOf('const templateDialog=root.querySelector(".pa-template-dialog");',
  app.indexOf("function render(){"));
 const end=app.indexOf("\n}\n// La fermeture ne garantit jamais",start);
 assert.ok(start>=0&&end>start);
 const source=app.slice(start,end);
 let focused=null;
 const paper={focus(){focused="paper";}};
 const copies={focus(){focused="copies";}};
 const radio={value:"choice",focus(){focused="radio";}};
 const close={focus(){focused="close";}};
 const dialog={scrollTop:0,querySelectorAll:()=>[radio],
  querySelector:sel=>sel==="#pa-client-template-paper"?paper:
    sel==="#pa-client-template-copies"?copies:close};
 const root={querySelector:()=>dialog};
 const run=new Function("root","templateFocusedId","templatePaperFocused",
  "templateCopiesFocused","templateModalScroll",
  "templateFocusedInput","templateFocusedColor",source);
 run(root,null,true,false,36,null,null);
 assert.equal(focused,"paper");
 assert.equal(dialog.scrollTop,36);
 run(root,null,false,true,70,null,null);
 assert.equal(focused,"copies");
 assert.equal(dialog.scrollTop,70);
 run(root,"choice",false,false,0,null,null);
 assert.equal(focused,"radio");
 run(root,null,false,false,0,null,null);
 assert.equal(focused,"close");
});
