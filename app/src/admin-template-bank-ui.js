// Bank of named versioned pictogram templates, ready for explicit Super Admin
// activation only after the isolated Supabase migration and Auth review.
const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({
 "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
}[c]));
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
// Aperçu local uniquement : refuser les valeurs qui seraient arrondies par SQL
// (NUMERIC à deux décimales) plutôt que d'afficher une taille trompeuse.
export function namedTemplatePreviewState({widthCm=5,rotationDeg=0,enabled=false}={}){
 if(!enabled)return {valid:true,widthCm:5,rotationDeg:0};
 const parse=(v,min,max)=>{
   if(typeof v!=="number"&&typeof v!=="string")return null;
   if(typeof v==="string"&&!v.trim())return null;
   const n=Number(v);
   return Number.isFinite(n)&&n>=min&&n<=max&&
     Math.abs(n*100-Math.round(n*100))<1e-8?n:null;
 };
 const width=parse(widthCm,2,10),angle=parse(rotationDeg,-180,180);
 return {valid:width!==null&&angle!==null,widthCm:width,rotationDeg:angle};
}
export function namedTemplatePreviewCaption({widthCm=5,rotationDeg=0,enabled=false,fr=true}={}){
 if(!enabled)return fr?
   "Illustration d’exemple · 5 cm · réglages locaux":
   "Sample illustration · 5 cm · local settings";
 const settings=namedTemplatePreviewState({widthCm,rotationDeg,enabled});
 if(!settings.valid)return fr?
   "Aperçu indisponible : largeur ou rotation invalide (maximum deux décimales).":
   "Preview unavailable: invalid width or rotation (maximum two decimals).";
 const fmt=n=>n.toLocaleString(fr?"fr-CA":"en-CA",{maximumFractionDigits:2});
 return fr?
   "Illustration d’exemple · "+fmt(settings.widthCm)+" cm · rotation "+fmt(settings.rotationDeg)+"° · aperçu indicatif":
   "Sample illustration · "+fmt(settings.widthCm)+" cm · rotation "+fmt(settings.rotationDeg)+"° · illustrative preview";
}

// Une mise à jour de gabarit publié est visible dès la sauvegarde dans
// toutes les fiches clientes qui y sont associées. Pas de confirmation pour
// les brouillons, mais un accord EXPLICITE avant toute édition publiée.
export function confirmPublishedNamedTemplateEdit(template,fr=true,confirmAction=null){
 if(!template?.is_published)return true;
 if(typeof confirmAction!=="function")throw Error("Confirmation explicite requise.");
 const message=fr?
   "Ce gabarit est déjà publié. Enregistrer ses modifications changera immédiatement le modèle proposé aux clients qui l’utilisent. Les PDF déjà archivés restent inchangés. Pour préparer une variante privée, utilisez Dupliquer. Confirmer la mise à jour publiée ?":
   "This template is already published. Saving changes will immediately update the template offered to customers using it. Previously archived PDFs remain unchanged. To prepare a private variant, use Duplicate. Confirm this live update?";
 return confirmAction(message)===true;
}

export function renderAdminNamedTemplateBank({
 templates=[],selectedId=null,name="",widthCm=5,rotationDeg=0,
 busy=false,loading=false,error="",message="",fr=true
}={}){
 if(!Array.isArray(templates)||new Set(templates.map(x=>x.id)).size!==templates.length||
    templates.some(x=>!x||!UUID.test(x.id||"")||typeof x.name!=="string"||
      !Number.isSafeInteger(x.revision)||x.revision<1||
      typeof x.is_published!=="boolean"))
   throw Error("Réponse des gabarits nommés incohérente.");
 if(selectedId!==null&&!templates.some(x=>x.id===selectedId))
   throw Error("Le gabarit à modifier n'existe plus.");
 const active=templates.find(x=>x.id===selectedId);
 const tr=(fr?
  ["Mes gabarits enregistrés","Nouveau gabarit","Nom du gabarit","Largeur (cm)",
   "Rotation (degrés)","Enregistrer en brouillon","Enregistrer les modifications",
   "Publier","Retirer du client","Publié","Brouillon",
   "Les nouveaux gabarits restent privés jusqu'à leur publication.",
   "Aucun gabarit enregistré."]:
  ["Saved templates","New template","Template name","Width (cm)",
   "Rotation (degrees)","Save as draft","Save changes","Publish","Hide from clients",
   "Published","Draft","New templates stay private until published.",
   "No saved templates."]);
 return '<section class="admin-named-templates" aria-label="'+esc(tr[0])+'">'
  +'<h2>'+esc(tr[0])+'</h2>'
  +(loading?'<p role="status">'+esc(fr?"Chargement des gabarits…":"Loading templates…")+'</p>':"")
  +(error?'<p role="alert">'+esc(error)+'</p><button type="button" class="admin-named-template-retry" data-action="admin-named-template-refresh"'+(loading?' disabled':'')+'>'+esc(fr?"Réessayer le chargement":"Retry loading")+'</button>':"")
  +(message?'<p role="status">'+esc(message)+'</p>':"")
  +(!loading&&!busy&&!error&&!templates.length&&selectedId===null&&!name?
    '<div class="admin-named-template-first" role="group" aria-label="'+esc(fr?"Créer mon premier gabarit":"Create my first template")+'">'+
    '<strong>'+esc(fr?"Aucun gabarit encore enregistré":"No templates saved yet")+'</strong>'+
    '<p>'+esc(fr?"Choisissez une forme pour préparer votre premier modèle. Vous pourrez ajuster les dimensions et l’image avant de cliquer sur Enregistrer; rien n’est publié automatiquement.":"Choose a shape to prepare your first template. Adjust its dimensions and artwork before saving; nothing is published automatically.")+'</p>'+
    '<div class="admin-named-template-first-actions">'+
    '<button type="button" data-action="admin-named-template-starter" data-shape="square">'+esc(fr?"Préparer un carré":"Prepare a square")+'</button>'+
    '<button type="button" data-action="admin-named-template-starter" data-shape="portrait">'+esc(fr?"Préparer un rectangle haut":"Prepare a tall rectangle")+'</button></div></div>':"")
  +'<div class="admin-named-template-fields">'
  +'<div><label for="pa-named-template-name">'+esc(tr[2])+'</label>'
  +'<input id="pa-named-template-name" type="text" maxlength="80" data-input="admin-named-template-name" '
  +'value="'+esc(name)+'" autocomplete="off"'+(busy?" disabled":"")+'></div>'
  +'<div><label for="pa-named-template-width">'+esc(tr[3])+'</label>'
  +'<input id="pa-named-template-width" type="number" min="2" max="10" step=".01" data-input="admin-named-template-width" '
  +'value="'+esc(widthCm)+'"'+(busy?" disabled":"")+'></div>'
  +'<div><label for="pa-named-template-rotation">'+esc(tr[4])+'</label>'
  +'<input id="pa-named-template-rotation" type="number" min="-180" max="180" step=".01" data-input="admin-named-template-rotation" '
  +'value="'+esc(rotationDeg)+'"'+(busy?" disabled":"")+'></div>'
  +'</div>'
  +'<p class="admin-named-template-help">'+esc(tr[11])+'</p>'
  +(active?.is_published?
    '<p class="admin-named-template-live-warning" role="note">'+esc(fr?
      "Ce gabarit est publié. Modifier ses réglages changera immédiatement les nouveaux rendus clients qui l’utilisent. Pour travailler sans effet sur le modèle actuel, choisissez Dupliquer.":
      "This template is published. Editing its settings immediately changes new customer output using it. Choose Duplicate to work without affecting the live template.")+'</p>':"")
  +'<div class="admin-named-template-actions">'
  +'<button type="button" data-action="admin-named-template-new"'+(busy?" disabled":"")+'>'+esc(tr[1])+'</button>'
  +'<button type="button" data-action="admin-named-template-save"'+(busy||loading?" disabled":"")+'>'+esc(active?.is_published?
    (fr?"Mettre à jour le gabarit publié":"Update published template"):
    (active?tr[6]:tr[5]))+'</button></div>'
  +(!templates.length?'<p role="status">'+esc(tr[12])+'</p>':
   '<ul class="admin-named-template-list">'+templates.map(t=>
     '<li><button type="button" data-action="admin-named-template-load" data-id="'+esc(t.id)+'" '
       +(busy?"disabled ":"")+'aria-pressed="'+String(selectedId===t.id)+'">'
       +esc(t.name)+' · v'+t.revision+'</button>'
       +'<span>'+esc(t.is_published?tr[9]:tr[10])+'</span>'
       +'<button type="button" data-action="admin-named-template-duplicate" data-id="'+esc(t.id)+'"'
       +' aria-label="'+esc((fr?"Dupliquer le gabarit ":"Duplicate template ")+t.name)+'"'
       +(busy||loading||templates.length>=100?" disabled":"")+'>'+esc(fr?"Dupliquer":"Duplicate")+'</button>'
       +'<button type="button" data-action="admin-named-template-publish" data-id="'+esc(t.id)+'" '
       +'data-revision="'+t.revision+'" data-publish="'+String(!t.is_published)+'"'
       +(busy?" disabled":"")+'>'+esc(t.is_published?tr[8]:tr[7])+'</button></li>'
   ).join("")+'</ul>')
  +'</section>';
}


/**
 * Action suivante après publication d'un modèle : récupérer les vrais
 * pictogrammes déjà publiés. Aucune fiche fictive, aucun changement de droits.
 */
export function renderNamedTemplateHandoff({
 templates=[],choicesReady=false,loading=false,busy=false,fr=true
}={}){
 if(!Array.isArray(templates)||templates.some(t=>!t||typeof t.is_published!=="boolean"))
   throw Error("État des gabarits non vérifié.");
 if(loading)return "";
 const published=templates.filter(t=>t.is_published).length;
 if(!published)return '<section class="pa-template-next" aria-label="'+esc(fr?"Étape suivante":"Next step")+'">'+
   '<h3>'+esc(fr?"Ensuite : rendre un gabarit disponible":"Next: make a template available")+'</h3>'+
   '<p>'+esc(fr?
     "Enregistrez d’abord votre gabarit, puis utilisez Publier. Les clients ne verront aucun gabarit avant que vous le confirmiez aussi sur une fiche de pictogramme publiée.":
     "Save your template first, then publish it. Customers will not see it until you also confirm it on a published pictogram.")+'</p></section>';
 return '<section class="pa-template-next" aria-label="'+esc(fr?"Étape suivante":"Next step")+'">'+
   '<h3>'+esc(fr?"Associer vos gabarits aux pictogrammes":"Assign templates to pictograms")+'</h3>'+
   '<p>'+esc(fr?
     "Vos gabarits publiés ne sont pas encore associés automatiquement aux images. Ouvrez les pictogrammes publiés, choisissez les modèles à montrer, enregistrez puis confirmez la sélection.":
     "Published templates are not automatically linked to images. Open published pictograms, choose the templates to offer, save and confirm the selection.")+'</p>'+
   (choicesReady?
     '<button type="button" class="btn btn-primary" data-action="admin-template-go-published"'+(busy?' disabled':'')+'>'+
       esc(fr?"Choisir les pictogrammes publiés":"Choose published pictograms")+'</button>':
     '<p role="status">'+esc(fr?
       "L’association aux fiches clientes n’est pas encore vérifiée sur ce serveur. Aucun gabarit n’est activé automatiquement.":
       "Customer template assignment is not verified on this server. Nothing is automatically activated.")+'</p>')+
   '</section>';
}
