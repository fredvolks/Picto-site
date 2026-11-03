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

// Retire uniquement les choix de la page affichée : ceux des autres pages
// restent intacts. Aucun accès Storage ou mutation de composition.
export function removeVisibleCatalogPage(current,visibleRows){
  if(!(current instanceof Map)||current.size>MAX_CATALOG_CHOICES||
    !Array.isArray(visibleRows)||visibleRows.length>CATALOG_PAGE_SIZE||
    visibleRows.some(row=>!UUID.test(row?.id||"")))
    throw Error("Sélection de la bibliothèque invalide.");
  const selected=new Map(current);
  let removed=0;
  for(const row of visibleRows){
    if(selected.delete(row.id))removed++;
  }
  return {selected,removed};
}

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PNG_MAGIC=[137,80,78,71,13,10,26,10];
const MAX_BYTES=6*1024*1024;
const FIELDS="id,title_fr,title_en,theme,image_path,published_at";
function cleanQuery(s){
  if(typeof s!=="string"||s.length>80||!/^[\p{L}\p{N} '’\-]*$/u.test(s))
    throw Error("Recherche de pictogrammes invalide.");
  return s.trim().replace(/\s+/g," ");
}
// Recherche côté serveur AVANT count/pagination : chaque mot peut figurer dans
// le nom FR ou EN, indépendamment de son ordre. Tous les mots sont requis.
// Les deux graphies de l'apostrophe française sont équivalentes pour chercher.
// Les caractères de syntaxe PostgREST (% , . ( ) _) restent refusés par cleanQuery.
function catalogNameSearchExpression(search){
  const groups=search.split(" ").map(word=>{
    const variants=[...new Set([word,word.replace(/'/g,"’"),word.replace(/’/g,"'")])];
    return variants.flatMap(term=>[
      "title_fr.ilike.%"+term+"%","title_en.ilike.%"+term+"%"
    ]).join(",");
  });
  return groups.length===1?groups[0]:
    "and("+groups.map(group=>"or("+group+")").join(",")+")";
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
// Le schéma L2 actuel contient la catégorie PRINCIPALE sur chaque fiche
// publiée. La future projection multicatégorie peut ne pas être installée.
// Repli borné à une erreur PostgREST de relation MANQUANTE, jamais à une
// erreur d'autorisation, de réseau ou de réponse incohérente.
function missingPublishedThemeRelation(error){
  return error?.code==="PGRST200"&&
    String(error?.message||"").includes("pictau_published_theme_links");
}

export async function listPublishedCatalog(client,uid,filters={}){
  const f=normalizeCatalogFilters(filters);
  await verified(client,uid);
  const byTheme=f.theme!=="all";
  const sortField=f.sort==="recent"?"published_at":f.language==="en"?"title_en":"title_fr";
  const sortOptions=f.sort!=="recent"&&f.language==="en"
    ?{ascending:f.sort==="name",nullsFirst:false}:{ascending:f.sort==="name"};
  const fetchPage=primaryOnly=>{
    // Seule la table des PNG PUBLIÉS est interrogée. Un retour au thème
    // principal n'ouvre aucun accès à pictau_assets ni aux brouillons.
    const selection=byTheme&&!primaryOnly?
      FIELDS+",published_filter:pictau_published_theme_links!inner()":FIELDS;
    let q=client.from("pictau_catalog_items").select(selection,{count:"exact"});
    if(byTheme)q=q.eq(primaryOnly?"theme":"published_filter.theme_code",f.theme);
    if(f.query)q=q.or(catalogNameSearchExpression(f.query));
    return q.order(sortField,sortOptions).order("id",{ascending:true})
      .range(f.page*CATALOG_PAGE_SIZE,(f.page+1)*CATALOG_PAGE_SIZE-1);
  };
  let r=await fetchPage(false),categoryCoverage="all";
  if(r.error&&byTheme&&missingPublishedThemeRelation(r.error)){
    // La première réponse peut être survenue après déconnexion ou révocation.
    // Valider la session AVANT la seconde requête sur la projection publique.
    await verified(client,uid);
    r=await fetchPage(true);
    categoryCoverage="primary";
  }
  if(r.error)throw r.error;
  if(!Number.isSafeInteger(r.count)||r.count<0)throw Error("Catalogue indisponible.");
  if(!Array.isArray(r.data))throw Error("Réponse du catalogue invalide. Actualisez les pictogrammes.");
  const items=byTheme&&categoryCoverage==="all"?
    r.data.map(({published_filter:_links,...item})=>item):r.data;
  if(items.length>CATALOG_PAGE_SIZE||items.length>r.count||
     (f.page*CATALOG_PAGE_SIZE>=r.count&&items.length>0))
    throw Error("Pagination du catalogue incohérente. Actualisez les pictogrammes.");
  if(items.some(item=>!validRow(item)))
    throw Error("Une fiche publiée ne correspond pas au stockage approuvé.");
  await verified(client,uid);
  return {items,total:r.count,page:f.page,categoryCoverage};
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
    if(result.total===0)return {...result,page:0};
    if(page>last){page=last;continue;}
    // Total positif + page existante + zéro fiche : résultat transitoire
    // possible après mutation ou panne. Relire au plus trois fois sans
    // jamais transformer cette incohérence en « bibliothèque vide ».
    // Une page non finale doit avoir CATALOG_PAGE_SIZE résultats. En cas de
    // retrait concurrent, ne pas afficher une page silencieusement tronquée.
    const expected=Math.min(CATALOG_PAGE_SIZE,result.total-page*CATALOG_PAGE_SIZE);
    if(result.items.length===expected)return {...result,page};
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

// Le téléchargement et la copie privée peuvent durer. Relire la fiche
// exactement avant l'INSERT : aucun libellé/thème issu d'une ancienne vue ne
// doit devenir le catalogue d'un autre changement Super Admin. Ceci n'est
// pas une transaction inter-comptes : les règles SQL/RLS restent l'autorité.
async function verifyReviewedDraftStillCurrent(client,uid,expected){
 await requireAdmin(client,uid);
 const r=await client.from("pictau_assets")
   .select("id,title_fr,title_en,theme,status").eq("id",expected.id).maybeSingle();
 if(r.error)throw r.error;
 const live=r.data;
 if(!live||live.id!==expected.id||live.status!=="draft"||
    live.title_fr!==expected.title_fr||
    (live.title_en??null)!==(expected.title_en??null)||
    live.theme!==expected.theme)
   throw Error("Ce brouillon a été modifié sur un autre appareil. Actualisez la fiche avant publication.");
 await requireAdmin(client,uid);
}

// Refuser un thème primaire absent ou déjà fusionné AVANT de copier un PNG
// dans le bucket approuvé. Les anciens brouillons de test peuvent porter un
// thème syntaxiquement valable mais absent du registre des catégories.
async function requireCanonicalPublicationTheme(client,uid,theme){
  if(typeof theme!=="string"||!/^[a-z][a-z0-9_-]{0,59}$/.test(theme))
    throw Error("Catégorie invalide : choisissez un thème actif dans la Banque.");
  await requireAdmin(client,uid);
  const r=await client.from("pictau_themes")
    .select("code,merged_into").eq("code",theme).maybeSingle();
  if(r.error)throw r.error;
  if(!r.data||r.data.code!==theme||r.data.merged_into!==null)
    throw Error("Cette catégorie est absente ou fusionnée. Choisissez une catégorie active avant de publier.");
  await requireAdmin(client,uid);
}

// L'approbation manuelle doit porter sur le PNG et les libellés vraiment
// affichés dans la fiche Super Admin. Une nouvelle relecture après le clic
// ne suffit pas si le PNG avait déjà changé avant ce clic.
export async function publishReviewedPictogram(client,uid,assetId,reviewed){
  if(!UUID.test(assetId||""))throw Error("Identifiant invalide.");
  await requireAdmin(client,uid);
  if(!reviewed||reviewed.id!==assetId||reviewed.status!=="draft"||
     typeof reviewed.title_fr!=="string"||!reviewed.title_fr.trim()||
     typeof reviewed.theme!=="string"||!reviewed.theme.trim()||
     !(reviewed.blob instanceof Blob))
    throw Error("Aperçu approuvé absent : ouvrez de nouveau la fiche et vérifiez le PNG.");
  const source=await loadPrivateAdminPreview(client,uid,assetId);
  if(source.asset.status!=="draft")throw Error("Seul un brouillon peut être approuvé.");
  if(source.asset.title_fr!==reviewed.title_fr||
     (source.asset.title_en??null)!==(reviewed.title_en??null)||
     source.asset.theme!==reviewed.theme)
    throw Error("Les libellés ou le thème ont changé depuis la revue. Rouvrez la fiche avant publication.");
  const sourceDigest=await pngDigest(source.blob);
  const reviewedDigest=await pngDigest(reviewed.blob);
  if(source.blob.size!==reviewed.blob.size||sourceDigest!==reviewedDigest)
    throw Error("L'image PNG a changé depuis l'aperçu. Rouvrez la fiche avant publication.");
  // Un brouillon historique mal classé ne doit jamais atteindre Storage approuvé.
  await requireCanonicalPublicationTheme(client,uid,source.asset.theme);
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
  // Après l'upload (ou sa reprise), ne pas publier des métadonnées périmées.
  // Sur erreur, garder la copie PNG privée pour une reprise contrôlée.
  await verifyReviewedDraftStillCurrent(client,uid,source.asset);
  // Un autre admin peut fusionner le thème pendant l'upload; revalider avant SQL.
  await requireCanonicalPublicationTheme(client,uid,source.asset.theme);
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
