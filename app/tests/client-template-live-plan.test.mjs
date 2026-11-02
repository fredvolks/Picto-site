import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {samples} from "../src/data.js";
import {DEFAULT_PRESET} from "../src/core.js";
import {previewPhysicalCopySheet,planPreparedPdf} from "../src/print-pdf.js";
const app=readFileSync(new URL("../src/app.js",import.meta.url),"utf8");

test("Changer le papier ou le nombre d'exemplaires recalcule tout de suite le schéma",()=>{
 const start=app.indexOf('if(TEMPLATE_CHOICES_RELEASED&&event.target.dataset.input==="client-template-copies")');
 const end=app.indexOf('if(TEMPLATE_CHOICES_RELEASED&&event.target.dataset.input==="client-template-select")',start);
 assert.ok(start>0&&end>start);
 const handlers=app.slice(start,end);
 assert.match(handlers,/clientPictoTemplates\.copies=validateClientPictoCopies/);
 assert.match(handlers,/clientPictoTemplates\.paper=event\.target\.value/);
 assert.equal((handlers.match(/render\(\);return;/g)||[]).length,2);
 assert.ok(app.includes('templateCopiesFocused'));
 assert.ok(app.includes('templateDialog.scrollTop=templateModalScroll'));
});

test("Le PNG approuvé est réellement chargé, pas une image de démonstration",()=>{
 const a=app.indexOf('async function openClientPictoTemplateChoices(id){');
 const b=app.indexOf('function renderClientPictoTemplateModal(){',a);
 assert.ok(a>0&&b>a);
 const open=app.slice(a,b);
 assert.match(open,/loadApprovedSelection\(client,uid,\[id\]\)/);
 assert.match(open,/downloadPublishedArtwork\(client,uid,approved\[0\]\)/);
 assert.match(open,/publishedCatalog\.imageUrls\.set\(id,URL\.createObjectURL\(blob\)\)/);
 assert.doesNotMatch(open,/samples\.|mock|fake/);
});

test("Pagination annoncée identique au moteur PDF sans diminution du pictogramme",()=>{
 for(const paper of ["letter","a4"])for(const copies of [1,2,4,8,12])
   for(const widthCm of [3,5,7.5,10]){
     const preset={...DEFAULT_PRESET};
     const layout=previewPhysicalCopySheet({widthCm,preset,paper,copies});
     const actual=planPreparedPdf({items:Array.from({length:copies},()=>samples[0]),kind:"board",
       columns:layout.columns,individualBorders:true,widthCm,preset,paper,language:"fr",title:"Mon picto"});
     assert.equal(layout.pages,actual.pages.length);
     assert.equal(layout.columns,actual.columns);
     assert.equal(actual.pages.flat(2).length,copies);
     assert.equal(actual.widthMm,widthCm*10);
   }
});

test("Le contrôle du nombre de pages bloque l'archivage mensonger",()=>{
 const a=app.indexOf('if(a==="client-template-print"){');
 const b=app.indexOf('if(a==="admin-preview"){',a);
 assert.ok(a>0&&b>a);
 const handler=app.slice(a,b);
 const check=handler.indexOf("if(pageCount!==layout.pages)");
 const archive=handler.indexOf("await archivePdf(");
 assert.ok(check>0&&archive>check);
 assert.match(handler,/columns:layout\.columns/);
 assert.match(handler,/loadConfirmedPrintSettings\(client,uid,id,chosenId\)/);
});
