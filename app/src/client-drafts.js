// Brouillons de routines/tableaux privés par compte : distincts des PDF immuables.
// Le serveur/Postgres est la source de vérité; aucune copie sensible dans localStorage.
export const EDITABLE_DRAFTS_TABLE="pictau_editable_drafts";
export const MAX_EDITABLE_DRAFTS=30;
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const KINDS=["routine","board"];
const COLUMNS="id,kind,title,content,revision,created_at,updated_at";

async function authorized(client,uid){
  if(!UUID.test(uid||""))throw Error("Connectez-vous pour gérer vos brouillons.");
  const {data,error}=await client.auth.getUser();
  if(error)throw error;
  if(data?.user?.id!==uid)throw Error("Session modifiée ou expirée.");
}
function titleOf(v){
  if(typeof v!=="string"||/[\p{C}]/u.test(v))throw Error("Titre de brouillon invalide.");
  const title=v.trim().replace(/\s+/g," ");
  if(!title||title.length>120)throw Error("Le nom doit contenir de 1 à 120 caractères.");
  return title;
}
function snapshotItem(item){
  if(!item||!UUID.test(item.id||"")||typeof item.title_fr!=="string"||
    !item.title_fr.trim()||item.title_fr.length>100||
    (item.title_en!=null&&(typeof item.title_en!=="string"||item.title_en.length>100))||
    typeof item.image_path!=="string"||item.image_path!=="items/"+item.id+".png"||
    typeof item.theme!=="string"||!/^[a-z0-9][a-z0-9_-]{0,59}$/.test(item.theme))
    throw Error("Pictogramme de brouillon invalide.");
  const label=item.customLabel;
  if(label!=null&&(typeof label!=="string"||label.length>48||/[\p{C}]/u.test(label)))
    throw Error("Libellé personnalisé invalide.");
  return {id:item.id,title_fr:item.title_fr,title_en:item.title_en||null,theme:item.theme,
    image_path:item.image_path,customLabel:typeof label==="string"&&label.trim()?label.trim():null};
}
// Aperçu en lecture seule : conserver l'ordre exact des pictogrammes sauvegardés.
// Les données proviennent uniquement d'une liste privée déjà validée sous Auth/RLS.
export function summarizeEditableDraftItems(draft,language="fr"){
  if(!["fr","en"].includes(language)||!KINDS.includes(draft?.kind)||
     !Array.isArray(draft?.content?.items)||
     draft.content.items.length>(draft.kind==="routine"?10:16))
    throw Error("Aperçu de brouillon invalide.");
  const labels=draft.content.items.map(item=>{
    if(!item||typeof item.title_fr!=="string"||!item.title_fr.trim()||
       (item.title_en!=null&&typeof item.title_en!=="string")||
       (item.customLabel!=null&&typeof item.customLabel!=="string"))
      throw Error("Pictogramme de brouillon invalide.");
    return item.customLabel?.trim()||
      (language==="en"?item.title_en?.trim():null)||item.title_fr.trim();
  });
  return {count:labels.length,labels};
}

export function normalizeEditableDraft({kind,items,settings}){
  if(!KINDS.includes(kind)||!Array.isArray(items)||items.length>(kind==="routine"?10:16)||
    !settings||typeof settings!=="object")throw Error("Composition de brouillon invalide.");
  const defaultTitle=kind==="routine"?"Ma routine":"Mon tableau";
  const title=titleOf(settings.title===null||settings.title===undefined?defaultTitle:settings.title);
  const widthCm=String(settings.widthCm);
  const width=Number(widthCm);
  if(!/^\d+(?:\.\d+)?$/.test(widthCm)||!Number.isFinite(width)||width<2||width>10)
    throw Error("Largeur de brouillon invalide.");
  const paper=settings.paper;
  const columns=String(settings.columns??"3");
  if(!["letter","a4"].includes(paper)||!["2","3","4"].includes(columns))
    throw Error("Mise en page de brouillon invalide.");
  const cleanItems=items.map(snapshotItem);
  const content={items:cleanItems,settings:{title,widthCm,paper,columns}};
  if(JSON.stringify(content).length>20000)throw Error("Brouillon trop volumineux.");
  return {kind,title,content};
}
function validRevision(v){return Number.isSafeInteger(v)&&v>=1&&v<2147483646;}
function validateRow(row,uid){
  if(!row||!UUID.test(row.id||"")||!KINDS.includes(row.kind)||!validRevision(row.revision)||
    !row.content||!Array.isArray(row.content.items))throw Error("Brouillon serveur invalide.");
  const normalized=normalizeEditableDraft({kind:row.kind,items:row.content.items,settings:row.content.settings});
  if(normalized.title!==row.title)throw Error("Brouillon serveur incohérent.");
  if(row.owner_id&&row.owner_id!==uid)throw Error("Brouillon privé à un autre utilisateur.");
  return {...row,content:normalized.content};
}
export async function listEditableDrafts(client,uid){
  await authorized(client,uid);
  const q=await client.from(EDITABLE_DRAFTS_TABLE).select(COLUMNS).eq("owner_id",uid)
    .order("updated_at",{ascending:false}).limit(MAX_EDITABLE_DRAFTS);
  if(q.error)throw q.error;
  await authorized(client,uid);
  return (q.data||[]).map(row=>validateRow(row,uid));
}
// La recherche porte sur tous les brouillons privés, pas seulement sur la page affichée.
export function normalizeEditableDraftFilters({page=0,kind="all",query="",sort="recent"}={}){
  if(!Number.isSafeInteger(page)||page<0||page>100000)throw Error("Page de brouillons invalide.");
  if(!["all","routine","board"].includes(kind))throw Error("Type de brouillons invalide.");
  if(typeof query!=="string"||query.length>80||/[\p{C}]/u.test(query))
    throw Error("Recherche de brouillons invalide.");
  if(!["recent","oldest","title-asc","title-desc"].includes(sort))
    throw Error("Tri de brouillons invalide.");
  return {page,kind,query:query.trim(),sort};
}
// La liste "Mes brouillons" ne doit pas masquer silencieusement le 31e fichier.
// Chaque feuillet est lu avec la même authentification et la RLS propriétaire.
export async function listEditableDraftsPage(client,uid,filters={}){
  const {page,kind,query,sort}=normalizeEditableDraftFilters(filters);
  await authorized(client,uid);
  const selection=client.from(EDITABLE_DRAFTS_TABLE)
    .select(COLUMNS,{count:"exact"}).eq("owner_id",uid);
  if(kind!=="all")selection.eq("kind",kind);
  // Échapper les jokers SQL : une recherche de % ou _ reste du texte littéral.
  if(query)selection.ilike("title","%"+query.replace(/[\\%_]/g,"\\$&")+"%");
  // Tri sur toute la sélection serveur AVANT pagination. ID fixe les égalités.
  const sortColumn=sort.startsWith("title-")?"title":"updated_at";
  const ascending=sort==="oldest"||sort==="title-asc";
  const q=await selection.order(sortColumn,{ascending}).order("id",{ascending:true})
    .range(page*MAX_EDITABLE_DRAFTS,(page+1)*MAX_EDITABLE_DRAFTS-1);
  if(q.error)throw q.error;
  if(!Number.isSafeInteger(q.count)||q.count<0||!Array.isArray(q.data))
    throw Error("Liste de brouillons indisponible.");
  // Une réponse partielle ou contradictoire n'est pas un historique vide.
  if(q.data.length>MAX_EDITABLE_DRAFTS||q.data.length>q.count||
     (page*MAX_EDITABLE_DRAFTS>=q.count&&q.data.length>0))
    throw Error("Pagination des brouillons incohérente. Actualisez Mes brouillons.");
  const items=q.data.map(row=>validateRow(row,uid));
  await authorized(client,uid);
  return {items,total:q.count,page};
}
export async function listEditableDraftsAvailablePage(client,uid,filters={}){
  const {kind,query,sort,...selection}=normalizeEditableDraftFilters(filters);
  let page=selection.page;
  for(let attempt=0;attempt<3;attempt++){
    const result=await listEditableDraftsPage(client,uid,{page,kind,query,sort});
    const last=Math.max(0,Math.ceil(result.total/MAX_EDITABLE_DRAFTS)-1);
    if(result.total===0)return {...result,page:0};
    if(page>last){page=last;continue;}
    // Total positif : exiger la page complète; réessayer au plus trois fois.
    const expected=Math.min(MAX_EDITABLE_DRAFTS,result.total-page*MAX_EDITABLE_DRAFTS);
    if(result.items.length===expected)return result;
  }
  throw Error("La liste de brouillons a changé. Actualisez Mes brouillons.");
}
export async function loadEditableDraft(client,uid,id){
  if(!UUID.test(id||""))throw Error("Identifiant de brouillon invalide.");
  await authorized(client,uid);
  const q=await client.from(EDITABLE_DRAFTS_TABLE).select(COLUMNS).eq("owner_id",uid)
    .eq("id",id).maybeSingle();
  if(q.error)throw q.error;
  if(!q.data){
    // Ne pas révéler si l'ID existe chez un autre propriétaire.
    const error=Error("Brouillon introuvable ou privé.");
    error.code="DRAFT_NOT_FOUND";
    throw error;
  }
  await authorized(client,uid);
  return validateRow(q.data,uid);
}
export async function saveEditableDraft(client,uid,source,{id=null,revision=null}={}){
  const {kind,title,content}=normalizeEditableDraft(source);
  if(id!==null&&(!UUID.test(id)||!validRevision(revision)))
    throw Error("Révision de brouillon invalide.");
  await authorized(client,uid);
  let result;
  if(id===null){
    result=await client.from(EDITABLE_DRAFTS_TABLE).insert({
      owner_id:uid,kind,title,content
    }).select(COLUMNS).single();
  }else{
    result=await client.from(EDITABLE_DRAFTS_TABLE).update({kind,title,content})
      .eq("owner_id",uid).eq("id",id).eq("revision",revision)
      .select(COLUMNS).maybeSingle();
  }
  if(result.error)throw result.error;
  if(!result.data||id!==null&&result.data.id!==id||
    id!==null&&result.data.revision!==revision+1){
    const error=Error("Ce brouillon a changé sur un autre appareil. Rechargez-le ou enregistrez une copie.");
    error.code="DRAFT_REVISION_CONFLICT";
    throw error;
  }
  await authorized(client,uid);
  return validateRow(result.data,uid);
}
export async function deleteEditableDraft(client,uid,id,revision){
  if(!UUID.test(id||"")||!validRevision(revision))throw Error("Brouillon invalide.");
  await authorized(client,uid);
  const q=await client.from(EDITABLE_DRAFTS_TABLE).delete()
    .eq("owner_id",uid).eq("id",id).eq("revision",revision).select("id").maybeSingle();
  if(q.error)throw q.error;
  if(q.data?.id!==id){
    // Un CAS raté (modification OU suppression distante) ne doit pas aboutir
    // à une seconde suppression sur une révision ancienne.
    const error=Error("Le brouillon a changé. Rechargez la liste.");
    error.code="DRAFT_REVISION_CONFLICT";
    throw error;
  }
  await authorized(client,uid);
  return true;
}

/**
 * Dupliquer un brouillon sans ouvrir ni modifier la composition en cours.
 * La lecture de la source ET l'insertion de la copie vérifient la session UID;
 * PostgreSQL/RLS demeure l'autorité sur les données privées.
 */
export function duplicatedDraftTitle(title,language="fr"){
  if(!["fr","en"].includes(language))throw Error("Langue du brouillon invalide.");
  const prefix=language==="fr"?"Copie de ":"Copy of ";
  return titleOf(prefix+titleOf(title).slice(0,120-prefix.length));
}
export async function duplicateEditableDraft(client,uid,id,{language="fr",expectedKind=null,beforeInsert=null}={}){
  if(!["fr","en"].includes(language))throw Error("Langue du brouillon invalide.");
  if(expectedKind!==null&&!KINDS.includes(expectedKind))throw Error("Type de source invalide.");
  if(beforeInsert!==null&&typeof beforeInsert!=="function")throw Error("Vérification de source invalide.");
  const original=await loadEditableDraft(client,uid,id);
  // Un PDF peut pointer vers une source devenue incompatible entre deux appareils.
  // Refuser avant toute insertion, sans reconstruire ni altérer l'archive PDF.
  if(expectedKind!==null&&original.kind!==expectedKind)
    throw Error("Le brouillon source ne correspond plus au PDF archivé.");
  const copiedTitle=duplicatedDraftTitle(original.title,language);
  // Pour une copie liée à un PDF, le demandeur peut revérifier le document
  // et la révision de sa source après la lecture initiale, avant l'INSERT.
  if(beforeInsert)await beforeInsert({id:original.id,revision:original.revision,kind:original.kind});
  const duplicate=await saveEditableDraft(client,uid,{
    kind:original.kind,
    items:original.content.items,
    settings:{...original.content.settings,title:copiedTitle}
  });
  if(duplicate.id===original.id)throw Error("La copie n’a pas reçu un nouvel identifiant.");
  return duplicate;
}

/**
 * Change seulement le titre d'un brouillon privé, avec CAS sur sa révision.
 * Les items, paramètres d'impression et PDF archivés ne sont jamais recréés.
 */
export async function renameEditableDraft(client,uid,id,revision,newTitle){
  if(!UUID.test(id||"")||!validRevision(revision))
    throw Error("Révision de brouillon invalide.");
  const title=titleOf(newTitle);
  const original=await loadEditableDraft(client,uid,id);
  if(original.revision!==revision){
    const error=Error("Le brouillon a changé sur un autre appareil. Actualisez la liste avant de le renommer.");
    error.code="DRAFT_REVISION_CONFLICT";
    throw error;
  }
  if(title===original.title)return original;
  return saveEditableDraft(client,uid,{
    kind:original.kind,
    items:original.content.items,
    settings:{...original.content.settings,title}
  },{id,revision});
}
