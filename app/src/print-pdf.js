// Génération PDF locale : aucun serveur tiers, aucun élément privé publié.
// Préversion : composition bitmap à 300 ppp pour les SVG d'essai; à certifier
// visuellement et sur papier avant de remplacer le flux d'impression officiel.
import {scaleMetrics,validatePreset} from "./core.js";
import {computeArtworkBox,normalizeArtSettings} from "./artwork-layout.js";

export const PDF_DPI=300;
const PT_PER_MM=72/25.4;
const MM_PER_PT=25.4/72;
const MM_PER_INCH=25.4;
const PAPERS={letter:[215.9,279.4],a4:[210,297]};
const GAP_BOARD_MM=2;
function validTitle(v){
  if(typeof v!=="string"||!v.trim()||v.trim().length>120||/[\p{C}]/u.test(v))
    throw Error("Titre PDF invalide.");
  return v.trim();
}
function measuredLabel(item,language){
  const v=item?.[language==="en"?"en":"fr"];
  if(typeof v!=="string"||!v.trim()||/[\p{C}]/u.test(v))throw Error("Libellé de pictogramme invalide.");
  return v.trim();
}
function safeImage(item){
  const s=item?.image;
  if(typeof s!=="string"||!/^<svg[\s>]/i.test(s)||!/<\/svg>\s*$/i.test(s)||
    /<script|<foreignObject|<image|(?:href|src)\s*=|<!doctype|<!entity/iu.test(s))
    throw Error("La source vectorielle ne peut pas être intégrée au PDF.");
  return s;
}
function safeWidth(v){if(typeof v!=="number"||!Number.isFinite(v)||v<2||v>10)throw Error("Largeur des cases invalide.");return v;}
function dimensions(paper){
  const v=PAPERS[paper];
  if(!v)throw Error("Format de papier invalide.");
  return v;
}
export function planPreparedPdf({items,kind,widthCm,preset,paper="letter",columns=3,separatorMode="simple",language="fr",title}){
  validTitle(title);
  if(!Array.isArray(items)||!items.length||items.length>16)throw Error("Sélection PDF invalide.");
  if(!validatePreset(preset))throw Error("Gabarit PDF invalide.");
  if(!["routine","board"].includes(kind))throw Error("Type PDF non pris en charge.");
  if(kind==="routine"&&(items.length<2||items.length>10))throw Error("Une routine contient 2 à 10 pictogrammes.");
  if(kind==="board"&&![2,3,4].includes(columns))throw Error("Nombre de colonnes invalide.");
  if(!["simple","double"].includes(separatorMode))throw Error("Séparation invalide.");
  safeWidth(widthCm);
  if(!["fr","en"].includes(language))throw Error("Langue PDF invalide.");
  for(const item of items){measuredLabel(item,language);safeImage(item);}
  const [pageW,pageH]=dimensions(paper);
  const {heightCm,bandMm,strokeMm,fontPt,separatorMm}=scaleMetrics(preset,widthCm);
  const w=widthCm*10,h=heightCm*10;
  const cols=kind==="routine"?items.length:columns;
  const gap=kind==="routine"?separatorMm*(separatorMode==="double"?2:1):GAP_BOARD_MM;
  const edge=kind==="routine"?separatorMm:0;
  const totalW=cols*w+(cols-1)*gap+edge*2;
  if(totalW>pageW-20+1e-6)throw Error("La composition dépasse la largeur imprimable : aucune réduction automatique.");
  const rowHeight=h+(kind==="routine"?edge*2:0);
  const usableH=pageH-42; // titre et marges physiques, en mm
  if(rowHeight>usableH)throw Error("Une case dépasse la hauteur imprimable.");
  const rows=[];
  for(let i=0;i<items.length;i+=cols)rows.push(items.slice(i,i+cols));
  const pages=[];
  let current=[],used=0;
  for(const row of rows){
    const next=used+(current.length?GAP_BOARD_MM:0)+rowHeight;
    if(current.length&&next>usableH){
      pages.push(current);current=[];used=0;
    }
    if(current.length)used+=GAP_BOARD_MM;
    current.push(row);used+=rowHeight;
  }
  if(current.length)pages.push(current);
  return {kind,title:title.trim(),language,paper,pageW,pageH,pages,
    widthMm:w,heightMm:h,bandMm,strokeMm,fontPt,gapMm:gap,edgeMm:edge,totalWidthMm:totalW,
    separatorMode,preset:{...preset}};
}
function toBytes(s){return new TextEncoder().encode(s);}
function concatenate(chunks){
  let len=0;for(const chunk of chunks)len+=chunk.length;
  const out=new Uint8Array(len);let pos=0;
  for(const chunk of chunks){out.set(chunk,pos);pos+=chunk.length;}
  return out;
}
function base64Bytes(raw){
  const data=atob(raw);
  const bytes=new Uint8Array(data.length);
  for(let i=0;i<data.length;i++)bytes[i]=data.charCodeAt(i);
  return bytes;
}
function pdfNumber(v){return Number(v.toFixed(4)).toString();}
export function assembleJpegPdf(pages){
  if(!Array.isArray(pages)||!pages.length||pages.length>100)throw Error("Nombre de pages PDF invalide.");
  const objectData=[null];
  const pageRefs=[];
  // Un objet catalogue, un arbre Pages, puis trois objets par page.
  for(let i=0;i<pages.length;i++){
    const entry=pages[i],id=3+i*3,streamId=id+1,imgId=id+2;
    if(!Number.isInteger(entry?.pixelWidth)||!Number.isInteger(entry?.pixelHeight)||
       entry.pixelWidth<1||entry.pixelHeight<1||entry.pixelWidth>10000||entry.pixelHeight>10000||
       !Number.isFinite(entry.widthPt)||!Number.isFinite(entry.heightPt)||
       entry.widthPt<=0||entry.heightPt<=0||!(entry.jpeg instanceof Uint8Array)||
       entry.jpeg.length<4||entry.jpeg[0]!==0xff||entry.jpeg[1]!==0xd8||
       entry.jpeg.at(-2)!==0xff||entry.jpeg.at(-1)!==0xd9)
      throw Error("Page JPEG PDF invalide.");
    const w=pdfNumber(entry.widthPt),h=pdfNumber(entry.heightPt);
    pageRefs.push(id+" 0 R");
    objectData[id]=toBytes("<< /Type /Page /Parent 2 0 R /MediaBox [0 0 "+w+" "+h+"] /Resources << /XObject << /Im0 "+imgId+" 0 R >> >> /Contents "+streamId+" 0 R >>");
    const command=toBytes("q "+w+" 0 0 "+h+" 0 0 cm /Im0 Do Q\n");
    objectData[streamId]=concatenate([toBytes("<< /Length "+command.length+" >>\nstream\n"),command,toBytes("endstream")]);
    objectData[imgId]=concatenate([toBytes("<< /Type /XObject /Subtype /Image /Width "+entry.pixelWidth+
      " /Height "+entry.pixelHeight+" /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length "+entry.jpeg.length+
      " >>\nstream\n"),entry.jpeg,toBytes("\nendstream")]);
  }
  objectData[1]=toBytes("<< /Type /Catalog /Pages 2 0 R >>");
  objectData[2]=toBytes("<< /Type /Pages /Count "+pages.length+" /Kids ["+pageRefs.join(" ")+"] >>");
  const chunks=[toBytes("%PDF-1.4\n%\u00e2\u00e3\u00cf\u00d3\n%PICTAU-FLAT-JPEG-V1\n")],offsets=[0];let pos=chunks[0].length;
  for(let i=1;i<objectData.length;i++){
    const frame=concatenate([toBytes(i+" 0 obj\n"),objectData[i],toBytes("\nendobj\n")]);
    offsets.push(pos);chunks.push(frame);pos+=frame.length;
  }
  const start=pos;
  let xref="xref\n0 "+objectData.length+"\n0000000000 65535 f \n";
  for(let i=1;i<offsets.length;i++)xref+=String(offsets[i]).padStart(10,"0")+" 00000 n \n";
  chunks.push(toBytes(xref+"trailer\n<< /Size "+objectData.length+" /Root 1 0 R >>\nstartxref\n"+start+"\n%%EOF\n"));
  return new Blob(chunks,{type:"application/pdf"});
}
async function loadArtwork(svg){
  // Les exemples Pict-au ont leur dessin dans le viewBox, avec une marge
  // transparente. Le même principe « encre visible » que l'aperçu s'applique.
  // Aucun SVG n'est inséré dans le DOM : le décodage en Image reste inerte.
  const url=URL.createObjectURL(new Blob([svg],{type:"image/svg+xml"}));
  let img;
  try{
    img=new Image();
    img.src=url;
    if(typeof img.decode==="function")await img.decode();
    else await new Promise((resolve,reject)=>{img.onload=resolve;img.onerror=reject;});
    if(!img.naturalWidth||!img.naturalHeight)throw Error("Illustration PDF non décodable.");
  }finally{URL.revokeObjectURL(url);}
  const size=600;
  const raster=document.createElement("canvas");
  raster.width=size;raster.height=size;
  const ctx=raster.getContext("2d",{willReadFrequently:true});
  if(!ctx)throw Error("Impossible de mesurer le dessin vectoriel.");
  ctx.clearRect(0,0,size,size);
  ctx.drawImage(img,0,0,size,size);
  const pixels=ctx.getImageData(0,0,size,size).data;
  let left=size,top=size,right=-1,bottom=-1;
  for(let y=0;y<size;y++){
    for(let x=0;x<size;x++){
      if(pixels[(y*size+x)*4+3]>24){
        if(x<left)left=x;if(x>right)right=x;
        if(y<top)top=y;if(y>bottom)bottom=y;
      }
    }
  }
  if(right<left||bottom<top)throw Error("Le pictogramme ne contient aucun dessin visible.");
  // Trois unités de marge, cohérentes avec cropSvg() du moteur d'aperçu.
  const margin=15;
  left=Math.max(0,left-margin);top=Math.max(0,top-margin);
  right=Math.min(size-1,right+margin);bottom=Math.min(size-1,bottom+margin);
  const width=right-left+1,height=bottom-top+1;
  const crop=document.createElement("canvas");
  crop.width=width;crop.height=height;
  const cropCtx=crop.getContext("2d");
  if(!cropCtx)throw Error("Recadrage vectoriel indisponible.");
  cropCtx.drawImage(raster,left,top,width,height,0,0,width,height);
  return {image:crop,inkWidth:width,inkHeight:height};
}
function renderCell(ctx,item,img,x,y,plan){
  const {widthMm:w,heightMm:h,bandMm:band,strokeMm:stroke,fontPt,preset,language}=plan;
  const innerY=y+h-band;
  ctx.fillStyle="#fff";ctx.fillRect(x,y,w,h);
  ctx.strokeStyle="#101316";ctx.lineWidth=stroke;
  ctx.strokeRect(x+stroke/2,y+stroke/2,w-stroke,h-stroke);
  ctx.strokeStyle="#111";ctx.lineWidth=Math.max(.4,stroke*.6);
  ctx.beginPath();ctx.moveTo(x+stroke,innerY);ctx.lineTo(x+w-stroke,innerY);ctx.stroke();
  const label=measuredLabel(item,language);
  const fontMm=fontPt*MM_PER_PT;
  ctx.fillStyle=preset.fontColor||"#111111";
  ctx.font=fontMm+'px "Patrick Hand", "Comic Sans MS", cursive';
  ctx.textAlign="center";ctx.textBaseline="middle";
  if(ctx.measureText(label).width>w-2*stroke-4||fontMm>band-2)
    throw Error("Le libellé « "+label+" » dépasse son cadre; choisissez une case plus large.");
  ctx.fillText(label,x+w/2,innerY+(band-stroke)/2);
  const settings=normalizeArtSettings(preset);
  const placement=computeArtworkBox({
    innerWidth:w-2*stroke,innerHeight:h-2*stroke,
    upperHeight:h-2*stroke-band,inkWidth:img.inkWidth,inkHeight:img.inkHeight,
    percent:settings.percent,shape:preset.shape,center:settings.center
  });
  if(placement.collides)throw Error("Le dessin dépasse la zone illustrée; ajustez son centrage.");
  ctx.drawImage(img.image,x+stroke+placement.left,y+stroke+placement.top,
    placement.width,placement.height);
}
async function canvasPage(plan,rows,pageIndex,artwork,dpi){
  const canvas=document.createElement("canvas");
  canvas.width=Math.round(plan.pageW*dpi/MM_PER_INCH);
  canvas.height=Math.round(plan.pageH*dpi/MM_PER_INCH);
  const ctx=canvas.getContext("2d",{alpha:false});
  if(!ctx)throw Error("Canvas PDF indisponible sur cet appareil.");
  ctx.scale(dpi/MM_PER_INCH,dpi/MM_PER_INCH);
  ctx.fillStyle="#fff";ctx.fillRect(0,0,plan.pageW,plan.pageH);
  ctx.textAlign="center";ctx.textBaseline="middle";ctx.fillStyle="#111";
  ctx.font=(10*MM_PER_PT)+'px Arial, sans-serif';
  ctx.fillText(plan.title+(plan.pages.length>1?" ("+(pageIndex+1)+"/"+plan.pages.length+")":""),plan.pageW/2,16);
  let y=28;
  for(const row of rows){
    let x=(plan.pageW-plan.totalWidthMm)/2+plan.edgeMm;
    if(plan.kind==="routine"&&plan.preset.colored){
      ctx.fillStyle=plan.preset.color;
      ctx.fillRect(x-plan.edgeMm,y-plan.edgeMm,plan.totalWidthMm,plan.heightMm+plan.edgeMm*2);
    }
    for(const item of row){
      renderCell(ctx,item,artwork.get(item.image),x,y,plan);
      x+=plan.widthMm+plan.gapMm;
    }
    y+=plan.heightMm+plan.edgeMm*2+GAP_BOARD_MM;
  }
  const data=canvas.toDataURL("image/jpeg",.94);
  if(!data.startsWith("data:image/jpeg;base64,"))throw Error("Encodage JPEG PDF indisponible.");
  return {pixelWidth:canvas.width,pixelHeight:canvas.height,
    widthPt:plan.pageW*PT_PER_MM,heightPt:plan.pageH*PT_PER_MM,jpeg:base64Bytes(data.slice(23))};
}
export async function createPreparedPdf(options){
  const plan=planPreparedPdf(options);
  if(typeof document==="undefined"||typeof Image==="undefined"||typeof atob==="undefined")
    throw Error("Génération PDF disponible uniquement dans un navigateur compatible.");
  if(document.fonts?.ready)await document.fonts.ready;
  const artwork=new Map();
  for(const item of options.items){
    if(!artwork.has(item.image))artwork.set(item.image,await loadArtwork(item.image));
  }
  const pageJpegs=[];
  for(let i=0;i<plan.pages.length;i++){
    pageJpegs.push(await canvasPage(plan,plan.pages[i],i,artwork,PDF_DPI));
  }
  return {blob:assembleJpegPdf(pageJpegs),pageCount:pageJpegs.length};
}
