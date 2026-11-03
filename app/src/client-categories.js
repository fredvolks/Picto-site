// Référentiel de catégories ACTIVES du Super Admin : aucun accès à sa banque privée.
// L'accès client dépend de la politique RLS pictau_themes_client_active_read.
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SLUG=/^[a-z][a-z0-9_-]{0,59}$/;
const MAX_ACTIVE_CATEGORIES=200;

async function verifySameUser(client,uid){
  if(!UUID.test(uid||""))throw Error("Session requise.");
  const response=await client.auth.getUser();
  if(response.error)throw response.error;
  if(response.data?.user?.id!==uid)throw Error("La session a changé.");
}

// Retourne le même format [code, libellé FR, libellé EN] que les sélecteurs
// existants, afin de remplacer leur liste statique sans exposer les brouillons.
export async function listActiveClientCategories(client,uid){
  await verifySameUser(client,uid);
  const result=await client.from("pictau_themes")
    .select("code,label_fr,label_en,merged_into")
    .is("merged_into",null)
    .order("label_fr",{ascending:true})
    .limit(MAX_ACTIVE_CATEGORIES+1);
  if(result.error)throw result.error;
  await verifySameUser(client,uid);
  if(!Array.isArray(result.data)||result.data.length>MAX_ACTIVE_CATEGORIES)
    throw Error("Liste des catégories indisponible. Actualisez la bibliothèque.");
  const seen=new Set();
  return result.data.map(item=>{
    if(!item||typeof item!=="object"||typeof item.code!=="string"||!SLUG.test(item.code)
       ||item.merged_into!==null||seen.has(item.code)
       ||typeof item.label_fr!=="string"||typeof item.label_en!=="string")
      throw Error("Catégories incohérentes. Actualisez la bibliothèque.");
    const fr=item.label_fr.trim().replace(/\s+/g," ");
    const en=item.label_en.trim().replace(/\s+/g," ");
    if(!fr||!en||fr.length>80||en.length>80||/[\p{C}]/u.test(fr+en))
      throw Error("Libellés de catégories invalides.");
    seen.add(item.code);
    return [item.code,fr,en];
  });
}
