// Catalogue OFFICIEL Pict-au : seulement les PNG approuvés par un Super Admin.
// La banque des brouillons et les PDF personnels restent dans leurs buckets privés.
import {loadPrivateAdminPreview} from "./admin-preview.js";

export const CATALOG_BUCKET="pictau-approved";
export const CATALOG_PAGE_SIZE=24;
export const MAX_CATALOG_CHOICES=16;
// Choix locaux des vraies fiches publiées; chaque ajout est revérifié au
// serveur avec loadApprovedSelection avant de toucher à la composition.
export function toggleCatalogChoice(current,id,visibleRows){
  if(!(current instanceof Map)||current.size>MAX_CATALOG_CHOICES||
     !Array.isArray(visibleRows)||!UUID.test(id||""))
    throw Error("Sélection de la bibliothèque invalide.");
  const row=visibleRows.find(item=>item?.id===id);
  if(!row||!validRow(row))throw Error("Ce pictogramme n'est plus disponible. Actualisez la bibliothèque.");
  const next=new Map(current);
  if(next.has(id))next.delete(id);
  else{
    if(next.size>=MAX_CATALOG_CHOICES)throw Error("Maximum de 16 pictogrammes sélectionnés.");
    next.set(id,{...row});
  }
  return next;
}

// Sélection de la page visible du catalogue authentifié, sans lecture de
// brouillons ni mutation de composition. Les ID seront revérifiés AVANT ajout.
// La bibliothèque montre 24 fiches par page, mais un support admet 16 choix.
export function selectVisibleCatalogPage(current,visibleRows){
  if(!(current instanceof Map)||current.size>MAX_CATALOG_CHOICES||
    !Array.isArray(visibleRows)||visibleRows.length>CATALOG_PAGE_SIZE)
    throw Error("Sélection de la bibliothèque invalide.");
  // Valider toute la réponse avant de remplir les places disponibles :
  // un élément incorrect ne doit jamais entraîner une sélection partielle.
  if(visibleRows.some(row=>!validRow(row)))
    throw Error("La page contient un pictogramme indisponible. Actualisez la bibliothèque.");
  const selected=new Map(current);
  let added=0,capacityReached=false;
  for(const row of visibleRows){
    if(selected.has(row.id))continue;
    if(selected.size>=MAX_CATALOG_CHOICES){capacityReached=true;break;}
    selected.set(row.id,{...row});added++;
  }
  return {selected,added,capacityReached};
}

// Déplace un vrai pictogramme déjà choisi, sans le remplacer ni relire le réseau.
// L'ordre de Map est l'ordre transmis à la routine / au tableau après contrôle RLS.
// Ne modifie pas les données de publication, y compris les choix sur d'autres pages.
export function moveCatalogChoice(current,id,direction){
  if(!(current instanceof Map)||current.size>MAX_CATALOG_CHOICES||
     !UUID.test(id||"")||![-1,1].includes(direction)||
     [...current].some(([key,row])=>key!==row?.id||!validRow(row)))
    throw Error("Ordre de la sélection invalide.");
  const entries=[...current.entries()],from=entries.findIndex(([key])=>key===id);
  if(from<0)throw Error("Pictogramme absent de la sélection.");
  const to=from+direction;
  if(to<0||to>=entries.length)return new Map(entries);
  [entries[from],entries[to]]=[entries[to],entries[from]];
  return new Map(entries);
}

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
export function normalizeCatalogFilters({query="",theme="all",sort="recent",page=0,language="fr"}={}){
  const search=cleanQuery(query);
  if(theme!=="all"&&(typeof theme!=="string"||!/^[a-z0-9][a-z0-9_-]{0,59}$/.test(theme)))
    throw Error("Catégorie invalide.");
  if(!["recent","name","name_desc"].includes(sort))throw Error("Tri du catalogue invalide.");
  if(!["fr","en"].includes(language))throw Error("Langue du catalogue invalide.");
  if(!Number.isSafeInteger(page)||page<0||page>100000)throw Error("Page invalide.");
  return {query:search,theme,sort,page,language};
}
export async function listPublishedCatalog(client,uid,filters={}){
  const f=normalizeCatalogFilters(filters);
  await verified(client,uid);
  let q=client.from("pictau_catalog_items").select(FIELDS,{count:"exact"});
  if(f.theme!=="all")q=q.eq("theme",f.theme);
  if(f.query)q=q.or("title_fr.ilike.%"+f.query+"%,title_en.ilike.%"+f.query+"%");
  // Le serveur trie AVANT la pagination; traductions anglaises manquantes en dernier.
  const sortField=f.sort==="recent"?"published_at":f.language==="en"?"title_en":"title_fr";
  const sortOptions=f.sort!=="recent"&&f.language==="en"
    ?{ascending:f.sort==="name",nullsFirst:false}:{ascending:f.sort==="name"};
  const r=await q.order(sortField,sortOptions).order("id",{ascending:true})
    .range(f.page*CATALOG_PAGE_SIZE,(f.page+1)*CATALOG_PAGE_SIZE-1);
  if(r.error)throw r.error;
  if(!Number.isSafeInteger(r.count)||r.count<0)throw Error("Catalogue indisponible.");
  const items=r.data||[];
  if(!Array.isArray(items)||items.some(item=>!validRow(item)))
    throw Error("Une fiche publiée ne correspond pas au stockage approuvé.");
  await verified(client,uid);
  return {items,total:r.count,page:f.page};
}
// Si des pictogrammes sont dépubliés entre deux visites, le dernier feuillet
// visible peut ne plus exister. Le catalogue canonique reste la seule source
// sous Auth/RLS; les sélections et les supports ne sont jamais modifiés ici.
export function lastPublishedCatalogPage(total){
  if(!Number.isSafeInteger(total)||total<0)throw Error("Catalogue indisponible.");
  return Math.max(0,Math.ceil(total/CATALOG_PAGE_SIZE)-1);
}
export async function listPublishedCatalogAvailablePage(client,uid,filters={}){
  let page=filters.page??0;
  if(!Number.isSafeInteger(page)||page<0||page>100000)throw Error("Page invalide.");
  // Borne stricte : une dépublication continue ne doit jamais causer de boucle.
  for(let attempt=0;attempt<3;attempt++){
    const result=await listPublishedCatalog(client,uid,{...filters,page});
    const last=lastPublishedCatalogPage(result.total);
    if(page<=last)return {...result,page};
    if(result.total===0)return {...result,page:0};
    page=last;
  }
  throw Error("Le catalogue a changé. Actualisez les pictogrammes.");
}
// Relecture autorisée juste avant export : une sélection retirée ne devient jamais imprimable.
export async function loadApprovedSelection(client,uid,ids){
  if(!Array.isArray(ids)||!ids.length||ids.length>16||
    ids.some(id=>typeof id!=="string"||!UUID.test(id)))
    throw Error("Sélection de pictogrammes invalide.");
  const unique=[...new Set(ids)];
  await verified(client,uid);
  const query=await client.from("pictau_catalog_items").select(FIELDS).in("id",unique);
  if(query.error)throw query.error;
  if(!Array.isArray(query.data)||query.data.length!==unique.length||query.data.some(r=>!validRow(r)))
    throw Error("Un pictogramme n'est plus approuvé. Actualisez votre sélection.");
  const byId=new Map(query.data.map(r=>[r.id,r]));
  if(byId.size!==unique.length||ids.some(id=>!byId.has(id)))
    throw Error("Un pictogramme a été retiré. Actualisez votre sélection.");
  await verified(client,uid);
  return ids.map(id=>byId.get(id));
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
// Preuve de publication : un reçu SQL seul n'atteste jamais le vrai PNG privé.
// Calcul identique avant copie et après relecture, sans lien public permanent.
async function pngDigest(blob){
  await checkPng(blob);
  if(typeof crypto==="undefined"||!crypto.subtle)
    throw Error("Vérification cryptographique PNG indisponible : HTTPS requis.");
  const bytes=new Uint8Array(await crypto.subtle.digest("SHA-256",await blob.arrayBuffer()));
  return Array.from(bytes,b=>b.toString(16).padStart(2,"0")).join("");
}
async function confirmApprovedPublication(client,uid,assetId,source,sourceDigest,sourceSize){
  await requireAdmin(client,uid);
  const q=await client.from("pictau_catalog_items").select(FIELDS).eq("id",assetId).maybeSingle();
  if(q.error)throw q.error;
  const row=q.data;
  if(!row)return null;
  if(!validRow(row)||row.id!==assetId||row.title_fr!==source.title_fr||
     (row.title_en??null)!==(source.title_en||null)||row.theme!==source.theme||
     typeof row.published_at!=="string"||!row.published_at.trim())
    throw Error("La fiche publiée ne correspond pas au pictogramme approuvé. Vérification manuelle requise.");
  await requireAdmin(client,uid);
  const actual=await client.storage.from(CATALOG_BUCKET).download("items/"+assetId+".png");
  if(actual.error||!actual.data)
    throw Error("PNG approuvé absent du stockage privé. Publication non confirmée.");
  if(actual.data.size!==sourceSize||await pngDigest(actual.data)!==sourceDigest)
    throw Error("Intégrité du PNG approuvé non confirmée. Aucun remplacement automatique.");
  await requireAdmin(client,uid);
  return row;
}

// Publication UNIQUEMENT après un clic de revue manuelle explicite Super Admin.
export async function publishReviewedPictogram(client,uid,assetId){
  if(!UUID.test(assetId||""))throw Error("Identifiant invalide.");
  await requireAdmin(client,uid);
  const source=await loadPrivateAdminPreview(client,uid,assetId);
  if(source.asset.status!=="draft")throw Error("Seul un brouillon peut être approuvé.");
  const sourceDigest=await pngDigest(source.blob);
  await requireAdmin(client,uid);
  const path="items/"+assetId+".png",bucket=client.storage.from(CATALOG_BUCKET);
  const uploaded=await bucket.upload(path,source.blob,{contentType:"image/png",cacheControl:"0",upsert:false});
  if(uploaded.error){
    // Upload 409, ACK Storage perdu ou panne : il peut déjà exister une
    // publication complète. Ne pas publier à l'aveugle et ne pas faire upsert.
    const previouslyPublished=await confirmApprovedPublication(client,uid,assetId,
      source.asset,sourceDigest,source.blob.size);
    if(previouslyPublished)return previouslyPublished;
    // Un INSERT précédemment refusé peut avoir laissé seulement la copie PNG
    // privée. La réutiliser UNIQUEMENT si les octets correspondent exactement.
    const stored=await bucket.download(path);
    if(stored.error||!stored.data)throw uploaded.error;
    const storedDigest=await pngDigest(stored.data);
    if(stored.data.size!==source.blob.size||storedDigest!==sourceDigest)
      throw Error("Conflit de pictogramme : le PNG privé existant n'est pas identique. Aucun remplacement.");
    await requireAdmin(client,uid);
  }
  let insertError=null;
  try{
    await requireAdmin(client,uid);
    const r=await client.from("pictau_catalog_items").insert({
      id:assetId,title_fr:source.asset.title_fr,title_en:source.asset.title_en||null,
      theme:source.asset.theme,image_path:path,published_by:uid
    }).select(FIELDS).single();
    if(r.error)insertError=r.error;
    else if(!r.data)insertError=Error("L'approbation n'a pas été confirmée.");
  }catch(error){insertError=error;}
  // Une erreur INSERT peut être une réponse perdue après COMMIT. On ne
  // supprime JAMAIS ici le PNG : une ligne publiée peut déjà le référencer.
  // Même en cas de réussite SQL, relire la fiche ET les octets privés.
  const confirmed=await confirmApprovedPublication(client,uid,assetId,
    source.asset,sourceDigest,source.blob.size);
  if(confirmed)return confirmed;
  throw insertError||Error("L'approbation n'a pas été confirmée. PNG privé conservé pour vérification.");
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
