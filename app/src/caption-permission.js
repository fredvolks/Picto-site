// Droits de personnalisation des légendes : vérifiés par Supabase/RLS.
// Un client ne peut jamais écrire ce réglage directement.
export const CAPTION_FLAG_ID="client_caption_edit";
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const COLS="id,enabled,updated_at,updated_by";
async function verified(client,uid){
  if(!UUID.test(uid||""))throw Error("Session requise.");
  const r=await client.auth.getUser();
  if(r.error)throw r.error;
  if(r.data?.user?.id!==uid)throw Error("La session a changé.");
}
function parseFeature(row){
  if(row?.id!==CAPTION_FLAG_ID||typeof row.enabled!=="boolean")
    throw Error("Paramètre indisponible; modification du texte désactivée.");
  return {enabled:row.enabled,updated_at:row.updated_at||null,updated_by:row.updated_by||null};
}
export async function readCaptionPermission(client,uid){
  await verified(client,uid);
  const q=await client.from("pictau_app_features").select(COLS)
    .eq("id",CAPTION_FLAG_ID).maybeSingle();
  if(q.error)throw q.error;
  await verified(client,uid);
  return parseFeature(q.data);
}
export async function setCaptionPermission(client,uid,currentEnabled,nextEnabled){
  if(typeof currentEnabled!=="boolean"||typeof nextEnabled!=="boolean")
    throw Error("État du réglage invalide.");
  await verified(client,uid);
  const role=await client.from("pictau_admins").select("user_id")
    .eq("user_id",uid).maybeSingle();
  if(role.error)throw role.error;
  if(role.data?.user_id!==uid)throw Error("Seul le Super Admin peut changer ce paramètre.");
  if(currentEnabled===nextEnabled)return readCaptionPermission(client,uid);
  const result=await client.from("pictau_app_features").update({enabled:nextEnabled})
    .eq("id",CAPTION_FLAG_ID).eq("enabled",currentEnabled).select(COLS).maybeSingle();
  if(result.error)throw result.error;
  if(result.data?.enabled!==nextEnabled)throw Error("Le réglage a changé sur une autre session. Actualisez-le.");
  await verified(client,uid);
  return parseFeature(result.data);
}
