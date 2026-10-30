// Analyse privée, locale et NON destructive du noir d'un PNG de brouillon.
// Ne publie rien, ne téléverse rien et n'écrit pas dans Supabase.
export const MAX_SCAN_SIDE=768;
export const MAX_DECODE_PIXELS=16_000_000;
export const MAX_PNG_CROP_BYTES=10*1024*1024;
const PNG_MAGIC=[137,80,78,71,13,10,26,10];

export function findInkBoundsRGBA(data,width,height,{alphaMinimum=32,maxChannelAverage=180}={}){
  if(!Number.isSafeInteger(width)||width<1||!Number.isSafeInteger(height)||height<1||
     !data||typeof data.length!=="number"||data.length!==width*height*4)
    throw new Error("Invalid RGBA image data.");
  let xmin=width,ymin=height,xmax=-1,ymax=-1,count=0;
  for(let y=0;y<height;y++){
    for(let x=0;x<width;x++){
      const i=(y*width+x)*4;
      const alpha=data[i+3];
      const grey=(data[i]+data[i+1]+data[i+2])/3;
      if(alpha<alphaMinimum||grey>maxChannelAverage)continue;
      if(x<xmin)xmin=x;if(x>xmax)xmax=x;
      if(y<ymin)ymin=y;if(y>ymax)ymax=y;
      count++;
    }
  }
  return count?{x:xmin,y:ymin,width:xmax-xmin+1,height:ymax-ymin+1,inkPixels:count}:null;
}

export async function createLocalInkCrop(blob,{width,height}={}){
  if(!Number.isSafeInteger(width)||!Number.isSafeInteger(height)||
     width<1||height<1||width*height>MAX_DECODE_PIXELS)
    throw new Error("PNG trop grand pour une analyse locale sûre.");
  // Le module doit protéger le décodage indépendamment des contrôles Storage.
  // Le stockage privé peut fournir un type MIME PNG, octet-stream ou vide.
  if(!(blob instanceof Blob)||!Number.isSafeInteger(blob.size)||
     blob.size<33||blob.size>MAX_PNG_CROP_BYTES||
     !["image/png","application/octet-stream",""].includes(blob.type))
    throw new Error("Le PNG est absent, invalide ou trop volumineux.");
  const signature=new Uint8Array(await blob.slice(0,8).arrayBuffer());
  if(!PNG_MAGIC.every((byte,index)=>signature[index]===byte))
    throw new Error("Signature PNG invalide.");
  if(typeof createImageBitmap!=="function"||typeof document==="undefined")
    throw new Error("Décodage PNG local indisponible dans ce navigateur.");
  const bitmap=await createImageBitmap(blob);
  try{
    if(bitmap.width!==width||bitmap.height!==height)
      throw new Error("Dimensions PNG décodées différentes de l'en-tête.");
    const scale=Math.min(1,MAX_SCAN_SIDE/Math.max(width,height));
    const sw=Math.max(1,Math.round(width*scale)),sh=Math.max(1,Math.round(height*scale));
    const scan=document.createElement("canvas");scan.width=sw;scan.height=sh;
    const ctx=scan.getContext("2d",{willReadFrequently:true});
    if(!ctx)throw new Error("Analyse PNG indisponible.");
    ctx.drawImage(bitmap,0,0,sw,sh);
    const data=ctx.getImageData(0,0,sw,sh);
    const bounds=findInkBoundsRGBA(data.data,sw,sh);
    if(!bounds)throw new Error("Aucun dessin assez sombre trouvé dans ce PNG.");
    // Ajouter une marge de sécurité, sinon le dernier pixel antialiasé pourrait être coupé.
    const padx=Math.max(2,Math.ceil(sw*.01)),pady=Math.max(2,Math.ceil(sh*.01));
    const left=Math.max(0,bounds.x-padx),top=Math.max(0,bounds.y-pady);
    const right=Math.min(sw,bounds.x+bounds.width+padx);
    const bottom=Math.min(sh,bounds.y+bounds.height+pady);
    const sx=left*width/sw,sy=top*height/sh;
    const cropWidth=(right-left)*width/sw,cropHeight=(bottom-top)*height/sh;
    const outputScale=Math.min(1,1200/Math.max(cropWidth,cropHeight));
    const cw=Math.max(1,Math.round(cropWidth*outputScale));
    const ch=Math.max(1,Math.round(cropHeight*outputScale));
    const dest=document.createElement("canvas");dest.width=cw;dest.height=ch;
    const output=dest.getContext("2d");
    if(!output)throw new Error("Aperçu PNG impossible.");
    output.drawImage(bitmap,sx,sy,cropWidth,cropHeight,0,0,cw,ch);
    const croppedBlob=await new Promise((resolve,reject)=>{
      dest.toBlob(value=>value?resolve(value):reject(new Error("PNG recadré indisponible.")),"image/png");
    });
    return{blob:croppedBlob,width:cw,height:ch,originalWidth:width,originalHeight:height,
      ink:{x:sx,y:sy,width:cropWidth,height:cropHeight},scanPixels:sw*sh};
  }finally{bitmap.close?.();}
}
