const OFFICIAL_LIMITS=Object.freeze({routine:10,board:16});
export function selectApprovedItem(items,row,kind){
  const max=OFFICIAL_LIMITS[kind];
  if(!max||!Array.isArray(items)||items.length>=max||
    !row||typeof row.id!=="string"||!/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(row.id)||
    typeof row.title_fr!=="string"||!row.title_fr.trim()||
    typeof row.image_path!=="string"||row.image_path!=="items/"+row.id+".png")
    throw Error("Sélection de pictogramme invalide ou complète.");
  return [...items,{id:row.id,title_fr:row.title_fr,title_en:row.title_en||null,theme:row.theme,image_path:row.image_path}];
}
// Libellé personnalisé par case; l'illustration approuvée et son titre officiel restent inchangés.
export function setApprovedItemLabel(items,index,value){
  if(!Array.isArray(items)||!Number.isInteger(index)||index<0||index>=items.length)
    throw Error("Case de pictogramme invalide.");
  if(typeof value!=="string"||value.length>48||/[\p{C}]/u.test(value))
    throw Error("Le texte doit contenir au plus 48 caractères, sans caractères de contrôle.");
  const label=value.replace(/\s+/g," ").trim();
  return items.map((item,i)=>i===index?{...item,customLabel:label||null}:item);
}
export function approvedItemCaption(item,language="fr"){
  return item.customLabel||(language==="en"?(item.title_en||item.title_fr):item.title_fr);
}
export function changeApprovedOrder(items,index,direction){
  if(!Array.isArray(items)||!Number.isInteger(index)||![-1,1].includes(direction)||index<0||
    index>=items.length||index+direction<0||index+direction>=items.length)return [...items];
  const next=[...items];
  [next[index],next[index+direction]]=[next[index+direction],next[index]];
  return next;
}
export function removeApprovedItem(items,index){
  if(!Array.isArray(items)||!Number.isInteger(index)||index<0||index>=items.length)return [...items];
  return items.filter((_,i)=>i!==index);
}
export function canPrepareApproved({kind,items,widthCm,paper,columns=3}){
  if(!OFFICIAL_LIMITS[kind]||!Array.isArray(items)||items.length>(OFFICIAL_LIMITS[kind])||
    items.length<(kind==="routine"?2:1)||!["letter","a4"].includes(paper)||
    !Number.isFinite(widthCm)||widthCm<2||widthCm>10||
    (kind==="board"&&![2,3,4].includes(columns)))return false;
  const maxWidth=paper==="a4"?190:195.9; // largeur papier - 20 mm de marges
  const n=kind==="routine"?items.length:columns;
  const gaps=kind==="routine"?(n-1)*1.2+2*1.2:(n-1)*2;
  return n*widthCm*10+gaps<=maxWidth+1e-6;
}

export function renderOfficialComposer({kind,items,language="fr",imageUrls=new Map(),settings={},busy=false,error="",pending="",draftBusy=false,draftDirty=false,draftSaved=false,draftStatus="",allowCaptionEdit=false,escape:e,icon}){
 const fr=language==="fr",routine=kind==="routine";
 const label=(a,b)=>fr?a:b;
 const defaultName=label(routine?"Ma routine":"Mon tableau",routine?"My routine":"My board");
 const name=typeof settings.title==="string"?settings.title:defaultName;
 const width=typeof settings.widthCm==="string"?settings.widthCm:(routine?"3":"5");
 const paper=settings.paper==="a4"?"a4":"letter";
 const columns=["2","3","4"].includes(settings.columns)?settings.columns:"3";
 const content=items.map((item,i)=>{
  const title=allowCaptionEdit?approvedItemCaption(item,language):
    (language==="en"?(item.title_en||item.title_fr):item.title_fr),src=imageUrls.get(item.id);
  return '<li class="pa-composer-item"><div class="pa-catalog-art"><div class="pa-catalog-art-body">'
   +'<img data-catalog-id="'+e(item.id)+'"'+(src?' src="'+e(src)+'"':'')+' alt="" loading="lazy"></div>'
   +'<div class="pa-catalog-art-caption">'+e(title)+'</div></div>'
   +'<span class="pa-composer-item-name">'+e(title)+'</span>'
   +(allowCaptionEdit?'<div class="pa-composer-label-edit"><label for="official-caption-'+kind+'-'+i+'">'
   +e(label("Texte du pictogramme","Pictogram caption"))+'</label>'
   +'<input id="official-caption-'+kind+'-'+i+'" type="text" data-input="official-caption"'
   +' data-kind="'+kind+'" data-index="'+i+'" maxlength="48" aria-describedby="official-caption-help"'
   +' value="'+e(item.customLabel||title)+'"'+(busy?' disabled':'')+'></div>':'')
   +'<div class="pa-composer-item-actions">'
   +'<button type="button" data-action="approved-move" data-kind="'+kind+'" data-index="'+i+'" data-direction="-1"'
   +(!i?' disabled':'')+' aria-label="'+e(label("Vers la gauche","Move left"))+'">'+icon("up")+'</button>'
   +'<button type="button" data-action="approved-move" data-kind="'+kind+'" data-index="'+i+'" data-direction="1"'
   +(i===items.length-1?' disabled':'')+' aria-label="'+e(label("Vers la droite","Move right"))+'">'+icon("arrow")+'</button>'
   +'<button type="button" data-action="approved-remove" data-kind="'+kind+'" data-index="'+i+'" aria-label="'+e(label("Retirer ","Remove ")+title)+'">'+icon("trash")+'</button></div></li>';
 }).join("");
 return '<section class="pa-client-catalog pa-composer" aria-labelledby="pa-composer-title">'
  +'<span class="pa-client-overline">'+e(label("CRÉATION OFFICIELLE","APPROVED CREATION"))+'</span>'
  +'<h1 id="pa-composer-title">'+e(label(routine?"Créer une routine":"Créer un tableau de communication",routine?"Create a routine":"Create a communication board"))+'</h1>'
  +'<p class="pa-client-context">'+e(label("Seuls les pictogrammes publiés peuvent être utilisés. Le PDF original est sauvegardé dans Mes créations.","Only published pictograms can be used. The original PDF is saved in My creations."))+'</p>'
  +'<div class="pa-composer-toolbar"><strong>'+items.length+' / '+(routine?10:16)+'</strong>'
  +'<button type="button" data-action="nav" data-page="library">'+icon("plus")+e(label("Ajouter des pictogrammes","Add pictograms"))+'</button></div>'
  +(items.length?'<p '+(allowCaptionEdit?'id="official-caption-help"':'')+' class="pa-client-context">'
    +e(allowCaptionEdit?
      label("Modifiez le texte au besoin; effacez-le pour retrouver le libellé officiel.","Edit a caption if needed; clear it to restore the original label."):
      label("Modification du texte désactivée par le Super Admin. Les anciens textes restent dans vos brouillons.","Text editing is disabled by the Super Admin. Older captions remain saved in your drafts."))+
    '</p><ol class="pa-composer-items">'+content+'</ol>':
    '<p class="pa-catalog-notice">'+e(label("Aucune image choisie. Ouvrez la bibliothèque pour commencer.","No images selected. Open the library to start."))+'</p>')
  +pending
  +(error?'<p role="alert" class="pa-catalog-notice">'+e(error)+'</p>':'')
  +'<div class="pa-composer-draft-actions"><button type="button" class="btn btn-light" data-action="draft-save" data-kind="'+kind+'"'
  +(busy||draftBusy?' disabled':'')+'>'+icon("save","btn-icon")+e(label(draftBusy?"Enregistrement…":"Enregistrer le brouillon",draftBusy?"Saving…":"Save editable draft"))+'</button>'
  +'<button type="button" class="btn btn-light" data-action="nav" data-page="create">'+e(label("Retrouver mes brouillons","My saved drafts"))+'</button>'
  +'<span role="status" aria-live="polite" class="pa-composer-draft-status">'+e(draftStatus||label(
    draftBusy?"Sauvegarde en cours":draftDirty?"Modifications non enregistrées":draftSaved?"Brouillon enregistré dans votre compte":"Pas encore enregistré",
    draftBusy?"Saving":draftDirty?"Unsaved changes":draftSaved?"Draft saved in your account":"Not saved yet"
  ))+'</span></div>'
  +'<p class="pa-client-context pa-autosave-explainer">'+e(label("Sauvegarde automatique privée après une pause de saisie. Attendez la confirmation avant de fermer la page; si le réseau échoue, utilisez « Enregistrer le brouillon ».","Private autosave after you stop editing. Wait for confirmation before closing the page; if the network fails, use Save editable draft."))+'</p>'
  +'<form data-form="approved-export" data-kind="'+kind+'" class="pa-composer-form">'
  +'<div class="control"><label for="official-name">'+e(label("Nom du document","Document name"))+'</label><input id="official-name" name="title" value="'+e(name)+'" maxlength="120" required></div>'
  +'<div class="control"><label for="official-width">'+e(label("Largeur des cases en cm","Cell width in cm"))+'</label><input id="official-width" name="widthCm" type="number" min="2" max="10" step="0.5" value="'+e(width)+'" required></div>'
  +'<div class="control"><label for="official-paper">'+e(label("Format papier","Paper"))+'</label><select id="official-paper" name="paper"><option value="letter"'+(paper==="letter"?" selected":"")+'>'+e(label("Lettre","Letter"))+'</option><option value="a4"'+(paper==="a4"?" selected":"")+'>A4</option></select></div>'
  +(routine?'':'<div class="control"><label for="official-columns">'+e(label("Colonnes","Columns"))+'</label><select id="official-columns" name="columns"><option value="2"'+(columns==="2"?" selected":"")+'>2</option><option value="3"'+(columns==="3"?" selected":"")+'>3</option><option value="4"'+(columns==="4"?" selected":"")+'>4</option></select></div>')
  +'<button type="submit" class="btn btn-primary"'+(items.length<(routine?2:1)||busy||draftBusy||Boolean(pending)?' disabled':'')+'>'+icon("save","btn-icon")
  +e(label(busy?"Création et archivage…":"Créer et archiver le PDF",busy?"Creating and archiving…":"Create and archive PDF"))+'</button></form>'
  +'<p class="pa-client-context">'+e(label("Vérifiez les dimensions réelles sur papier avant utilisation.","Check actual printed dimensions before use."))+'</p></section>';
}
