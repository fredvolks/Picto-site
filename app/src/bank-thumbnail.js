// Uniquement pour l'affichage privé Banque > Images : l'original n'est jamais modifié.
// Calibrer la taille du dessin noir (pas seulement du carré ni des marges PNG).
import {inspectPngBlob} from "./admin-review.js";
import {findInkBoundsRGBA,MAX_SCAN_SIDE,MAX_DECODE_PIXELS,MAX_PNG_CROP_BYTES} from "./png-ink.js";

export const BANK_THUMBNAIL_PIXELS=216; // 3x le cadre CSS 72px, net sur écran haute densité.
export const BANK_INK_MAX_PIXELS=194; // Le côté dominant du dessin mesure environ 58px à l'écran.

export async function createNormalizedBankThumbnail(originalBlob){
  // Un aperçu téléchargé reste local en mémoire; aucune écriture dans Storage.
  const metadata=await inspectPngBlob(originalBlob);
  const {width,height}=metadata;
  if(originalBlob.size>MAX_PNG_CROP_BYTES||
     width*height>MAX_DECODE_PIXELS||
     !["image/png","application/octet-stream",""].includes(originalBlob.type))
    throw new Error("Miniature PNG trop grande ou format non accepté.");
  if(typeof createImageBitmap!=="function"||typeof document==="undefined")
    throw new Error("Décodage PNG local indisponible.");
  const bitmap=await createImageBitmap(originalBlob);
  try{
    if(bitmap.width!==width||bitmap.height!==height)
      throw new Error("Dimensions décodées non conformes au PNG.");
    const factor=Math.min(1,MAX_SCAN_SIDE/Math.max(width,height));
    const sw=Math.max(1,Math.round(width*factor));
    const sh=Math.max(1,Math.round(height*factor));
    const scan=document.createElement("canvas");scan.width=sw;scan.height=sh;
    const scanner=scan.getContext("2d",{willReadFrequently:true});
    if(!scanner)throw new Error("Analyse d'encre indisponible.");
    scanner.drawImage(bitmap,0,0,sw,sh);
    const ink=findInkBoundsRGBA(scanner.getImageData(0,0,sw,sh).data,sw,sh);
    if(!ink)throw new Error("Aucun trait sombre trouvé.");
    // Un pixel de marge par côté protège l'anticrénelage, sans garder les
    // grandes marges blanches variables des fichiers originaux.
    const left=Math.max(0,ink.x-1),top=Math.max(0,ink.y-1);
    const right=Math.min(sw,ink.x+ink.width+1);
    const bottom=Math.min(sh,ink.y+ink.height+1);
    const sx=left*width/sw,sy=top*height/sh;
    const sourceWidth=(right-left)*width/sw,sourceHeight=(bottom-top)*height/sh;
    const scale=BANK_INK_MAX_PIXELS/Math.max(sourceWidth,sourceHeight);
    const outWidth=sourceWidth*scale,outHeight=sourceHeight*scale;
    const surface=document.createElement("canvas");
    surface.width=surface.height=BANK_THUMBNAIL_PIXELS;
    const ctx=surface.getContext("2d");
    if(!ctx)throw new Error("Rendu de miniature indisponible.");
    ctx.fillStyle="#fff";ctx.fillRect(0,0,surface.width,surface.height);
    ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality="high";
    ctx.drawImage(bitmap,sx,sy,sourceWidth,sourceHeight,
      (surface.width-outWidth)/2,(surface.height-outHeight)/2,outWidth,outHeight);
    return await new Promise((resolve,reject)=>{
      surface.toBlob(blob=>blob?resolve(blob):reject(new Error("Miniature PNG indisponible.")),"image/png");
    });
  }finally{bitmap.close?.();}
}
