// Affichage des gabarits pour un pictogramme : composants FR/EN sans accès réseau.
// Le pilote doit brancher les actions à src/picto-template-choices.js UNIQUEMENT
// après migration sur Supabase isolé + recette Auth, jamais sur la démo publique.
const escapeHtml=v=>String(v??"").replace(/[&<>"']/g,c=>({
  "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
}[c]));
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const formats={square:["Carré","Square"],portrait:["Rectangle haut","Tall rectangle"]};
function validTemplate(t){
 return t&&typeof t==="object"&&UUID.test(t.id||"")&&
  typeof t.name==="string"&&t.name.trim().length>0&&
  ["square","portrait"].includes(t.shape)&&
  Number.isFinite(Number(t.width_cm))&&Number(t.width_cm)>=2&&
  Number(t.width_cm)<=10&&/^#[A-Fa-f0-9]{6}$/.test(t.border_color)&&
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
 const rotation=Number(t.rotation_deg);
 const angle=Number.isFinite(rotation)&&Math.abs(rotation)<=180?rotation:0;
 const colored=t.colored?" is-colored":"";
 const color=escapeHtml(t.border_color);
 const shape=t.shape==="portrait"?" tall":"";
 const picture=artworkUrl?
   '<img src="'+escapeHtml(artworkUrl)+'" alt="" loading="lazy" style="transform:rotate('+angle+'deg)">' :
   '<span class="pa-template-no-art" aria-hidden="true">○</span>';
 return '<span class="pa-template-mini'+colored+shape+'" style="--template-edge:'+color+'">'
   +'<span class="pa-template-mini-inner"><span class="pa-template-mini-art">'+picture+'</span>'
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
export function renderClientPictoTemplateOptions({
 pictoName="",templates=[],fr=true,selectedId=null,artworkUrl=null
}={}){
 ensureList(templates);
 if(templates.some(t=>t.is_published!==true))
   throw Error("Un gabarit non publié ne peut apparaître dans la fiche client.");
 const headingText=fr?"Choisir mon gabarit":"Choose my template";
 return '<section class="pa-client-template-choices" aria-label="'+escapeHtml(headingText)+'">'
  +'<h3>'+escapeHtml(headingText)+'</h3>'
  +'<p>'+escapeHtml(pictoName)+'</p>'
  +(!templates.length?'<p role="status">'+escapeHtml(fr?
     "Aucun gabarit proposé pour ce pictogramme.":"No template offered for this pictogram.")+'</p>':
     '<div class="pa-template-choice-grid" role="radiogroup" aria-label="'+escapeHtml(headingText)+'">'
     +templates.map(t=>'<label class="pa-template-choice"><input type="radio" name="picto-client-template" '
       +'data-input="client-template-select" value="'+escapeHtml(t.id)+'"'
       +(selectedId===t.id?" checked":"")+' />'
       +renderMiniPreview(t,{artworkUrl,pictoName})
       +'<span>'+heading(t,fr)+'</span>'
       +'<small>'+escapeHtml(t.colored?(fr?"Avec contour coloré":"Colored border"):
          (fr?"Sans contour coloré":"No colored border"))+'</small></label>').join("")+'</div>')
   +'</section>';
}
