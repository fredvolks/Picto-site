// Catalogue OFFICIEL Pict-au : seulement les PNG approuvés par un Super Admin.
// La banque des brouillons et les PDF personnels restent dans leurs buckets privés.
import {loadPrivateAdminPreview} from "./admin-preview.js";

export const CATALOG_BUCKET="pictau-approved";
export const CATALOG_PAGE_SIZE=24;
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PNG_MAGIC=[137,80,78,71,13,10,26,10];
const MAX_BYTES=6*1024*1024;
const FIELDS="id,title_fr,title_en,theme,image_path,published_at";
function cleanQuery(s){
  if(typeof s!=="string"||s.length>80||!/^[\p{L}\p{N} '\-]*$/u.test(s))
    throw Error("Recherche de pictogrammes invalide.");
  return s.trim().replace(/\s+/g," ");
}
function validRow(row){
  return row&&UUID.test(row.id)&&row.image_path==="items/"+row.id+".png"
    &&typeof row.title_fr==="string"&&row.title_fr.trim().length>0
    &&typeof row.theme==="string"&&/^[a-z0-9][a-z0-9_-]{0,59}$/.test(row.theme);
}
async function verified(client,uid){
  if(!UUID.test(uid||""))throw Error("Session requise.");
  const r=await client.auth.getUser();
  if(r.error)throw r.error;
  if(r.data?.user?.id!==uid)throw Error("La session a changé.");
}
async function requireAdmin(client,uid){
  await verified(client,uid);
  const r=await client.from("pictau_admins").select("user_id").eq("user_id",uid).maybeSingle();
  if(r.error)throw r.error;
  if(r.data?.user_id!==uid)throw Error("Accès Super Admin refusé.");
}
async function checkPng(blob){
  if(!blob||typeof blob.size!=="number"||typeof blob.slice!=="function"||
    blob.size<33||blob.size>MAX_BYTES)throw Error("Image PNG invalide ou trop volumineuse.");
  if(blob.type&&blob.type!=="image/png"&&blob.type!=="application/octet-stream")
    throw Error("Seul le format PNG est accepté.");
  const sig=new Uint8Array(await blob.slice(0,8).arrayBuffer());
  if(PNG_MAGIC.some((b,i)=>sig[i]!==b))throw Error("Signature PNG invalide.");
}
export function normalizeCatalogFilters({query="",theme="all",page=0}={}){
  const search=cleanQuery(query);
  if(theme!=="all"&&(typeof theme!=="string"||!/^[a-z0-9][a-z0-9_-]{0,59}$/.test(theme)))
    throw Error("Catégorie invalide.");
  if(!Number.isSafeInteger(page)||page<0||page>100000)throw Error("Page invalide.");
  return {query:search,theme,page};
}
export async function listPublishedCatalog(client,uid,filters={}){
  const f=normalizeCatalogFilters(filters);
  await verified(client,uid);
  let q=client.from("pictau_catalog_items").select(FIELDS,{count:"exact"});
  if(f.theme!=="all")q=q.eq("theme",f.theme);
  if(f.query)q=q.or("title_fr.ilike.%"+f.query+"%,title_en.ilike.%"+f.query+"%");
  const r=await q.order("published_at",{ascending:false}).order("id",{ascending:true})
    .range(f.page*CATALOG_PAGE_SIZE,(f.page+1)*CATALOG_PAGE_SIZE-1);
  if(r.error)throw r.error;
  if(!Number.isSafeInteger(r.count)||r.count<0)throw Error("Catalogue indisponible.");
  const items=r.data||[];
  if(!Array.isArray(items)||items.some(item=>!validRow(item)))
    throw Error("Une fiche publiée ne correspond pas au stockage approuvé.");
  await verified(client,uid);
  return {items,total:r.count,page:f.page};
}
export async function downloadPublishedArtwork(client,uid,row){
  if(!validRow(row))throw Error("Fiche publiée invalide.");
  await verified(client,uid);
  const r=await client.storage.from(CATALOG_BUCKET).download(row.image_path);
  if(r.error)throw r.error;
  await checkPng(r.data);
  await verified(client,uid);
  return r.data;
}
// Publication UNIQUEMENT après un clic de revue manuelle explicite Super Admin.
export async function publishReviewedPictogram(client,uid,assetId){
  if(!UUID.test(assetId||""))throw Error("Identifiant invalide.");
  await requireAdmin(client,uid);
  const source=await loadPrivateAdminPreview(client,uid,assetId);
  if(source.asset.status!=="draft")throw Error("Seul un brouillon peut être approuvé.");
  await checkPng(source.blob);
  await requireAdmin(client,uid);
  const path="items/"+assetId+".png",bucket=client.storage.from(CATALOG_BUCKET);
  const uploaded=await bucket.upload(path,source.blob,{contentType:"image/png",cacheControl:"0",upsert:false});
  if(uploaded.error)throw uploaded.error;
  try{
    await requireAdmin(client,uid);
    const r=await client.from("pictau_catalog_items").insert({
      id:assetId,title_fr:source.asset.title_fr,title_en:source.asset.title_en||null,
      theme:source.asset.theme,image_path:path,published_by:uid
    }).select(FIELDS).single();
    if(r.error)throw r.error;
    if(!validRow(r.data)||r.data.id!==assetId)throw Error("L'approbation n'a pas été confirmée.");
    await requireAdmin(client,uid);
    return r.data;
  }catch(err){
    try{await requireAdmin(client,uid);await bucket.remove([path]);}
    catch{/* Copie orpheline illisible par un client sans fiche approuvée. */}
    throw err;
  }
}

// Le retrait coupe l'accès client immédiatement (RLS) avant le nettoyage du PNG privé.
export async function unpublishReviewedPictogram(client,uid,assetId){
  if(!UUID.test(assetId||""))throw Error("Identifiant invalide.");
  await requireAdmin(client,uid);
  const r=await client.from("pictau_catalog_items").delete().eq("id",assetId).select("id,image_path").maybeSingle();
  if(r.error)throw r.error;
  if(!r.data||r.data.id!==assetId||r.data.image_path!=="items/"+assetId+".png")
    throw Error("Fiche approuvée introuvable : actualisez la banque.");
  // Le trigger SQL rétablit le statut draft dans la MÊME transaction.
  await requireAdmin(client,uid);
  const removed=await client.storage.from(CATALOG_BUCKET).remove([r.data.image_path]);
  if(removed.error)throw new Error("Publication retirée, mais nettoyage du PNG à vérifier par un administrateur.");
  return{unpublished:true,id:assetId};
}
