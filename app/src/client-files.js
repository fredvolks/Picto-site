// « Mes fichiers » : PDF réellement archivé, non un état fictif de window.print.
// Le contenu reste sur Storage PRIVÉ sous UID/UUID.pdf ; aucun lien permanent public.
import {duplicateEditableDraft,loadEditableDraft} from "./client-drafts.js";
export const FILES_BUCKET="pictau-client-files";
export const DOCUMENTS_PAGE_SIZE=20;
export const MAX_PDF_BYTES=20*1024*1024; // garde technique du bucket, pas un quota commercial
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TYPES=["routine","sheet","board"];
// Liste blanche : aucun nom de colonne reçu du navigateur n'est transmis à PostgREST.
const DOCUMENT_SORT_ORDER=Object.freeze({
  recent:["created_at",false],
  oldest:["created_at",true],
  "name-asc":["title",true],
  "name-desc":["title",false]
});
export function normalizeDocumentSort(sort="recent"){
  if(typeof sort!=="string"||!Object.hasOwn(DOCUMENT_SORT_ORDER,sort))
    throw Error("Tri de documents invalide.");
  return sort;
}
// Filtre de présence d'un brouillon lié à l'archive : seule la fiche privée
// est lue, pas le contenu du brouillon ni les octets du PDF.
const DOCUMENT_SOURCE_MODES=Object.freeze(["all","linked","unlinked"]);
export function normalizeDocumentSourceFilter(source="all"){
  if(typeof source!=="string"||!DOCUMENT_SOURCE_MODES.includes(source))
    throw Error("Filtre de source PDF invalide.");
  return source;
}
// Périodes glissantes UTC : le filtre reste côté serveur avant le décompte
// et la pagination, sans déplacer de documents privés dans le navigateur.
const DOCUMENT_PERIOD_DAYS=Object.freeze({all:0,week:7,month:30});
export function normalizeDocumentPeriod(period="all"){
  if(typeof period!=="string"||(period!=="year"&&!Object.hasOwn(DOCUMENT_PERIOD_DAYS,period)))
    throw Error("Période de documents invalide.");
  return period;
}
export function documentPeriodStart(period="all",now=Date.now()){
  const selected=normalizeDocumentPeriod(period);
  if(typeof now!=="number"||!Number.isFinite(now)||now<0||now>8.64e15)
    throw Error("Date de recherche invalide.");
  if(selected==="all")return null;
  const start=new Date(now);
  if(selected==="year"){
    // Douze mois calendaires, pas 365 jours : préserver l'heure UTC et
    // limiter le 29 février au dernier jour de février l'année précédente.
    const day=start.getUTCDate();
    start.setUTCDate(1);
    start.setUTCFullYear(start.getUTCFullYear()-1);
    const maxDay=new Date(Date.UTC(start.getUTCFullYear(),start.getUTCMonth()+1,0)).getUTCDate();
    start.setUTCDate(Math.min(day,maxDay));
  }else start.setTime(now-DOCUMENT_PERIOD_DAYS[selected]*86400000);
  return start.toISOString();
}
const COLUMNS="id,title,document_type,sha256,byte_size,page_count,created_at,source_draft_id";
export function normalizeDocumentTitle(title){
  if(typeof title!=="string"||/[\p{C}]/u.test(title))throw Error("Titre de document invalide.");
  const clean=title.trim().replace(/\s+/g," ");
  if(!clean||clean.length>120)throw Error("Le titre doit contenir de 1 à 120 caractères.");
  return clean;
}
export function normalizeDocumentSearch(value){
  if(typeof value!=="string"||value.length>80||/[\p{C}]/u.test(value))
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
// Identité stable d'un PDF *déjà généré*. Elle reste en mémoire uniquement pour
// toutes les tentatives de ce même original (pas de clé publique ni localStorage).
const IDEMPOTENT_COLUMNS=COLUMNS+",storage_path";
function assertSameArchivedPdf(row,{id,path,title,documentType,pageCount,sourceDraftId,fingerprint}){
  if(!row||row.id!==id||row.storage_path!==path||row.title!==title||
     row.document_type!==documentType||row.sha256!==fingerprint.sha256||
     row.byte_size!==fingerprint.byte_size||
     (row.page_count??null)!==pageCount||
     (row.source_draft_id??null)!==sourceDraftId){
    const error=Error("Ce numéro de PDF existe avec un autre contenu. Ne remplacez pas l'original.");
    error.code="PDF_ARCHIVE_ID_CONFLICT";
    throw error;
  }
  return row;
}
async function findArchivedPdf(client,uid,id){
  await verifiedUser(client,uid);
  const q=await client.from("pictau_documents").select(IDEMPOTENT_COLUMNS)
    .eq("owner_id",uid).eq("id",id).maybeSingle();
  if(q.error)throw q.error;
  await verifiedUser(client,uid);
  return q.data||null;
}
// Une ligne SQL peut subsister après la perte/suppression du vrai PDF Storage.
// La ligne seule ne constitue PAS une preuve suffisante de récupération.
async function confirmExistingPdfBytes(client,uid,row,metadata){
  const path=documentPath(uid,metadata.id);
  const confirmed=assertSameArchivedPdf(row,{...metadata,path});
  await verifiedUser(client,uid);
  const result=await client.storage.from(FILES_BUCKET).download(path);
  if(result.error||!result.data){
    const error=Error("L'original PDF est absent du stockage privé. La copie temporaire reste disponible; contactez le support avant de réarchiver.");
    error.code="PDF_ARCHIVE_STORAGE_MISSING";
    throw error;
  }
  let fingerprint;
  try{fingerprint=await validatePdfBlob(result.data);}
  catch{
    const error=Error("L'original PDF stocké ne peut plus être vérifié. Conservez la copie temporaire.");
    error.code="PDF_ARCHIVE_STORAGE_CORRUPT";
    throw error;
  }
  if(fingerprint.sha256!==metadata.fingerprint.sha256||
     fingerprint.byte_size!==metadata.fingerprint.byte_size){
    const error=Error("L'original PDF stocké ne correspond plus au document archivé. Aucun remplacement automatique.");
    error.code="PDF_ARCHIVE_STORAGE_CORRUPT";
    throw error;
  }
  await verifiedUser(client,uid);
  return confirmed;
}
async function archivePdfWithStableId(client,uid,file,metadata){
  const {id,fingerprint}=metadata,path=documentPath(uid,id);
  // D'abord la preuve SQL privée. Si l'accusé de réception initial a été
  // perdu, ne JAMAIS refaire un upload ni créer une nouvelle ligne.
  const known=await findArchivedPdf(client,uid,id);
  if(known)return confirmExistingPdfBytes(client,uid,known,metadata);
  const bucket=client.storage.from(FILES_BUCKET);
  const upload=await bucket.upload(path,file,{
    contentType:"application/pdf",upsert:false,cacheControl:"0"
  });
  if(upload.error){
    // Une réponse d'upload peut être perdue, ou l'objet peut déjà exister.
    // Ne jamais upsert et ne jamais faire confiance à un simple code 409.
    const already=await findArchivedPdf(client,uid,id);
    if(already)return confirmExistingPdfBytes(client,uid,already,metadata);
    const stored=await bucket.download(path);
    if(stored.error||!stored.data)throw upload.error;
    const savedHash=await validatePdfBlob(stored.data);
    if(savedHash.sha256!==fingerprint.sha256||
       savedHash.byte_size!==fingerprint.byte_size){
      const error=Error("Le PDF déjà stocké sous cet identifiant ne correspond pas aux octets originaux.");
      error.code="PDF_ARCHIVE_ID_CONFLICT";
      throw error;
    }
    await verifiedUser(client,uid);
  }
  // Le chemin UID/UUID contient soit le Blob envoyé maintenant, soit les
  // mêmes octets privés contrôlés par SHA-256 après un refus d'upload.
  // Pas de suppression compensatoire ici : un échec SQL ambigu peut masquer
  // un insert COMMIT réussi. L'objet reste récupérable au prochain essai.
  const row=await client.from("pictau_documents").insert({
    id,owner_id:uid,title:metadata.title,document_type:metadata.documentType,
    storage_path:path,...fingerprint,
    ...(metadata.pageCount===null?{}:{page_count:metadata.pageCount}),
    ...(metadata.sourceDraftId===null?{}:{source_draft_id:metadata.sourceDraftId})
  }).select(IDEMPOTENT_COLUMNS).single();
  if(row.error||!row.data){
    const later=await findArchivedPdf(client,uid,id);
    if(later)return confirmExistingPdfBytes(client,uid,later,metadata);
    throw row.error||Error("L'archivage n'a pas été confirmé par le serveur.");
  }
  // La ligne SQL confirmée ne garantit pas les octets privés : relire et
  // vérifier SHA-256, chemin, métadonnées et session avant tout reçu de succès.
  return confirmExistingPdfBytes(client,uid,row.data,metadata);
}
export async function archivePdf(client,uid,file,{title,documentType="routine",pageCount=null,sourceDraftId=null,documentId=null}){
  const cleanTitle=normalizeDocumentTitle(title);
  if(!TYPES.includes(documentType))throw Error("Type de document invalide.");
  if(sourceDraftId!==null&&(!UUID.test(sourceDraftId)||!["routine","board"].includes(documentType)))
    throw Error("Source modifiable de document invalide.");
  if(pageCount!==null&&(!Number.isSafeInteger(pageCount)||pageCount<1||pageCount>100))
    throw Error("Nombre de pages PDF invalide.");
  if(documentId!==null&&!UUID.test(documentId))
    throw Error("Identifiant stable de PDF invalide.");
  // Lire et valider le PDF AVANT d'envoyer des octets vers le stockage.
  const fingerprint=await validatePdfBlob(file);
  await verifiedUser(client,uid);
  if(documentId!==null)return archivePdfWithStableId(client,uid,file,{
    id:documentId,title:cleanTitle,documentType,pageCount,sourceDraftId,fingerprint
  });
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
      storage_path:path,...fingerprint,...(pageCount===null?{}:{page_count:pageCount}),
      ...(sourceDraftId===null?{}:{source_draft_id:sourceDraftId})
    }).select(IDEMPOTENT_COLUMNS).single();
    if(row.error)throw row.error;
    if(!row.data)throw Error("L'archivage n'a pas été confirmé par le serveur.");
    // Même avec un UUID généré ici, le retour SQL seul ne prouve pas
    // que le vrai PDF privé existe encore ni que ses octets sont intacts.
    // Unifier les garanties avec le parcours à identifiant stable.
    return confirmExistingPdfBytes(client,uid,row.data,{
      id,title:cleanTitle,documentType,pageCount,sourceDraftId,fingerprint
    });
  }catch(error){
    // Un échec réseau après INSERT ne signifie pas que la transaction a échoué.
    // Ne JAMAIS effacer ce PDF privé : une ligne SQL peut déjà le référencer,
    // et un nettoyage compensatoire détruirait alors l'original du client.
    // Ne pas confirmer l'archivage : une vérification/reprise explicite est requise.
    throw error;
  }
}
export async function listMyDocuments(client,uid,{page=0,query="",type="all",sort="recent",period="all",source="all"}={}){
  if(!Number.isSafeInteger(page)||page<0||page>100000)throw Error("Page invalide.");
  const search=normalizeDocumentSearch(query);
  if(type!=="all"&&!TYPES.includes(type))throw Error("Filtre invalide.");
  const order=DOCUMENT_SORT_ORDER[normalizeDocumentSort(sort)];
  const periodStart=documentPeriodStart(period);
  const sourceMode=normalizeDocumentSourceFilter(source);
  await verifiedUser(client,uid);
  let q=client.from("pictau_documents").select(COLUMNS,{count:"exact"}).eq("owner_id",uid);
  if(type!=="all")q=q.eq("document_type",type);
  // Filtrer sur le serveur avant COUNT/ORDER/RANGE; la RLS propriétaire reste
  // appliquée, sans accéder à un autre brouillon ni supposer son existence.
  if(sourceMode==="linked")q=q.not("source_draft_id","is",null);
  else if(sourceMode==="unlinked")q=q.is("source_draft_id",null);
  // %, _ et antislash dans un titre sont du texte, jamais des jokers SQL.
  if(search)q=q.ilike("title","%"+search.replace(/[\\%_]/g,character=>"\\"+character)+"%");
  if(periodStart)q=q.gte("created_at",periodStart);
  const result=await q.order(order[0],{ascending:order[1]}).order("id",{ascending:true})
    .range(page*DOCUMENTS_PAGE_SIZE,(page+1)*DOCUMENTS_PAGE_SIZE-1);
  if(result.error)throw result.error;
  if(!Number.isSafeInteger(result.count)||result.count<0)throw Error("Décompte des fichiers indisponible.");
  // Une réponse absente ou contradictoire ne prouve jamais que le dossier est vide.
  // Ne masquer ni une panne PostgREST ni une mutation simultanée par data || [].
  if(!Array.isArray(result.data))throw Error("Réponse de la liste des fichiers invalide.");
  if(result.data.length>DOCUMENTS_PAGE_SIZE||result.data.length>result.count||
    (page*DOCUMENTS_PAGE_SIZE>=result.count&&result.data.length>0))
    throw Error("Pagination des fichiers incohérente. Actualisez la liste.");
  await verifiedUser(client,uid);
  return{items:result.data,total:result.count,page};
}
// Une suppression sur un autre appareil peut rendre la page courante vide alors
// qu'il reste des PDF. Revenir au dernier feuillet réellement disponible.
export function lastDocumentPage(total){
  if(!Number.isSafeInteger(total)||total<0)throw Error("Décompte des fichiers indisponible.");
  return Math.max(0,Math.ceil(total/DOCUMENTS_PAGE_SIZE)-1);
}
export async function listMyDocumentsAvailablePage(client,uid,filters={}){
  let page=filters.page??0;
  if(!Number.isSafeInteger(page)||page<0||page>100000)throw Error("Page invalide.");
  // Les résultats sont toujours obtenus via les contrôles Auth et RLS du service
  // initial. Limiter les relectures si un autre appareil modifie la liste sans cesse.
  for(let attempt=0;attempt<3;attempt++){
    const result=await listMyDocuments(client,uid,{...filters,page});
    const last=lastDocumentPage(result.total);
    if(result.total===0)return {...result,page:0};
    if(page>last){page=last;continue;}
    // Le compteur et la page peuvent être issus de deux états différents
    // pendant une suppression ou un ajout concurrent. Ne jamais présenter
    // une page partielle comme un historique PDF complet.
    const expected=Math.min(DOCUMENTS_PAGE_SIZE,result.total-page*DOCUMENTS_PAGE_SIZE);
    if(result.items.length===expected)return {...result,page};
  }
  throw Error("La liste a changé sur un autre appareil. Actualisez vos fichiers.");
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
// Lire le lien privé à chaque étape critique : une liste affichée et une
// lecture initiale peuvent être périmées après un changement sur un appareil.
async function assertCurrentDocumentSource(client,uid,id,sourceId,kind){
  const q=await client.from("pictau_documents")
    .select("id,owner_id,document_type,source_draft_id")
    .eq("owner_id",uid).eq("id",id).maybeSingle();
  if(q.error)throw q.error;
  const row=q.data;
  if(!row||row.id!==id||row.owner_id!==uid||
     row.source_draft_id!==sourceId||row.document_type!==kind)
    throw Error("La source liée à ce PDF a changé ou n'est plus disponible. Actualisez Mes fichiers.");
}
// Duplique la source actuelle, sans modifier le PDF original ou sa source.
// En l'absence de transaction serveur atomique, revérifier au plus près de
// l'INSERT réduit les courses réseau sans prétendre les éliminer entièrement.
export async function duplicateMyDocumentSource(client,uid,id,{sourceId,kind,language="fr"}={}){
  documentPath(uid,id);
  if(!UUID.test(sourceId||"")||!["routine","board"].includes(kind))
    throw Error("Source modifiable du PDF invalide.");
  if(!["fr","en"].includes(language))throw Error("Langue du brouillon invalide.");
  await verifiedUser(client,uid);
  await assertCurrentDocumentSource(client,uid,id,sourceId,kind);
  await verifiedUser(client,uid);
  // INSERT privé dans Mes brouillons uniquement; aucun UPDATE/DELETE de PDF.
  return duplicateEditableDraft(client,uid,sourceId,{
    language,expectedKind:kind,
    beforeInsert:async(source)=>{
      await verifiedUser(client,uid);
      await assertCurrentDocumentSource(client,uid,id,sourceId,kind);
      // La source peut avoir été modifiée, supprimée ou remplacée entre
      // deux lectures; ne pas copier silencieusement une ancienne révision.
      const latest=await loadEditableDraft(client,uid,sourceId);
      if(latest.revision!==source.revision||latest.kind!==source.kind)
        throw Error("Le brouillon source a changé sur un autre appareil. Actualisez Mes fichiers.");
    }
  });
}

export async function renameMyDocument(client,uid,id,oldTitle,newTitle){
  documentPath(uid,id);
  const clean=normalizeDocumentTitle(newTitle),previous=normalizeDocumentTitle(oldTitle);
  await verifiedUser(client,uid);
  if(clean===previous){
    // Même sans changement de titre, ne pas annoncer de succès pour un PDF
    // supprimé, renommé ailleurs ou devenu inaccessible entre deux appareils.
    const current=await client.from("pictau_documents").select("id,title")
      .eq("id",id).eq("owner_id",uid).maybeSingle();
    if(current.error)throw current.error;
    if(current.data?.id!==id||current.data.title!==clean)
      throw Error("Le document a changé. Actualisez la liste.");
    await verifiedUser(client,uid);
    return{changed:false,title:clean};
  }
  const r=await client.from("pictau_documents").update({title:clean}).eq("id",id)
    .eq("owner_id",uid).eq("title",previous).select("id,title").maybeSingle();
  if(r.error)throw r.error;
  if(r.data?.id!==id||r.data.title!==clean)throw Error("Le document a changé. Actualisez la liste.");
  await verifiedUser(client,uid);
  return{changed:true,title:clean};
}
