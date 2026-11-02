import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const app=readFileSync(new URL("../src/app.js",import.meta.url),"utf8");
const print=readFileSync(new URL("../src/print-pdf.js",import.meta.url),"utf8");
const ui=readFileSync(new URL("../src/picto-template-choices-ui.js",import.meta.url),"utf8");

test("L'action existe dans la fiche client uniquement après sélection d'un modèle",()=>{
 assert.match(ui,/data-action="client-template-print"/);
 assert.match(ui,/!selectedId\|\|busy\|\|!layout\?" disabled"/);
 assert.match(ui,/layout=previewPhysicalCopySheet\(/,"le calcul valide conditionne le bouton");
 assert.match(app,/if\(a==="client-template-print"\)/);
 assert.match(app,/clientPictoTemplates\.busy=true/);
 assert.match(app,/TEMPLATE_CHOICES_RELEASED/);
});
test("L'impression revérifie le serveur après téléchargement du PNG",()=>{
 const block=app.slice(app.indexOf('if(a==="client-template-print")'),
   app.indexOf('if(a==="admin-preview")'));
 assert.equal((block.match(/loadConfirmedPrintSettings\(client,uid,id,chosenId\)/g)||[]).length,2);
 assert.match(block,/loadApprovedSelection\(client,uid,\[id\]\)/);
 assert.match(block,/downloadPublishedArtwork\(client,uid,row\)/);
 assert.match(block,/JSON\.stringify\(latest\)!==JSON\.stringify\(settings\)/);
 assert.equal((block.match(/loadPublishedImageScale\(client,uid,id\)/g)||[]).length,2);
 assert.match(block,/if\(!current\(\)\)return;/);
});
test("Le PDF d'une case est enregistré dans Mes fichiers sans démo",()=>{
 const block=app.slice(app.indexOf('if(a==="client-template-print")'),
   app.indexOf('if(a==="admin-preview")'));
 assert.match(block,/createPreparedPdf\(\{/);
 assert.match(block,/kind:"board",columns:layout\.columns,individualBorders:true/);
 assert.match(block,/if\(pageCount!==layout\.pages\)/);
 assert.match(block,/const printPreset=applyPublishedImageScale/);
 assert.match(block,/archivePdf\(client,uid,blob/);
 assert.match(block,/pendingGeneratedPdf=/);
 assert.match(block,/state\.page="files"/);
 assert.doesNotMatch(block,/samples\[/);
});
test("Le dessin PNG tourne autour du centre sans toucher au cadre",()=>{
 assert.match(print,/const rotatedWidth=img\.inkWidth\*c\+img\.inkHeight\*sin/);
 assert.match(print,/const rotatedHeight=img\.inkWidth\*sin\+img\.inkHeight\*c/);
 assert.match(print,/ctx\.translate\(x\+stroke\+placement\.left\+placement\.width\/2/);
 assert.match(print,/ctx\.rotate\(radians\)/);
 assert.match(print,/ctx\.restore\(\)/);
});
test("Le module d\u0027impression reste fermé sans les tables réelles",()=>{
 assert.match(app,/import .*loadConfirmedPrintSettings,loadPublishedImageScale,applyPublishedImageScale,applyClientBorderPreference,validateClientPictoCopies,repeatApprovedPictoForPrint/);
 assert.match(app,/let TEMPLATE_CHOICES_RELEASED=false/);
});

test("Un choix supprimé affiche une erreur récupérable sans impression automatique",()=>{
 assert.match(app,/data-action="client-template-refresh"/);
 assert.match(app,/if\(a==="client-template-refresh"\)/);
 assert.match(app,/openClientPictoTemplateChoices\(clientPictoTemplates\.pictoId\)/);
 assert.match(app,/clientPictoTemplates\.error=String\(error\?\.message\|\|error\)/);
 assert.match(app,/!f\.loading&&!f\.error\?renderClientPictoTemplateOptions/);
});
test("Un contour coloré est facultatif et limité au PDF du pictogramme seul",()=>{
 assert.match(print,/kind==="board"&&columns===1&&preset\.colored/);
 assert.match(print,/paintIndividualCellBorder/);
});

test("La palette n'efface pas la sélection et se réinitialise par modèle",()=>{
 assert.match(app,/clientPictoTemplates\.borderEnabled=row\.colored/);
 assert.match(app,/clientPictoTemplates\.borderColor=row\.border_color/);
 assert.match(app,/if\(a==="client-template-border-swatch"\)/);
 assert.match(app,/if\(TEMPLATE_CHOICES_RELEASED&&event\.target\.dataset\.input==="client-template-border-enabled"\)/);
 assert.match(app,/if\(TEMPLATE_CHOICES_RELEASED&&event\.target\.dataset\.input==="client-template-border-color"\)/);
 assert.match(app,/borderEnabled:null,borderColor:null/);
 assert.match(ui,/data-input="client-template-border-color"/);
 assert.match(ui,/data-action="client-template-border-swatch"/);
});
