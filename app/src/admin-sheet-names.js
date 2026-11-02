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
  const {data,error}=await q.select("id,admin_name,title_fr,title_en,theme,status,created_by").maybeSingle();
  if(error)throw Error("Impossible d'enregistrer les noms : "+error.message);
  if(!data||data.id!==assetId||data.created_by!==uid||data.status!=="draft"||
    data.admin_name!==next.admin_name||data.title_fr!==next.title_fr||
    data.title_en!==next.title_en)
    throw Error("Fiche modifiée entre-temps ou sauvegarde refusée. Actualisez la Banque.");
  await verify(client,uid);
  return Object.freeze({id:assetId,...next});
}
