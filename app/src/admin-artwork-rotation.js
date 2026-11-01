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
  return base+"-rotation-"+String(angle).replace("-","moins-")+".png";
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
const escapePreview=value=>String(value??"").replace(/[&<>"']/g,c=>({
 "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
}[c]));
export function renderPrivateInkComparison({
 asset,inkUrl,rotationDeg=0,preset,fr=true,customPicto,scaleMetrics,fmtRaw
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
    const measures=scaleMetrics(v.preset,v.widthCm);
    const width=escapePreview(fmtRaw(v.widthCm));
    const height=escapePreview(fmtRaw(measures.heightCm));
    return '<figure class="admin-png-variant" data-private-preview="'+v.key+'">'+
      '<figcaption>'+escapePreview(names[index])+'</figcaption>'+
      '<div class="admin-png-stage"><div class="color-shell'+
      (v.colored?"":" no-color")+'" style="--bordercolor:'+escapePreview(v.preset.color)+
      ';--colorwidth:2mm"><div class="admin-png-cell" style="width:'+width+
      'cm;height:'+height+'cm">'+customPicto(picture,v.preset,v.widthCm,false)+
      '</div></div></div></figure>';
   }).join("")+'</div>';
}
