// Thèmes multiples de la banque PRIVÉE : toutes les mutations restent soumises à RLS.
export const MAX_THEMES_PER_ASSET=12;
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SLUG=/^[a-z][a-z0-9_-]{0,59}$/;
export function validateThemeCode(value){
  if(typeof value!=="string"||!SLUG.test(value))
    throw Error("Identifiant de thème invalide (a-z, chiffres, tiret ou soulignement).");
  return value;
}
export function validateThemeLabels(fr,en){
  if(typeof fr!=="string"||typeof en!=="string")throw Error("Libellés bilingues requis.");
  const clean=s=>s.trim().replace(/\s+/g," ");
  const result={label_fr:clean(fr),label_en:clean(en)};
  if(Object.values(result).some(s=>s.length<1||s.length>80||/[\p{C}]/u.test(s)))
    throw Error("Chaque libellé doit contenir de 1 à 80 caractères.");
  return result;
}
async function requireAdmin(client,uid){
  if(!UUID.test(uid||""))throw Error("Session invalide.");
  const user=await client.auth.getUser();
  if(user.error)throw user.error;
  if(user.data?.user?.id!==uid)throw Error("La session a changé.");
  const role=await client.from("pictau_admins").select("user_id").eq("user_id",uid).maybeSingle();
  if(role.error)throw role.error;
  if(role.data?.user_id!==uid)throw Error("Réservé au Super Admin.");
}
export async function readThemes(client,uid){
  await requireAdmin(client,uid);
  const r=await client.from("pictau_themes").select("code,label_fr,label_en,merged_into,created_at").order("label_fr",{ascending:true});
  if(r.error)throw r.error;
  await requireAdmin(client,uid);
  if(!Array.isArray(r.data))throw Error("Liste des thèmes indisponible. Actualisez les thèmes.");
  const seen=new Set();
  for(const row of r.data){
    if(!row||typeof row!=="object"||typeof row.code!=="string"||!SLUG.test(row.code)
      ||typeof row.label_fr!=="string"||!row.label_fr.trim()||row.label_fr.length>80
      ||typeof row.label_en!=="string"||!row.label_en.trim()||row.label_en.length>80
      ||(row.merged_into!==null&&!SLUG.test(row.merged_into||""))||seen.has(row.code))
      throw Error("Liste des thèmes incohérente. Actualisez les thèmes.");
    seen.add(row.code);
  }
  return r.data;
}
export async function readAssetThemes(client,uid,assetIds){
  if(!Array.isArray(assetIds)||assetIds.length>24||assetIds.some(id=>!UUID.test(id)))
    throw Error("Page d'actifs invalide.");
  await requireAdmin(client,uid);
  if(!assetIds.length)return {};
  const r=await client.from("pictau_asset_themes").select("asset_id,theme_code")
    .in("asset_id",assetIds);
  if(r.error)throw r.error;
  await requireAdmin(client,uid);
  if(!Array.isArray(r.data))throw Error("Associations de thèmes indisponibles. Actualisez la banque.");
  const mapping=Object.fromEntries(assetIds.map(id=>[id,[]]));
  if(r.data.length>Object.keys(mapping).length*MAX_THEMES_PER_ASSET)
    throw Error("Associations de thèmes incohérentes. Actualisez la banque.");
  for(const row of r.data){
    if(!row||typeof row!=="object"||typeof row.asset_id!=="string"
      ||!Object.hasOwn(mapping,row.asset_id)||typeof row.theme_code!=="string"
      ||!SLUG.test(row.theme_code)||mapping[row.asset_id].includes(row.theme_code)
      ||mapping[row.asset_id].length>=MAX_THEMES_PER_ASSET)
      throw Error("Associations de thèmes incohérentes. Actualisez la banque.");
    mapping[row.asset_id].push(row.theme_code);
  }
  return mapping;
}
export async function createTheme(client,uid,code,fr,en){
  const payload={code:validateThemeCode(code),...validateThemeLabels(fr,en)};
  await requireAdmin(client,uid);
  const r=await client.from("pictau_themes").insert(payload)
    .select("code,label_fr,label_en,merged_into").single();
  if(r.error)throw r.error;
  if(r.data?.code!==code)throw Error("Thème non confirmé.");
  await requireAdmin(client,uid);
  return r.data;
}
export async function editThemeLabels(client,uid,code,oldFr,oldEn,fr,en){
  validateThemeCode(code);const labels=validateThemeLabels(fr,en);
  await requireAdmin(client,uid);
  const r=await client.from("pictau_themes").update(labels).eq("code",code)
    .is("merged_into",null).eq("label_fr",oldFr).eq("label_en",oldEn)
    .select("code,label_fr,label_en,merged_into").maybeSingle();
  if(r.error)throw r.error;
  if(!r.data||r.data.code!==code)throw Error("Ce thème a changé. Actualisez les thèmes.");
  await requireAdmin(client,uid);
  return r.data;
}
export async function addAssetTheme(client,uid,assetId,code){
  if(!UUID.test(assetId||""))throw Error("Actif invalide.");
  validateThemeCode(code);
  await requireAdmin(client,uid);
  const r=await client.from("pictau_asset_themes").insert({asset_id:assetId,theme_code:code})
    .select("asset_id,theme_code").single();
  if(r.error)throw r.error;
  if(r.data?.asset_id!==assetId||r.data?.theme_code!==code)throw Error("Association non confirmée.");
  await requireAdmin(client,uid);
  return r.data;
}
export async function removeAssetTheme(client,uid,assetId,code){
  if(!UUID.test(assetId||""))throw Error("Actif invalide.");
  validateThemeCode(code);await requireAdmin(client,uid);
  const r=await client.from("pictau_asset_themes").delete().eq("asset_id",assetId).eq("theme_code",code)
    .select("asset_id,theme_code").maybeSingle();
  if(r.error)throw r.error;
  if(!r.data||r.data.asset_id!==assetId)throw Error("Association absente ou accès refusé.");
  await requireAdmin(client,uid);
  return r.data;
}
export async function mergeThemes(client,uid,source,target){
  validateThemeCode(source);validateThemeCode(target);
  if(source===target)throw Error("Choisir deux thèmes différents.");
  await requireAdmin(client,uid);
  const r=await client.rpc("pictau_merge_theme",{source_code:source,target_code:target});
  if(r.error)throw r.error;
  await requireAdmin(client,uid);
  return{source,target,merged:true};
}
