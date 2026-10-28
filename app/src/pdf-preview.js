// Aperçu privé, limité aux PDF de pages entières JPEG produits par Pict-au.
// Les octets proviennent du PDF original après vérification du SHA-256 par
// downloadMyDocument. Aucune régénération ni service tiers n'intervient.
const MARKER="%PICTAU-FLAT-JPEG-V1";
const MAX_PREVIEW_BYTES=20*1024*1024;
const MAX_PAGES=100;
const ascii=s=>Uint8Array.from(s,ch=>ch.charCodeAt(0));
function matchAt(bytes,needle,offset){
  if(offset<0||offset+needle.length>bytes.length)return false;
  for(let j=0;j<needle.length;j++)if(bytes[offset+j]!==needle[j])return false;
  return true;
}
function findBytes(bytes,pattern,from=0){
  const needle=ascii(pattern);
  for(let i=from;i<=bytes.length-needle.length;i++)
    if(matchAt(bytes,needle,i))return i;
  return -1;
}
function asciiWindow(bytes,start,end){
  let out="";
  for(let i=start;i<end;i++)out+=String.fromCharCode(bytes[i]);
  return out;
}
export function extractPictauPageJpegs(pdfBytes){
  if(!(pdfBytes instanceof Uint8Array)||pdfBytes.length<64||pdfBytes.length>MAX_PREVIEW_BYTES)
    return null;
  if(!matchAt(pdfBytes,ascii("%PDF-"),0))return null;
  if(!matchAt(pdfBytes,ascii("%%EOF\n"),pdfBytes.length-6))return null; // aucune page partiellement tronquée
  const markerIndex=findBytes(pdfBytes,MARKER,0);
  if(markerIndex<0||markerIndex>80)return null; // en-tête exclusivement
  const prelude=asciiWindow(pdfBytes,0,Math.min(pdfBytes.length,1100));
  const countMatch=/\/Type \/Pages \/Count (\d+) \/Kids \[/.exec(prelude);
  if(!countMatch)return null;
  const count=Number(countMatch[1]);
  if(!Number.isSafeInteger(count)||count<1||count>MAX_PAGES)return null;
  const pages=[];
  let cursor=markerIndex+MARKER.length;
  for(let n=0;n<count;n++){
    // La structure générée comporte un XObject Image par page, dans l'ordre.
    const imageIndex=findBytes(pdfBytes,"/Subtype /Image",cursor);
    if(imageIndex<0)return null;
    const endHeader=Math.min(pdfBytes.length,imageIndex+700);
    const header=asciiWindow(pdfBytes,imageIndex,endHeader);
    const match=/\/Width\s+(\d+)\s+\/Height\s+(\d+)[\s\S]*?\/ColorSpace \/DeviceRGB \/BitsPerComponent 8 \/Filter \/DCTDecode \/Length\s+(\d+)\s*>>\r?\nstream\r?\n/.exec(header);
    if(!match)return null;
    const width=Number(match[1]),height=Number(match[2]),length=Number(match[3]);
    if(!Number.isSafeInteger(width)||!Number.isSafeInteger(height)||!Number.isSafeInteger(length)||
      width<1||height<1||width>10000||height>10000||length<4||length>MAX_PREVIEW_BYTES)
      return null;
    const start=imageIndex+match.index+match[0].length,end=start+length;
    if(end>pdfBytes.length||
      !matchAt(pdfBytes,Uint8Array.of(0xff,0xd8),start)||
      !matchAt(pdfBytes,Uint8Array.of(0xff,0xd9),end-2)||
      !matchAt(pdfBytes,ascii("\nendstream\nendobj\n"),end))return null;
    pages.push({blob:new Blob([pdfBytes.slice(start,end)],{type:"image/jpeg"}),width,height});
    cursor=end+"\nendstream\nendobj\n".length;
  }
  // Un nombre de pages tronqué ou trop faible ne doit jamais produire
  // un aperçu incomplet trompeur.
  if(findBytes(pdfBytes,"/Subtype /Image",cursor)!==-1)return null;
  return pages;
}
export function extractPictauFirstPageJpeg(pdfBytes){
  return extractPictauPageJpegs(pdfBytes)?.[0]||null;
}
export async function previewPagesFromOriginalPdf(pdf){
  if(!pdf||typeof pdf.arrayBuffer!=="function"||pdf.size>MAX_PREVIEW_BYTES)return null;
  return extractPictauPageJpegs(new Uint8Array(await pdf.arrayBuffer()));
}
export async function previewFromOriginalPdf(pdf){
  return (await previewPagesFromOriginalPdf(pdf))?.[0]||null;
}
