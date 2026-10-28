// Modification des métadonnées d'un brouillon privé, sans changer
// le statut, l'image, le propriétaire ou la date de publication.
// La permission UPDATE n'est pas encore activée dans Supabase:
// ce module reste derrière le verrou UI avant revue de la migration.
import {validateDraftMetadata} from "./admin-import.js";

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const cols="id,created_by,status,published_at,title_fr,title_en,theme";
async function ensureAdmin(client,uid){
  const session=await client.auth.getUser();
  if(session.error)throw session.error;
  if(session.data?.user?.id!==uid)throw new Error("Session administrateur expirée ou modifiée.");
  const role=await client.from("pictau_admins").select("user_id").eq("user_id",uid).maybeSingle();
  if(role.error)throw role.error;
  if(role.data?.user_id!==uid)throw new Error("Accès Super Admin refusé.");
}
function metadataOf(row){
  return {title_fr:row.title_fr,title_en:row.title_en??null,theme:row.theme};
}

export async function editPrivateDraftMetadata(client,userId,assetId,expected,form){
  if(!UUID.test(userId||"")||!UUID.test(assetId||""))
    throw new Error("Identifiant de fiche ou session invalide.");
  if(!expected||typeof expected!=="object")
    throw new Error("La version initiale de la fiche est requise.");
  const payload=validateDraftMetadata(form);
  await ensureAdmin(client,userId);
  const prior=await client.from("pictau_assets").select(cols).eq("id",assetId).maybeSingle();
  if(prior.error)throw prior.error;
  const row=prior.data;
  if(!row||row.id!==assetId||row.status!=="draft"||row.published_at!==null||
     row.created_by!==userId)
    throw new Error("Seuls vos brouillons non publiés peuvent être modifiés.");
  const before=metadataOf(row);
  if(before.title_fr!==expected.title_fr||before.title_en!==expected.title_en||
     before.theme!==expected.theme)
    throw new Error("La fiche a changé depuis son ouverture : actualisez-la avant de modifier.");
  if(before.title_fr===payload.title_fr&&before.title_en===payload.title_en&&before.theme===payload.theme)
    return {saved:false,unchanged:true,asset:{id:assetId,...before}};

  await ensureAdmin(client,userId);
  // Filtres d'optimistic concurrency contre les changements entre SELECT et UPDATE.
  // Aucune colonne sensible (status, image_path, created_by, published_at)
  // n'est envoyée dans le payload; les droits de colonnes et RLS sont requis.
  let q=client.from("pictau_assets").update(payload)
    .eq("id",assetId).eq("created_by",userId)
    .eq("status","draft").is("published_at",null)
    .eq("title_fr",before.title_fr).eq("theme",before.theme);
  q=before.title_en===null?q.is("title_en",null):q.eq("title_en",before.title_en);
  const result=await q.select("id,title_fr,title_en,theme,status,published_at").maybeSingle();
  if(result.error)throw result.error;
  if(!result.data||result.data.status!=="draft"||result.data.published_at!==null)
    throw new Error("Enregistrement refusé ou fiche modifiée par quelqu'un d'autre. Actualisez la banque.");
  await ensureAdmin(client,userId);
  return{saved:true,unchanged:false,asset:{
    id:result.data.id,title_fr:result.data.title_fr,title_en:result.data.title_en??null,
    theme:result.data.theme
  }};
}
