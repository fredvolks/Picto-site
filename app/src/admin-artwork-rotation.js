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
