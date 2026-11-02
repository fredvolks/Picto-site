// Pict-au — sauvegarde atomique des trois noms d'un brouillon Super Admin.
// Un seul UPDATE de trois colonnes, avec vérification serveur et CAS.
// Ne touche jamais au PNG, au thème, aux modèles ou à la publication.
import {normalizeAdminAssetName} from "./admin-asset-name.js";
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function clean(value,max,required=false){
  if(typeof value!=="string"||/[\p{C}]/u.test(value))throw Error("Nom invalide.");
  const s=value.trim().replace(/\s+/g," ");
  if((required&&!s)||s.length>max)throw Error("Nom invalide (maximum "+max+" caractères).");
  return s;
}
export function normalizeSheetNames(fields){
  if(!fields||typeof fields!=="object")throw Error("Noms de fiche invalides.");
  return Object.freeze({
    admin_name:normalizeAdminAssetName(fields.adminName),
    title_fr:clean(fields.titleFr,100,true),
    title_en:clean(fields.titleEn||"",100)||null
  });
}
async function verify(client,uid){
  const {data,error}=await client.auth.getUser();
  if(error||data?.user?.id!==uid)throw Error("Session Super Admin expirée.");
  const role=await client.from("pictau_admins").select("user_id").eq("user_id",uid).maybeSingle();
  if(role.error||role.data?.user_id!==uid)throw Error("Accès Super Admin refusé.");
}

// Seules les erreurs de transport sans statut HTTP définitif laissent une
// incertitude sur l'issue de l'écriture. Ne pas masquer une erreur Auth/RLS,
// une violation SQL ou un conflit de version sous une prétendue réussite.
function uncertainNetworkFailure(error){
  if(!error||typeof error!=="object"||
    (error.status!=null&&error.status!==0))return false;
  const code=String(error.code||"");
  if(code&&!["PGRST000","ETIMEDOUT","ECONNRESET","ENOTFOUND"].includes(code.toUpperCase()))
    return false;
  return /failed to fetch|fetch failed|networkerror|network error|load failed|connection|timeout|timed out|réseau/i
    .test(String(error.message||""));
}
function sameSavedNames(row,assetId,uid,next){
  return !!row&&row.id===assetId&&row.created_by===uid&&row.status==="draft"&&
    row.admin_name===next.admin_name&&row.title_fr===next.title_fr&&
    row.title_en===next.title_en;
}

export async function saveAdminSheetNames(client,uid,assetId,expected,fields){
  if(!UUID.test(uid||"")||!UUID.test(assetId||""))throw Error("Fiche ou session invalide.");
  const next=normalizeSheetNames(fields);
  if(!expected||typeof expected.title_fr!=="string")throw Error("Version de départ manquante.");
  await verify(client,uid);
  // Le contrôle de droits est doublé par les politiques RLS et le trigger DB.
  let q=client.from("pictau_assets").update(next).eq("id",assetId)
    .eq("created_by",uid).eq("status","draft").is("published_at",null)
    .eq("title_fr",expected.title_fr);
  q=expected.title_en==null?q.is("title_en",null):q.eq("title_en",expected.title_en);
  q=expected.admin_name==null?q.is("admin_name",null):q.eq("admin_name",expected.admin_name);
  // Une coupure réseau peut arriver APRÈS l'UPDATE serveur. Dans ce seul
  // cas incertain, relire le brouillon privé sous Auth/RLS avant d'afficher
  // une erreur qui pousserait Émilie à répéter une écriture déjà réussie.
  let response=null,unknownOutcome=null;
  try{
    response=await q.select("id,admin_name,title_fr,title_en,theme,status,created_by").maybeSingle();
  }catch(error){unknownOutcome=error;}
  if(response?.error){
    if(!uncertainNetworkFailure(response.error))
      throw Error("Impossible d'enregistrer les noms : "+response.error.message);
    unknownOutcome=response.error;
  }
  const data=response?.data;
  if(!unknownOutcome){
    if(!sameSavedNames(data,assetId,uid,next))
      throw Error("Fiche modifiée entre-temps ou sauvegarde refusée. Actualisez la Banque.");
    await verify(client,uid);
    return Object.freeze({id:assetId,...next});
  }
  if(!uncertainNetworkFailure(unknownOutcome))
    throw Error("Impossible d'enregistrer les noms : "+String(unknownOutcome?.message||unknownOutcome));
  try{
    // Ne jamais confirmer un brouillon publié, un autre propriétaire ou des
    // noms partiellement enregistrés; aucune seconde écriture n'est tentée.
    await verify(client,uid);
    const check=await client.from("pictau_assets")
      .select("id,created_by,status,published_at,admin_name,title_fr,title_en")
      .eq("id",assetId).eq("created_by",uid).eq("status","draft")
      .is("published_at",null).maybeSingle();
    if(check.error)throw check.error;
    await verify(client,uid);
    if(check.data?.published_at===null&&sameSavedNames(check.data,assetId,uid,next))
      return Object.freeze({id:assetId,...next});
  }catch{ /* L'absence de preuve côté serveur ne vaut jamais une réussite. */ }
  throw Error("Réponse réseau perdue : sauvegarde non confirmée. Actualisez la Banque avant de réessayer.");
}
