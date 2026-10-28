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
export async function loadEditableDraft(client,uid,id){
  if(!UUID.test(id||""))throw Error("Identifiant de brouillon invalide.");
  await authorized(client,uid);
  const q=await client.from(EDITABLE_DRAFTS_TABLE).select(COLUMNS).eq("owner_id",uid)
    .eq("id",id).maybeSingle();
  if(q.error)throw q.error;
  if(!q.data)throw Error("Brouillon introuvable ou privé.");
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
  if(q.data?.id!==id)throw Error("Le brouillon a changé. Rechargez la liste.");
  await authorized(client,uid);
  return true;
}
