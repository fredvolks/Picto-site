// Revue non destructive : filtrer les métadonnées accessibles à l'admin
// et inspecter le seul en-tête technique PNG (sans créer de décision de publication).
const PNG_SIGNATURE=[137,80,78,71,13,10,26,10];
const PNG_COLOR_NAMES={
  0:{fr:"niveaux de gris",en:"grayscale",depth:[1,2,4,8,16]},
  2:{fr:"RVB",en:"RGB",depth:[8,16]},
  3:{fr:"palette indexée",en:"indexed palette",depth:[1,2,4,8]},
  4:{fr:"gris avec transparence",en:"grayscale with alpha",depth:[8,16]},
  6:{fr:"RVB avec transparence",en:"RGBA",depth:[8,16]}
};

// CRC32 standard PNG sur le type IHDR et ses 13 octets de données.
// Ne lit pas les pixels et ne prétend pas valider les chunks IDAT/IEND.
function pngIhdrCrc(bytes){
  let crc=0xffffffff;
  for(let i=12;i<29;i++){
    crc^=bytes[i];
    for(let bit=0;bit<8;bit++)
      crc=(crc>>>1)^((crc&1)?0xedb88320:0);
  }
  return (crc^0xffffffff)>>>0;
}

export function inspectPngHeader(bytes){
  if(!(bytes instanceof Uint8Array)||bytes.length<33)
    throw new Error("En-tête PNG incomplet.");
  if(!PNG_SIGNATURE.every((b,i)=>bytes[i]===b))
    throw new Error("Signature PNG incorrecte.");
  const read32=offset=>(bytes[offset]*0x1000000+bytes[offset+1]*0x10000+bytes[offset+2]*0x100+bytes[offset+3])>>>0;
  if(read32(8)!==13 || String.fromCharCode(...bytes.slice(12,16))!=="IHDR")
    throw new Error("Bloc de dimensions PNG (IHDR) invalide.");
  const width=read32(16),height=read32(20),bitDepth=bytes[24],colorType=bytes[25],color=PNG_COLOR_NAMES[colorType];
  if(!width||!height||!color||!color.depth.includes(bitDepth)||
     bytes[26]!==0||bytes[27]!==0||![0,1].includes(bytes[28]))
    throw new Error("Paramètres PNG (dimensions/couleur) invalides.");
  if(read32(29)!==pngIhdrCrc(bytes))
    throw new Error("Intégrité PNG : CRC du bloc IHDR invalide.");
  return {width,height,bitDepth,colorType,hasAlpha:[4,6].includes(colorType),interlaced:bytes[28]===1};
}

export async function inspectPngBlob(blob){
  if(!blob||typeof blob.slice!=="function"||typeof blob.size!=="number"||blob.size<33)
    throw new Error("Image PNG trop courte.");
  const bytes=new Uint8Array(await blob.slice(0,33).arrayBuffer());
  return {...inspectPngHeader(bytes),bytes:blob.size};
}

export function filterAdminAssets(items,{query="",status="all",theme="all",sort="recent"}={}) {
  if(!Array.isArray(items))return [];
  const fold=value=>String(value??"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLocaleLowerCase("fr-CA").trim();
  const needle=fold(query).slice(0,100);
  const filtered=items.filter(item=>{
    if(!item||typeof item!=="object")return false;
    if(status!=="all"&&item.status!==status)return false;
    if(theme!=="all"&&item.theme!==theme)return false;
    if(!needle)return true;
    return [item.title_fr,item.title_en,item.theme].some(value=>fold(value).includes(needle));
  });
  if(sort==="name"){
    filtered.sort((a,b)=>fold(a.title_fr).localeCompare(fold(b.title_fr),"fr-CA")||
      String(a.id??"").localeCompare(String(b.id??"")));
  }else{
    filtered.sort((a,b)=>{
      const date=v=>{const n=Date.parse(v??"");return Number.isFinite(n)?n:0;};
      return date(b.created_at)-date(a.created_at)||String(a.id??"").localeCompare(String(b.id??""));
    });
  }
  return filtered;
}
