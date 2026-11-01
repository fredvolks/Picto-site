import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {DEFAULT_PRESET} from "../app/src/core.js";
import {planPreparedPdf,fitPhysicalCopyColumns,paintIndividualCellBorder} from "../app/src/print-pdf.js";
import {repeatApprovedPictoForPrint,validateClientPictoCopies} from "../app/src/client-template-print.js";
import {renderClientPictoTemplateOptions} from "../app/src/picto-template-choices-ui.js";

const app=readFileSync(new URL("../app/src/app.js",import.meta.url),"utf8");
const pdf=readFileSync(new URL("../app/src/print-pdf.js",import.meta.url),"utf8");
const png=new Blob([new Uint8Array(40)],{type:"image/png"});
const row={title_fr:"Pomme",title_en:"Apple"};
const preset={...DEFAULT_PRESET,colored:true,rotationDeg:15};
const id="00000000-0000-4000-8000-000000000444";
const tpl={id,name:"Pomme",is_published:true,shape:"square",width_cm:5,
 art_percent:70,square_center_mode:"upper_illustration_area",band_mm:12,
 stroke_mm:1.2,separator_mm:1.2,font_pt:14,rotation_deg:15,
 border_color:"#4775a9",font_color:"#111111",colored:true};

test("Le site sert les choix de 1 à 12 copies et les libellés FR/EN",()=>{
 const fr=renderClientPictoTemplateOptions({pictoName:"Pomme",templates:[tpl],selectedId:id,copies:12,fr:true});
 assert.match(fr,/data-input="client-template-copies"/);
 assert.match(fr,/Nombre d’exemplaires/);
 assert.match(fr,/value="12" selected/);
 assert.match(fr,/répartis automatiquement/);
 assert.equal((fr.match(/<option value="\d+"/g)||[]).length,12);
 const en=renderClientPictoTemplateOptions({templates:[tpl],copies:6,fr:false});
 assert.match(en,/Number of copies/);
 assert.match(en,/without shrinking them/);
 assert.match(en,/value="6" selected/);
 assert.match(renderClientPictoTemplateOptions({templates:[tpl],busy:true}),/data-input="client-template-copies" disabled/);
 for(const copies of [0,13,"3",1.5,NaN,Infinity]){
  assert.throws(()=>renderClientPictoTemplateOptions({templates:[tpl],copies}),/exemplaires/);
 }
});

test("Une planche PDF 12 copies 5 cm tient sur Lettre et A4 sans réduire ni couper",()=>{
 const items=repeatApprovedPictoForPrint(row,png,12);
 assert.equal(items.length,12);
 assert.ok(items.every(v=>v===items[0]&&v.pngBlob===png));
 for(const paper of ["letter","a4"]){
  const columns=fitPhysicalCopyColumns({widthCm:5,preset,paper,copies:12});
  assert.equal(columns,3);
  const p=planPreparedPdf({items,kind:"board",widthCm:5,
   columns,individualBorders:true,paper,preset,title:"Pomme"});
  assert.equal(p.widthMm,50);
  assert.equal(p.heightMm,50);
  assert.equal(p.columns,3);
  assert.equal(p.edgeMm,1.2);
  assert.ok(Math.abs(p.totalWidthMm-161.2)<1e-8);
  assert.equal(p.pages.length,1);
  assert.deepEqual(p.pages[0].map(r=>r.length),[3,3,3,3]);
  assert.equal(p.pages.flat(2).length,12);
 }
});

test("Les grands pictogrammes occupent une colonne et plusieurs pages",()=>{
 const columns=fitPhysicalCopyColumns({widthCm:10,preset,paper:"letter",copies:12});
 assert.equal(columns,1);
 const p=planPreparedPdf({items:repeatApprovedPictoForPrint(row,png,12),
  kind:"board",columns,individualBorders:true,widthCm:10,paper:"letter",
  preset,title:"Pomme"});
 assert.equal(p.widthMm,100);
 assert.ok(p.pages.length>1);
 assert.equal(p.pages.flat(2).length,12);
 assert.ok(p.totalWidthMm<195.9);
 assert.equal(fitPhysicalCopyColumns({widthCm:2,preset,copies:12}),4);
});

test("Bordure colorée individuelle et refus des paramètres invalides",()=>{
 const plan=planPreparedPdf({items:repeatApprovedPictoForPrint(row,png,3),
  kind:"board",columns:3,individualBorders:true,widthCm:5,paper:"letter",
  preset,title:"Pomme"});
 const draws=[];
 const ctx={fillStyle:null,fillRect(...args){draws.push({args,color:this.fillStyle});}};
 assert.equal(paintIndividualCellBorder(ctx,plan,12,30),true);
 assert.equal(paintIndividualCellBorder(ctx,plan,66.4,30),true);
 assert.equal(draws.length,2);
 assert.deepEqual(draws.map(d=>d.args.slice(2)),[[52.4,52.4],[52.4,52.4]]);
 assert.ok(draws[0].args[0]+52.4<draws[1].args[0]);
 assert.equal(paintIndividualCellBorder(ctx,{...plan,individualBorders:false},12,30),false);
 for(const copies of [0,13,1.5,null,"3"])assert.throws(()=>validateClientPictoCopies(copies),/exemplaires/);
 assert.throws(()=>fitPhysicalCopyColumns({widthCm:5,preset,paper:"legal",copies:12}),/papier/);
 assert.throws(()=>planPreparedPdf({items:repeatApprovedPictoForPrint(row,png,3),kind:"board",
   columns:4,individualBorders:true,widthCm:5,paper:"letter",preset,title:"Pomme"}),/largeur imprimable/);
});

test("La publication préserve les protections SVG supplémentaires du site",()=>{
 assert.match(pdf,/\(\?:\\son\[a-z\]/);
 assert.match(pdf,/feimage/);
 assert.match(pdf,/@import/);
 const invalid={fr:"X",image:'<svg xmlns="http://www.w3.org/2000/svg"><style>body{fill:red}</style></svg>'};
 assert.throws(()=>planPreparedPdf({items:[invalid],kind:"board",columns:1,
  widthCm:5,preset,title:"Pomme"}),/source vectorielle/);
});

test("Le circuit client garde la double revalidation du gabarit et une archive unique",()=>{
 const section=app.slice(app.indexOf('if(a==="client-template-print")'),
  app.indexOf('if(a==="admin-preview")'));
 assert.ok(section.length>700);
 assert.match(section,/TEMPLATE_CHOICES_RELEASED/);
 assert.match(section,/SITE_EMBEDDED/);
 assert.match(section,/!authStatus.user/);
 assert.match(section,/fitPhysicalCopyColumns/);
 assert.match(section,/individualBorders:true/);
 assert.match(section,/repeatApprovedPictoForPrint/);
 assert.equal((section.match(/loadConfirmedPrintSettings\(client,uid,id,chosenId\)/g)||[]).length,2);
 assert.equal((section.match(/archivePdf\(client,uid,blob/g)||[]).length,1);
 assert.match(section,/pendingGeneratedPdf/);
 assert.match(section,/state.page="files"/);
 assert.match(app,/dataset.input==="client-template-copies"/);
 assert.match(app,/copies:1,loading:false/);
});
