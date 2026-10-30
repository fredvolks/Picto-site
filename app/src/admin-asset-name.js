// Renommer un actif dans la banque PRIVÉE sans toucher aux libellés FR/EN,
// au PNG, au propriétaire ni au statut de publication.
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function normalizeAdminAssetName(value){
  if(typeof value!=="string")throw Error("Le nom administratif doit être du texte.");
  if(/[\p{C}]/u.test(value))throw Error("Le nom administratif ne peut contenir de caractères de contrôle.");
  const name=value.trim().replace(/\s+/g," ");
  if(name.length>120||/[\p{C}]/u.test(name))
    throw Error("Le nom administratif doit contenir 120 caractères maximum, sans caractères de contrôle.");
  return name||null;
}
async function requireAdmin(client,uid){
  if(!UUID.test(uid||""))throw Error("Session administrateur invalide.");
  const user=await client.auth.getUser();
  if(user.error)throw user.error;
  if(user.data?.user?.id!==uid)throw Error("La session a changé.");
  const role=await client.from("pictau_admins").select("user_id").eq("user_id",uid).maybeSingle();
  if(role.error)throw role.error;
  if(role.data?.user_id!==uid)throw Error("Accès Super Admin refusé.");
}
export async function renameAdminAsset(client,uid,assetId,expectedName,newName){
  if(!UUID.test(assetId||""))throw Error("Identifiant du pictogramme invalide.");
  if(expectedName!==null&&typeof expectedName!=="string")
    throw Error("Nom initial invalide.");
  const expected=expectedName===null?null:normalizeAdminAssetName(expectedName);
  const next=normalizeAdminAssetName(newName);
  await requireAdmin(client,uid);
  if(next===expected){
    // "Inchangé" doit refléter la fiche actuelle, pas seulement le formulaire.
    // Un autre Super Admin peut l'avoir modifiée ou supprimée entre-temps.
    const current=await client.from("pictau_assets")
      .select("id,admin_name").eq("id",assetId).maybeSingle();
    if(current.error)throw current.error;
    await requireAdmin(client,uid);
    if(!current.data||current.data.id!==assetId||current.data.admin_name!==expected)
      throw Error("La fiche a changé depuis son ouverture. Actualisez la banque.");
    return{changed:false,admin_name:next,id:assetId};
  }
  // Concurrence optimiste: si un autre admin a renommé, aucune ligne mise à jour.
  let q=client.from("pictau_assets").update({admin_name:next}).eq("id",assetId);
  q=expected===null?q.is("admin_name",null):q.eq("admin_name",expected);
  const r=await q.select("id,admin_name,title_fr,title_en,status").maybeSingle();
  if(r.error)throw r.error;
  if(!r.data||r.data.id!==assetId||r.data.admin_name!==next)
    throw Error("La fiche a changé depuis son ouverture. Actualisez la banque.");
  await requireAdmin(client,uid);
  return{changed:true,admin_name:r.data.admin_name,id:assetId};
}
