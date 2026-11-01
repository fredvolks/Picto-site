import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const source=readFileSync(new URL("../src/app.js",import.meta.url),"utf8");
const marker='root.addEventListener("keydown",function(event){';
const start=source.indexOf(marker);
const end=source.indexOf('\n});\n// Fallback robuste',start);
if(start<0||end<0)throw Error("Gestionnaire clavier de la fiche introuvable.");

// Exécuter le vrai corps du gestionnaire, avec un DOM minimal contrôlé.
// Aucun appel à Supabase, aucun compte réel et aucune activation du feature flag.
function fixture({focused="close"}={}){
 let closed=0,prevented=0;
 const close={name:"close",focus(){document.activeElement=this;}};
 const radio={name:"radio",focus(){document.activeElement=this;}};
 const outside={name:"outside"};
 const controls=[close,radio];
 const document={activeElement:focused==="radio"?radio:focused==="outside"?outside:close};
 const dialog={
   querySelectorAll:()=>controls,
   contains:item=>controls.includes(item)
 };
 const root={querySelector:selector=>selector===".pa-template-dialog"?dialog:null};
 const build=new Function("root","TEMPLATE_CHOICES_RELEASED","clientPictoTemplates",
   "closeClientPictoTemplateChoices","state","SITE_EMBEDDED",
   "clientFiles","document","render","clearClientPreview","selectClientPreviewPage",
   "return function(event){"+source.slice(start+marker.length,end)+"\n}");
 const handler=build(root,true,{pictoId:"00000000-0000-4000-8000-000000000333"},
   ()=>{closed++;}, {page:"library",adminMenuOpen:false},true,{preview:null},
   document,()=>{},()=>{},()=>false);
 return {
   document,close,radio,outside,
   key(key,{shiftKey=false}={}){
     const event={key,shiftKey,preventDefault(){prevented++;}};
     handler(event);
   },
   closed:()=>closed,prevented:()=>prevented
 };
}
test("Échap ferme la fiche client, même pendant le chargement",()=>{
 const f=fixture();
 f.key("Escape");
 assert.equal(f.closed(),1);
 assert.equal(f.prevented(),1);
});
test("Maj+Tab sur la première action revient à la dernière",()=>{
 const f=fixture({focused:"close"});
 f.key("Tab",{shiftKey:true});
 assert.equal(f.document.activeElement,f.radio);
 assert.equal(f.prevented(),1);
});
test("Tab sur la dernière option revient à Fermer",()=>{
 const f=fixture({focused:"radio"});
 f.key("Tab");
 assert.equal(f.document.activeElement,f.close);
 assert.equal(f.prevented(),1);
});
test("Le clavier ne peut pas reprendre le focus en dehors du dialogue",()=>{
 const f=fixture({focused:"outside"});
 f.key("Tab");
 assert.equal(f.document.activeElement,f.close);
 assert.equal(f.prevented(),1);
});
test("Les autres touches ne ferment pas la fiche",()=>{
 const f=fixture();
 f.key("ArrowDown");
 assert.equal(f.closed(),0);
 assert.equal(f.prevented(),0);
});
test("Le focus est rétabli après rendu et lors de la fermeture explicite",()=>{
 assert.match(source,/const templateFocusedId=document\.activeElement/);
 assert.match(source,/templateDialog\.querySelectorAll\('\[data-input="client-template-select"\]'\)/);
 assert.match(source,/\?\.focus\(\{preventScroll:true\}\)/);
 assert.match(source,/function closeClientPictoTemplateChoices\(\)/);
 assert.match(source,/if\(a==="client-template-close"\)\{closeClientPictoTemplateChoices\(\);return;\}/);
 assert.match(source,/event\.target\?\.classList\?\.contains\("pa-template-modal-backdrop"\)/);
});
test("Le verrou Supabase reste désactivé malgré le dialogue préparé",()=>{
 assert.match(source,/let TEMPLATE_CHOICES_RELEASED=false/);
});

test("Fermer la fenêtre retourne au pictogramme d'origine, sans recharger ses choix",()=>{
 const marker="function closeClientPictoTemplateChoices(){";
 const start=source.indexOf(marker),end=source.indexOf("\n}\nasync function openAdminTemplateChoices",start);
 assert.ok(start>=0&&end>start,"Fonction de fermeture introuvable");
 const body=source.slice(start+marker.length,end);
 let cleared=0,rendered=0,focused=0,selector="";
 const id="00000000-0000-4000-8000-000000000333";
 const root={querySelector:term=>{selector=term;return{focus(){focused++;}};}};
 const fn=new Function("clientPictoTemplates","resetClientPictoTemplates","render","root",
   "return function(){"+body+"\n}")({pictoId:id},()=>{cleared++;},()=>{rendered++;},root);
 fn();
 assert.equal(cleared,1);
 assert.equal(rendered,1);
 assert.equal(focused,1);
 assert.equal(selector,'[data-action="approved-template-open"][data-id="'+id+'"]');
});
test("Un nouveau rendu restaure la radio choisie et ne vole pas le focus hors du dialogue",()=>{
 const marker='const templateDialog=root.querySelector(".pa-template-dialog");';
 const start=source.indexOf(marker,source.indexOf("function render(){"));
 const end=source.indexOf("\n}\n// La fermeture ne garantit jamais",start);
 assert.ok(start>=0&&end>start,"Restauration du focus introuvable");
 const body=source.slice(start,end);
 let focusRadio=0,focusClose=0;
 const radio={value:"choice-id",focus(){focusRadio++;}};
 const close={focus(){focusClose++;}};
 const dialog={
   querySelectorAll:()=>[radio],
   querySelector:()=>close
 };
 const root={querySelector:()=>dialog};
 const fn=new Function("root","templateFocusedId",body);
 fn(root,"choice-id");
 assert.equal(focusRadio,1);
 assert.equal(focusClose,0);
 fn(root,null);
 assert.equal(focusClose,1);
});
