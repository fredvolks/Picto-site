// Normaliser uniquement la MINIATURE privée en mémoire, sans jamais modifier le PNG source.
// Le recadrage suit l'encre réelle (et non les marges blanches variables du fichier).
import {inspectPngBlob} from "./admin-review.js";
import {createLocalInkCrop} from "./png-ink.js";

export const BANK_THUMBNAIL_PIXELS=216; // 3x le cadre CSS de 72px : net sur écran haute densité.
export const BANK_INK_MAX_PIXELS=174; // Le dessin le plus long occupe ~58px sur un carré de 72px.

export async function createNormalizedBankThumbnail(originalBlob){
  // Limites de taille et de décodage déjà contrôlées par createLocalInkCrop.
  const metadata=await inspectPngBlob(originalBlob);
  const {blob:cropped}=await createLocalInkCrop(originalBlob,metadata);
  if(typeof createImageBitmap!=="function"||typeof document==="undefined")
    throw new Error("Miniature locale indisponible dans ce navigateur.");
  const bitmap=await createImageBitmap(cropped);
  try{
    if(!bitmap.width||!bitmap.height)throw new Error("Miniature décodée invalide.");
    const surface=document.createElement("canvas");
    surface.width=surface.height=BANK_THUMBNAIL_PIXELS;
    const ctx=surface.getContext("2d");
    if(!ctx)throw new Error("Rendu de miniature indisponible.");
    // Centre le dessin et conserve son rapport largeur/hauteur.
    const scale=Math.min(BANK_INK_MAX_PIXELS/bitmap.width,BANK_INK_MAX_PIXELS/bitmap.height);
    const width=bitmap.width*scale,height=bitmap.height*scale;
    ctx.fillStyle="#fff";
    ctx.fillRect(0,0,surface.width,surface.height);
    ctx.imageSmoothingEnabled=true;
    ctx.imageSmoothingQuality="high";
    ctx.drawImage(bitmap,(surface.width-width)/2,(surface.height-height)/2,width,height);
    return await new Promise((resolve,reject)=>{
      surface.toBlob(blob=>blob?resolve(blob):reject(new Error("Miniature PNG indisponible.")),"image/png");
    });
  }finally{bitmap.close?.();}
}
