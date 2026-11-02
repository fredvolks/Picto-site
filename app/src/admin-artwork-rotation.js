import {validatePreset} from "./core.js";
// Rotation LOCALE d'un PNG privé découpé sur l'encre sombre.
// Produit un NOUVEAU fichier pour le circuit d'import Super Admin existant.
// Le brouillon original, ses droits et les gabarits ne sont jamais modifiés.
const MAX_PNG_BYTES=6*1024*1024;
export function validateArtworkRotation(value){
  if(typeof value!=="number"||!Number.isInteger(value)||value< -180||value>180)
    throw new Error("Rotation du dessin invalide (-180 à 180 degrés entiers).");
  return value;
}
export function rotatedInkCanvasGeometry(width,height,angle){
  validateArtworkRotation(angle);
  if(!Number.isSafeInteger(width)||!Number.isSafeInteger(height)||
     width<1||height<1||width>1200||height>1200)
    throw new Error("Dimensions du dessin privé invalides.");
  const rad=angle*Math.PI/180;
  const c=Math.abs(Math.cos(rad)),s=Math.abs(Math.sin(rad));
  // Deux pixels de marge par côté protègent les contours antialiasés.
  const w=Math.ceil(width*c+height*s)+4;
  const h=Math.ceil(width*s+height*c)+4;
  if(w>1800||h>1800||w*h>3_240_000)
    throw new Error("Le dessin tourné dépasse la taille sûre.");
  return{width:w,height:h,radians:rad};
}
function cleanFilename(title,angle){
  const base=String(title||"picto").normalize("NFD").replace(/[\u0300-\u036f]/g,"")
    .toLowerCase().replace(/[^a-z0-9-]+/g,"-").replace(/^-+|-+$/g,"").slice(0,60)||"picto";
  return angle===0?base+"-recadre.png":base+"-rotation-"+String(angle).replace("-","moins-")+".png";
}
export async function makeRotatedPrivatePng(inkBlob,angle,title="picto"){
  validateArtworkRotation(angle);
  if(!(inkBlob instanceof Blob)||inkBlob.type!=="image/png"||
     inkBlob.size<8||inkBlob.size>MAX_PNG_BYTES)
    throw new Error("L'aperçu PNG privé est indisponible.");
  if(typeof createImageBitmap!=="function"||typeof document==="undefined"||
     typeof File!=="function")
    throw new Error("Ce navigateur ne peut pas préparer le nouveau brouillon PNG.");
  const bitmap=await createImageBitmap(inkBlob);
  try{
    const {width,height,radians}=rotatedInkCanvasGeometry(bitmap.width,bitmap.height,angle);
    const canvas=document.createElement("canvas");
    canvas.width=width;canvas.height=height;
    const ctx=canvas.getContext("2d");
    if(!ctx)throw new Error("Composition PNG indisponible.");
    ctx.clearRect(0,0,width,height);
    ctx.translate(width/2,height/2);
    ctx.rotate(radians);
    ctx.drawImage(bitmap,-bitmap.width/2,-bitmap.height/2);
    const output=await new Promise((resolve,reject)=>canvas.toBlob(
      file=>file?resolve(file):reject(new Error("Export de l'image ajustée indisponible.")),
      "image/png"
    ));
    if(output.type!=="image/png"||output.size<8||output.size>MAX_PNG_BYTES)
      throw new Error("Le PNG ajusté dépasse 6 Mo ou est invalide.");
    return new File([output],cleanFilename(title,angle),{type:"image/png"});
  }finally{
    bitmap.close?.();
  }
}


// Comparaison LOCALE du même vrai dessin, sans requête réseau, sans créer
// de gabarit ni retoucher l'original. Les choix de publication restent séparés.
export function privateInkPreviewVariants(preset){
 if(!preset||!validatePreset(preset)||typeof preset.colored!=="boolean")
   throw Error("Réglages d'aperçu privé invalides.");
 return [
  {key:"square-color",shape:"square",colored:true,widthCm:5,preset:{...preset,shape:"square",colored:true}},
  {key:"square-plain",shape:"square",colored:false,widthCm:5,preset:{...preset,shape:"square",colored:false}},
  {key:"portrait-color",shape:"portrait",colored:true,widthCm:5,preset:{...preset,shape:"portrait",colored:true}}
 ];
}
// Géométrie de l'aperçu identique au PDF : hors limites, on n'imprime pas.
export function fineTunedPrivatePreset(preset,artScalePercent=100){
 if(!preset||!validatePreset(preset)||
    !Number.isInteger(artScalePercent)||artScalePercent<60||
    artScalePercent>140||(artScalePercent-60)%5!==0)
   throw Error("Réglage individuel d'aperçu invalide.");
 const artPercent=Math.round(preset.artPercent*artScalePercent)/100;
 return artPercent>=30&&artPercent<=95?{...preset,artPercent}:null;
}
const escapePreview=value=>String(value??"").replace(/[&<>"']/g,c=>({
 "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
}[c]));
export function renderPrivateInkComparison({
 asset,inkUrl,rotationDeg=0,preset,fr=true,customPicto,scaleMetrics,fmtRaw,artScalePercent=100
}={}){
 validateArtworkRotation(rotationDeg);
 if(!asset||typeof asset.title_fr!=="string"||!asset.title_fr.trim()||
    typeof inkUrl!=="string"||!inkUrl.startsWith("blob:")||
    typeof customPicto!=="function"||typeof scaleMetrics!=="function"||
    typeof fmtRaw!=="function")
   throw Error("Aperçu du PNG privé indisponible.");
 const art='<img data-pictau-ink data-admin-ink-preview src="'+escapePreview(inkUrl)+
   '" alt="" loading="eager" decoding="async" style="transform:rotate('+
   rotationDeg+'deg);transform-origin:center">';
 const picture={fr:asset.title_fr,en:asset.title_en||asset.title_fr,image:art};
 const variants=privateInkPreviewVariants(preset);
 const names=fr?
  ["Carré · contour coloré","Carré · sans contour coloré","Portrait · contour coloré"]:
  ["Square · colored border","Square · no colored border","Portrait · colored border"];
 return '<div class="admin-png-variant-grid" role="group" aria-label="'+
   escapePreview(fr?"Comparaison de trois formats sur le dessin réel":"Three-format comparison of the actual artwork")+'">'+
   variants.map((v,index)=>{
    const adjusted=fineTunedPrivatePreset(v.preset,artScalePercent);
    const measures=scaleMetrics(v.preset,v.widthCm);
    const width=escapePreview(fmtRaw(v.widthCm));
    const height=escapePreview(fmtRaw(measures.heightCm));
    return '<figure class="admin-png-variant" data-private-preview="'+v.key+'">'+
      '<figcaption>'+escapePreview(names[index])+'</figcaption>'+
      '<div class="admin-png-stage"><div class="color-shell'+
      (v.colored?"":" no-color")+'" style="--bordercolor:'+escapePreview(v.preset.color)+
      ';--colorwidth:2mm"><div class="admin-png-cell" style="width:'+width+
      'cm;height:'+height+'cm">'+(adjusted?customPicto(picture,adjusted,v.widthCm,false):
       '<p role="status">'+escapePreview(fr?"Taille à vérifier pour ce modèle.":"Size needs review for this template.")+'</p>')+
      '</div></div></div></figure>';
   }).join("")+'</div>';
}


// Le recadrage sans rotation est une opération métier à part entière.
// L'étiquette est explicite, et la fiche source ne change jamais.
export function privateInkDraftMetadata(asset,angle){
 validateArtworkRotation(angle);
 if(!asset||typeof asset.title_fr!=="string"||!asset.title_fr.trim())
   throw Error("Fiche privée à recadrer invalide.");
 const cropped=angle===0;
 return {
  titleFr:asset.title_fr.slice(0,75)+(cropped?" (recadré)":" (rotation "+angle+"°)"),
  titleEn:typeof asset.title_en==="string"&&asset.title_en.trim()?
    asset.title_en.slice(0,75)+(cropped?" (cropped)":" (rotated "+angle+"°)"):"",
  theme:asset.theme
 };
}

// Galerie en LECTURE SEULE : chaque modèle réellement enregistré s'applique
// au même PNG rogné en mémoire. Aucun état de publication ni PNG ne change.
export function renderPrivateInkNamedGallery({
 asset,inkUrl,rotationDeg=0,templates=[],fr=true,customPicto,scaleMetrics,fmtRaw,artScalePercent=100
}={}){
 validateArtworkRotation(rotationDeg);
 if(!asset||typeof asset.title_fr!=="string"||!asset.title_fr.trim()||
    typeof inkUrl!=="string"||!inkUrl.startsWith("blob:")||
    typeof customPicto!=="function"||typeof scaleMetrics!=="function"||
    typeof fmtRaw!=="function"||!Array.isArray(templates)||templates.length>100)
   throw Error("Galerie des gabarits privés indisponible.");
 const ids=new Set();
 for(const row of templates){
   if(!row||typeof row.id!=="string"||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(row.id)||
      ids.has(row.id)||typeof row.name!=="string"||!row.name.trim()||
      row.name.length>80||/[\u0000-\u001f\u007f]/.test(row.name)||
      !Number.isSafeInteger(row.revision)||row.revision<1||
      typeof row.is_published!=="boolean"||
      !row.preset||!validatePreset(row.preset)||typeof row.preset.colored!=="boolean"||
      !/^#[0-9a-f]{6}$/i.test(row.preset.color)||!/^#[0-9a-f]{6}$/i.test(row.preset.fontColor)||
      typeof row.widthCm!=="number"||!Number.isFinite(row.widthCm)||
      row.widthCm<2||row.widthCm>10||
      typeof row.rotationDeg!=="number"||!Number.isFinite(row.rotationDeg)||
      row.rotationDeg< -180||row.rotationDeg>180)
     throw Error("Un gabarit privé ne peut pas être prévisualisé.");
   ids.add(row.id);
 }
 if(!templates.length)return '<p role="status">'+escapePreview(fr?
   "Aucun gabarit nommé enregistré. Créez-en dans l’onglet Gabarits.":
   "No saved named templates. Create one in the Templates tab.")+'</p>';
 const pictureName={fr:asset.title_fr,en:asset.title_en||asset.title_fr};
 const fmtLabel=n=>Number(n).toLocaleString(fr?"fr-CA":"en-CA",{maximumFractionDigits:2});
 return '<div class="admin-png-named-grid" role="group" aria-label="'+escapePreview(fr?
    "Le vrai dessin dans tous les gabarits nommés":"Actual artwork in every saved named template")+'">'+
   templates.map(row=>{
     const adjusted=fineTunedPrivatePreset(row.preset,artScalePercent);
     const metrics=scaleMetrics(row.preset,row.widthCm);
     const angle=rotationDeg+row.rotationDeg;
     const art='<img data-pictau-ink data-admin-ink-preview src="'+escapePreview(inkUrl)+
       '" alt="" loading="lazy" decoding="async" data-template-rotation="'+row.rotationDeg+
       '" style="transform:rotate('+angle+'deg);transform-origin:center">';
     const picture={...pictureName,image:art};
     return '<figure class="admin-png-variant" data-named-template="'+escapePreview(row.id)+'">'+
       '<figcaption><strong>'+escapePreview(row.name)+'</strong> · v'+row.revision+
       ' <span class="admin-named-preview-status">'+escapePreview(row.is_published?
       (fr?"Publié":"Published"):(fr?"Brouillon privé":"Private draft"))+'</span>'+
       '<small>'+escapePreview(fmtLabel(row.widthCm))+' × '+
       escapePreview(fmtLabel(metrics.heightCm))+' cm · '+
       escapePreview(fmtLabel(row.rotationDeg))+'°</small></figcaption>'+
       '<div class="admin-png-stage"><div class="color-shell'+
       (row.preset.colored?"":" no-color")+'" style="--bordercolor:'+
       escapePreview(row.preset.color)+';--colorwidth:2mm">'+
       '<div class="admin-png-cell" style="width:'+escapePreview(fmtRaw(row.widthCm))+
       'cm;height:'+escapePreview(fmtRaw(metrics.heightCm))+'cm">'+
       (adjusted?customPicto(picture,adjusted,row.widthCm,false):
        '<p role="status">'+escapePreview(fr?"Taille à vérifier : aperçu suspendu pour éviter un dessin coupé.":"Size needs review: preview paused to avoid clipped artwork.")+'</p>')+
       '</div></div></div></figure>';
   }).join("")+'</div>';
}
