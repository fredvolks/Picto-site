// « Mes fichiers » : PDF réellement archivé, non un état fictif de window.print.
// Le contenu reste sur Storage PRIVÉ sous UID/UUID.pdf ; aucun lien permanent public.
export const FILES_BUCKET="pictau-client-files";
export const DOCUMENTS_PAGE_SIZE=20;
export const MAX_PDF_BYTES=20*1024*1024; // garde technique du bucket, pas un quota commercial
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TYPES=["routine","sheet","board"];
const COLUMNS="id,title,document_type,sha256,byte_size,page_count,created_at";
export function normalizeDocumentTitle(title){
  if(typeof title!=="string"||/[\p{C}]/u.test(title))throw Error("Titre de document invalide.");
  const clean=title.trim().replace(/\s+/g," ");
  if(!clean||clean.length>120)throw Error("Le titre doit contenir de 1 à 120 caractères.");
  return clean;
}
export function normalizeDocumentSearch(value){
  if(typeof value!=="string"||value.length>80||/[\p{C}%,_\\]/u.test(value))
    throw Error("Recherche de document invalide.");
  return value.trim();
}
export function documentPath(uid,id){
  if(!UUID.test(uid||"")||!UUID.test(id||""))throw Error("Identifiant de document invalide.");
  return uid+"/"+id+".pdf";
}
async function verifiedUser(client,uid){
  if(!UUID.test(uid||""))throw Error("Connectez-vous à votre compte.");
  const {data,error}=await client.auth.getUser();
  if(error)throw error;
  if(data?.user?.id!==uid)throw Error("Session modifiée ou expirée.");
}
async function sha256Hex(blob){
  if(typeof crypto==="undefined"||!crypto.subtle)throw Error("Contrôle d’intégrité PDF indisponible : HTTPS requis.");
  const digest=await crypto.subtle.digest("SHA-256",await blob.arrayBuffer());
  return [...new Uint8Array(digest)].map(x=>x.toString(16).padStart(2,"0")).join("");
}
export async function validatePdfBlob(file){
  if(!file||typeof file.size!=="number"||typeof file.slice!=="function"||
      file.size<9||file.size>MAX_PDF_BYTES)throw Error("PDF vide ou trop volumineux (limite technique 20 Mo).");
  if(file.type && file.type!=="application/pdf" && file.type!=="application/octet-stream")
    throw Error("Sélectionnez un fichier PDF.");
  const header=new Uint8Array(await file.slice(0,5).arrayBuffer());
  if([37,80,68,70,45].some((v,i)=>v!==header[i]))
    throw Error("Ce fichier ne commence pas par une signature PDF valide.");
  return{sha256:await sha256Hex(file),byte_size:file.size};
}
export async function archivePdf(client,uid,file,{title,documentType="routine",pageCount=null}){
  const cleanTitle=normalizeDocumentTitle(title);
  if(!TYPES.includes(documentType))throw Error("Type de document invalide.");
  if(pageCount!==null&&(!Number.isSafeInteger(pageCount)||pageCount<1||pageCount>100))
    throw Error("Nombre de pages PDF invalide.");
  // Lire et valider le PDF AVANT d'envoyer des octets vers le stockage.
  const fingerprint=await validatePdfBlob(file);
  await verifiedUser(client,uid);
  if(typeof crypto==="undefined"||typeof crypto.randomUUID!=="function")
    throw Error("Génération d’identifiant sécurisé indisponible.");
  const id=crypto.randomUUID(),path=documentPath(uid,id);
  const upload=await client.storage.from(FILES_BUCKET).upload(path,file,{
    contentType:"application/pdf",upsert:false,cacheControl:"0"
  });
  if(upload.error)throw upload.error;
  try{
    await verifiedUser(client,uid);
    const row=await client.from("pictau_documents").insert({
      id,owner_id:uid,title:cleanTitle,document_type:documentType,
      storage_path:path,...fingerprint,...(pageCount===null?{}:{page_count:pageCount})
    }).select(COLUMNS).single();
    if(row.error)throw row.error;
    if(row.data?.id!==id||row.data?.sha256!==fingerprint.sha256)
      throw Error("L'archivage n'a pas été confirmé par le serveur.");
    await verifiedUser(client,uid);
    return row.data;
  }catch(error){
    // Compensation uniquement si la session n'a pas changé. Pas de statut « sauvegardé ».
    try{await verifiedUser(client,uid);await client.storage.from(FILES_BUCKET).remove([path]);}
    catch{ /* Un objet orphelin exige une vérification administrative; ne jamais masquer l'échec. */ }
    throw error;
  }
}
export async function listMyDocuments(client,uid,{page=0,query="",type="all"}={}){
  if(!Number.isSafeInteger(page)||page<0||page>100000)throw Error("Page invalide.");
  const search=normalizeDocumentSearch(query);
  if(type!=="all"&&!TYPES.includes(type))throw Error("Filtre invalide.");
  await verifiedUser(client,uid);
  let q=client.from("pictau_documents").select(COLUMNS,{count:"exact"}).eq("owner_id",uid);
  if(type!=="all")q=q.eq("document_type",type);
  if(search)q=q.ilike("title","%"+search+"%");
  const result=await q.order("created_at",{ascending:false}).order("id",{ascending:true})
    .range(page*DOCUMENTS_PAGE_SIZE,(page+1)*DOCUMENTS_PAGE_SIZE-1);
  if(result.error)throw result.error;
  if(!Number.isSafeInteger(result.count)||result.count<0)throw Error("Décompte des fichiers indisponible.");
  await verifiedUser(client,uid);
  return{items:result.data||[],total:result.count,page};
}
export async function downloadMyDocument(client,uid,id){
  const path=documentPath(uid,id);
  await verifiedUser(client,uid);
  const q=await client.from("pictau_documents").select(COLUMNS).eq("id",id).eq("owner_id",uid).maybeSingle();
  if(q.error)throw q.error;
  const doc=q.data;
  if(!doc||doc.id!==id)throw Error("Ce document est introuvable ou privé.");
  const r=await client.storage.from(FILES_BUCKET).download(path);
  if(r.error)throw r.error;
  const file=r.data;
  const fingerprint=await validatePdfBlob(file);
  if(fingerprint.sha256!==doc.sha256||fingerprint.byte_size!==doc.byte_size)
    throw Error("PDF original endommagé ou modifié. Réimpression bloquée.");
  await verifiedUser(client,uid);
  return{blob:file,document:doc};
}
export async function renameMyDocument(client,uid,id,oldTitle,newTitle){
  documentPath(uid,id);
  const clean=normalizeDocumentTitle(newTitle),previous=normalizeDocumentTitle(oldTitle);
  await verifiedUser(client,uid);
  if(clean===previous)return{changed:false,title:clean};
  const r=await client.from("pictau_documents").update({title:clean}).eq("id",id)
    .eq("owner_id",uid).eq("title",previous).select("id,title").maybeSingle();
  if(r.error)throw r.error;
  if(r.data?.id!==id||r.data.title!==clean)throw Error("Le document a changé. Actualisez la liste.");
  await verifiedUser(client,uid);
  return{changed:true,title:clean};
}
