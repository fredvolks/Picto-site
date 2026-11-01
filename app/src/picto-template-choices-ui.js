import {previewPhysicalCopySheet} from "./print-pdf.js";
import {namedTemplatePrintSettings,applyClientBorderPreference} from "./client-template-print.js";

// Affichage des gabarits pour un pictogramme : composants FR/EN sans accès réseau.
// Le pilote doit brancher les actions à src/picto-template-choices.js UNIQUEMENT
// après migration sur Supabase isolé + recette Auth, jamais sur la démo publique.
const escapeHtml=v=>String(v??"").replace(/[&<>"']/g,c=>({
  "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
}[c]));
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const formats={square:["Carré","Square"],portrait:["Rectangle haut","Tall rectangle"]};
const isBetween=(value,min,max)=>value!==null&&value!==undefined&&value!==""&&
  Number.isFinite(Number(value))&&Number(value)>=min&&Number(value)<=max;
function validTemplate(t){
 return t&&typeof t==="object"&&UUID.test(t.id||"")&&
  typeof t.name==="string"&&t.name.trim().length>0&&
  ["square","portrait"].includes(t.shape)&&
  isBetween(t.width_cm,2,10)&&
  isBetween(t.art_percent,30,95)&&
  isBetween(t.band_mm,6,30)&&isBetween(t.stroke_mm,0.4,4)&&
  isBetween(t.separator_mm,0.5,4)&&isBetween(t.font_pt,7,26)&&
  isBetween(t.rotation_deg,-180,180)&&
  ["upper_illustration_area","entire_inner_square_height"].includes(t.square_center_mode)&&
  /^#[A-Fa-f0-9]{6}$/.test(t.border_color)&&
  /^#[A-Fa-f0-9]{6}$/.test(t.font_color)&&
  typeof t.colored==="boolean";
}
function heading(t,fr){
 return escapeHtml(t.name)+" · "+escapeHtml(fr?formats[t.shape][0]:formats[t.shape][1])+
  " · "+Number(t.width_cm).toLocaleString(fr?"fr-CA":"en-CA")+" cm";
}
function ensureList(templates){
 if(!Array.isArray(templates)||templates.some(t=>!validTemplate(t))||
   new Set(templates.map(t=>t.id)).size!==templates.length)
   throw Error("Liste de gabarits invalide. Actualisez la fiche.");
}
function renderMiniPreview(t,{artworkUrl=null,pictoName=""}={}){
 // Le gabarit est enregistré pour une cellule de référence de 5 cm.
 // La largeur choisie redimensionne tous les millimètres de la même façon.
 // Ainsi, les proportions de la bande et des traits ne changent pas avec la taille.
 const heightRatio=t.shape==="portrait"?1.35:1;
 const bandPercent=(Number(t.band_mm)*2/heightRatio).toFixed(2);
 const artPercent=Number(t.art_percent);
 const lineWidth=(Number(t.stroke_mm)*2).toFixed(2);
 const separatorWidth=(Number(t.separator_mm)*2).toFixed(2);
 const fontSize=(Number(t.font_pt)*0.65).toFixed(2);
 const angle=Number(t.rotation_deg);
 const colored=t.colored?" is-colored":"";
 const shape=t.shape==="portrait"?" tall":"";
 const whole=t.shape==="square"&&t.square_center_mode==="entire_inner_square_height";
 const picture=artworkUrl?
   '<img src="'+escapeHtml(artworkUrl)+'" alt="" loading="lazy" style="transform:rotate('+angle+'deg)">' :
   '<span class="pa-template-no-art" aria-hidden="true">○</span>';
 return '<span class="pa-template-mini'+colored+shape+'" style="--template-edge:'+escapeHtml(t.border_color)+
   ';--template-ink:'+escapeHtml(t.font_color)+
   ';--template-band:'+bandPercent+'%;--template-art-scale:'+artPercent+
   '%;--template-stroke:'+lineWidth+'px;--template-separator:'+separatorWidth+
   'px;--template-font-size:'+fontSize+'px">'
   +'<span class="pa-template-mini-inner"><span class="pa-template-mini-art'+(whole?" is-whole":"")+'">'+picture+'</span>'
   +'<span class="pa-template-mini-label">'+escapeHtml(pictoName||t.name)+'</span></span></span>';
}
export function renderAdminPictoTemplatePicker({
  catalogId,templates=[],selected=[],confirmed=[],revision=0,
  confirmedRevision=0,dirty=false,busy=false,error="",message="",fr=true,
  artworkUrl=null,pictoName=""
}={}){
 if(!UUID.test(catalogId||""))throw Error("Pictogramme officiel requis.");
 ensureList(templates);
 if(!Array.isArray(selected)||!Array.isArray(confirmed)||
   selected.some(id=>!UUID.test(id))||confirmed.some(id=>!UUID.test(id)))
   throw Error("Sélection des gabarits invalide.");
 const selectedSet=new Set(selected);
 const confirmedSet=new Set(confirmed);
 if(selectedSet.size!==selected.length||confirmedSet.size!==confirmed.length)
   throw Error("Choix de gabarits en double.");
 const available=new Set(templates.filter(t=>t.is_published).map(t=>t.id));
 const unknown=selected.filter(id=>!available.has(id));
 const different=selected.length!==confirmed.length||
   selected.some(id=>!confirmedSet.has(id));
 const pending=dirty||different||revision>confirmedRevision;
 const disabled=busy||unknown.length>0;
 return '<section class="pa-admin-template-choices" aria-label="'+escapeHtml(fr?
   "Gabarits visibles sur la fiche client":"Templates visible on the customer details")+'">'
   +'<h3>'+escapeHtml(fr?"Gabarits visibles pour ce pictogramme":"Templates for this pictogram")+'</h3>'
   +'<p>'+escapeHtml(fr?
     "Cochez les modèles à proposer dans la fiche client. Enregistrez la sélection, puis confirmez pour la rendre visible.":"Choose which templates customers may see. Save the selection, then confirm visibility.")+'</p>'
   +(error?'<p role="alert">'+escapeHtml(error)+'</p>':"")
   +(message?'<p role="status">'+escapeHtml(message)+'</p>':"")
   +(unknown.length?'<div role="alert" class="pa-template-choice-recovery"><p>'+escapeHtml(fr?
      "Un ou plusieurs gabarits précédemment choisis ne sont plus publiés. Ils sont masqués ci-dessous, mais encore présents dans votre brouillon. Retirez-les pour continuer.":
      "Some previously selected templates are no longer published. They are hidden below but still saved in the draft. Remove them to continue.")+'</p>'
      +'<button type="button" data-action="picto-template-remove-unpublished"'+(busy?" disabled":"")+'>'+escapeHtml(fr?
      "Retirer les gabarits non publiés de ma sélection":"Remove unpublished templates from my selection")+'</button></div>':"")
   +'<div class="pa-template-choice-grid" role="group" aria-label="'+escapeHtml(fr?"Choisir les gabarits":"Choose templates")+'">'
   +templates.filter(t=>t.is_published).map(t=>'<label class="pa-template-choice">'
     +'<input type="checkbox" data-input="picto-template-toggle" value="'+escapeHtml(t.id)+'"'
     +(selectedSet.has(t.id)?" checked":"")+(busy?" disabled":"")+' />'
     +renderMiniPreview(t,{artworkUrl,pictoName})
     +'<span>'+heading(t,fr)+'</span>'
     +'<small>'+escapeHtml(fr?(confirmedSet.has(t.id)?"Visible actuellement":"Non confirmé"):
       (confirmedSet.has(t.id)?"Currently visible":"Unconfirmed"))+'</small></label>').join("")
   +'</div>'
   +'<p class="pa-template-choice-status" role="status">'+escapeHtml(pending?
      (fr?"Sélection non confirmée : les clients voient encore les anciens choix.":"Selection not confirmed: customers still see previous choices."):
      (fr?"Choix confirmés : aucune modification en attente.":"Confirmed selection: no pending changes."))+'</p>'
   +'<div class="pa-template-choice-actions">'
   +'<button type="button" data-action="picto-template-stage"'+(disabled?" disabled":"")+'>'+escapeHtml(fr?
      "Enregistrer la sélection":"Save selection")+'</button>'
   +'<button type="button" data-action="picto-template-confirm"'+(disabled||dirty||revision<1||!pending?" disabled":"")+'>'+escapeHtml(fr?
      "Confirmer la visibilité pour les clients":"Confirm customer visibility")+'</button>'
   +'</div>'
   +'<p class="pa-template-choice-help">'+escapeHtml(fr?
      "La confirmation vous demandera de valider le nombre de gabarits proposés. Zéro modèle retirera tous les anciens choix.":"You must confirm the number of templates shown. Confirming zero removes all previous choices.")+'</p>'
   +'</section>';
}
export function confirmationMessage({pictoName,selected=[],fr=true}={}){
 if(!Array.isArray(selected)||new Set(selected).size!==selected.length)
   throw Error("Choix invalides.");
 const name=String(pictoName||"").trim().slice(0,100);
 return fr?
  'Confirmer '+selected.length+' gabarit(s) visibles pour « '+name+' » ? Cette action remplacera les choix de la fiche client.':
  'Confirm '+selected.length+' visible template(s) for "'+name+'"? This replaces the choices on the customer detail.';
}
// Couleurs suggérées, plus le sélecteur natif pour une teinte personnalisée.
export const CLIENT_BORDER_PALETTE=Object.freeze([
 "#000000","#4775A9","#607A6F","#B34747","#D88A36","#8866AA","#E4B44E","#FFFFFF"
]);
export function renderClientPictoTemplateOptions({
 pictoName="",templates=[],fr=true,selectedId=null,artworkUrl=null,busy=false,
 borderEnabled=null,borderColor=null,paper="letter",copies=1
}={}){
 if(!["letter","a4"].includes(paper))throw Error("Format de papier invalide.");
 if(typeof copies!=="number"||!Number.isInteger(copies)||copies<1||copies>12)
   throw Error("Nombre d'exemplaires invalide (1 à 12).");
 ensureList(templates);
 if(templates.some(t=>t.is_published!==true))
   throw Error("Un gabarit non publié ne peut apparaître dans la fiche client.");
 if((borderEnabled!==null&&typeof borderEnabled!=="boolean")||
    (borderColor!==null&&!/^#[A-Fa-f0-9]{6}$/.test(borderColor)))
   throw Error("Contour client invalide.");
 const selected=templates.find(t=>t.id===selectedId);
 const colored=selected?(borderEnabled??selected.colored):false;
 const edge=selected?(borderColor??selected.border_color):"#000000";
 const headingText=fr?"Choisir mon gabarit":"Choose my template";
 // L'aperçu est un vrai calcul de géométrie, jamais une miniature PNG
 // inventée. Il tient compte du gabarit, du contour personnel et du papier.
 let layout=null;
 if(selected){
   try{
     const settings=applyClientBorderPreference(namedTemplatePrintSettings(selected),{
       colored,borderColor:edge
     });
     layout=previewPhysicalCopySheet({
       widthCm:settings.widthCm,preset:settings.preset,paper,copies
     });
   }catch{ /* Gabarit incohérent : le PDF reste désactivé ci-dessous. */ }
 }
 const number=n=>Number(n).toLocaleString(fr?"fr-CA":"en-CA",{maximumFractionDigits:2});
 const layoutPreview=!selected?"":layout?
   '<section class="pa-client-sheet-preview" role="status" aria-live="polite" aria-label="'+
     escapeHtml(fr?"Disposition des exemplaires":"Copy layout")+'">'+
     '<div class="pa-client-sheet-diagram" aria-hidden="true" style="--pa-copy-columns:'+layout.columns+
       ';--pa-copy-ratio:'+(selected.shape==="portrait"?"0.74074":"1")+'">'+
       Array.from({length:layout.firstPageCopies},()=>'<span></span>').join("")+'</div>'+
     '<div class="pa-client-sheet-summary"><strong>'+escapeHtml(fr?"Répartition automatique":"Automatic sheet layout")+'</strong>'+
     '<p>'+layout.columns+' '+escapeHtml(fr?(layout.columns===1?"colonne":"colonnes"):(layout.columns===1?"column":"columns"))+
       ' · '+layout.pages+' '+escapeHtml(fr?(layout.pages===1?"feuille":"feuilles"):(layout.pages===1?"sheet":"sheets"))+
       ' · '+copies+' '+escapeHtml(fr?(copies===1?"exemplaire":"exemplaires"):(copies===1?"copy":"copies"))+'</p>'+
     '<p>'+escapeHtml(fr?"Dimensions de chaque pictogramme : ":"Each pictogram measures: ")+
       number(layout.widthMm)+' × '+number(layout.heightMm)+' mm</p>'+
     '<small>'+escapeHtml(fr?"Schéma de placement seulement : le PNG et le rendu final sont préservés dans le PDF.":"Layout diagram only: the original PNG and final artwork are preserved in the PDF.")+'</small></div>'+
   '</section>':
   '<p role="alert" class="pa-template-print-error">'+escapeHtml(fr?
     "Calcul de disposition indisponible : actualisez la fiche. Aucun PDF ne sera créé.":
     "Layout calculation unavailable: refresh this item. No PDF will be created.")+'</p>';
 const swatches=CLIENT_BORDER_PALETTE.map(c=>
   '<button type="button" class="pa-client-border-swatch" data-action="client-template-border-swatch" data-color="'+c+
     '" aria-label="'+escapeHtml((fr?"Couleur du contour ":"Border color ")+c)+
     '" aria-pressed="'+String(edge.toLowerCase()===c.toLowerCase())+'" style="--pa-choice-swatch:'+c+'"'+
     (busy||!colored?" disabled":"")+'></button>').join("");
 const borderControls=selected?
   '<fieldset class="pa-client-border-controls"'+(busy?" disabled":"")+'>'+
     '<legend>'+escapeHtml(fr?"Personnaliser mon contour":"Customize my border")+'</legend>'+
     '<label class="pa-client-border-toggle"><input type="checkbox" data-input="client-template-border-enabled"'+
       (colored?" checked":"")+(busy?" disabled":"")+' />'+escapeHtml(fr?"Ajouter un contour coloré":"Add a colored border")+'</label>'+
     '<div class="pa-client-border-colors'+(!colored?" is-disabled":"")+'">'+
       '<span>'+escapeHtml(fr?"Couleur du contour":"Border color")+'</span>'+
       '<div class="pa-client-border-swatches" role="group" aria-label="'+escapeHtml(fr?"Couleurs suggérées":"Suggested colors")+'">'+swatches+'</div>'+
       '<label class="pa-client-border-custom">'+escapeHtml(fr?"Autre couleur":"Custom color")+
         '<input type="color" data-input="client-template-border-color" value="'+escapeHtml(edge)+'"'+
         (busy||!colored?" disabled":"")+' /></label>'+
     '</div>'+
     '<p class="pa-client-border-help">'+escapeHtml(fr?
       "Ce choix change seulement votre PDF. Le gabarit original reste identique.":
       "This changes only your PDF. The original template remains unchanged.")+'</p>'+
   '</fieldset>':"";
 return '<section class="pa-client-template-choices" aria-label="'+escapeHtml(headingText)+'">'+
   '<h3>'+escapeHtml(headingText)+'</h3><p>'+escapeHtml(pictoName)+'</p>'+
   (!templates.length?'<p role="status">'+escapeHtml(fr?
     "Aucun gabarit proposé pour ce pictogramme.":"No template offered for this pictogram.")+'</p>':
     '<div class="pa-template-choice-grid" role="radiogroup" aria-label="'+escapeHtml(headingText)+'">'+
     templates.map(t=>{
       const preview=selectedId===t.id?{...t,colored,border_color:edge}:t;
       return '<label class="pa-template-choice"><input type="radio" name="picto-client-template" '+
         'data-input="client-template-select" value="'+escapeHtml(t.id)+'"'+
         (selectedId===t.id?" checked":"")+(busy?" disabled":"")+' />'+
         renderMiniPreview(preview,{artworkUrl,pictoName})+
         '<span>'+heading(t,fr)+'</span>'+
         '<small>'+escapeHtml(t.colored?(fr?"Contour prévu par le gabarit":"Template border"):
           (fr?"Sans contour initial":"No default border"))+'</small></label>';
     }).join("")+'</div>')+
   borderControls+
   (templates.length?'<div class="pa-template-print-controls">'+
     '<label for="pa-client-template-copies">'+escapeHtml(fr?"Nombre d’exemplaires":"Number of copies")+'</label>'+
     '<select id="pa-client-template-copies" data-input="client-template-copies"'+(busy?' disabled':'')+' aria-describedby="pa-client-copies-help">'+
       Array.from({length:12},(_,index)=>index+1).map(n=>'<option value="'+n+'"'+(copies===n?' selected':'')+'>'+n+'</option>').join("")+
     '</select>'+
     '<p id="pa-client-copies-help" class="pa-template-print-note">'+escapeHtml(fr?
       "Les exemplaires sont répartis automatiquement sur le papier sans réduire leur taille ni perdre leur contour. Plusieurs pages peuvent être nécessaires.":
       "Copies are arranged automatically on the sheet without shrinking them or losing their borders. Several pages may be needed.")+'</p>'+
     '<label for="pa-client-template-paper">'+escapeHtml(fr?"Format du papier":"Paper size")+'</label>'+
     '<select id="pa-client-template-paper" data-input="client-template-paper"'+
       (busy?" disabled":"")+'>'+
       '<option value="letter"'+(paper==="letter"?" selected":"")+'>'+
         escapeHtml(fr?"Lettre (8,5 × 11 po)":"Letter (8.5 × 11 in)")+'</option>'+
       '<option value="a4"'+(paper==="a4"?" selected":"")+'>A4 (210 × 297 mm)</option>'+
     '</select>'+
     '<p class="pa-template-print-note">'+escapeHtml(fr?
       "Le format du papier ne change pas les dimensions réelles du pictogramme.":
       "Paper size does not change the pictogram’s actual dimensions.")+'</p>'+
     layoutPreview+
     '<button type="button" class="btn btn-primary" data-action="client-template-print"'+
       (!selectedId||busy||!layout?" disabled":"")+'>'+escapeHtml(fr?
         (busy?"Préparation du PDF…":"Créer le PDF de ce pictogramme"):
         (busy?"Preparing PDF…":"Create this pictogram PDF"))+'</button>'+
     '</div>':"")+
   '</section>';
}
