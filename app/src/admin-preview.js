// Consultation ponctuelle des illustrations dans le stockage privé Super Admin.
// L'API renvoie un Blob authentifié : aucun lien public ou signé n'est généré.
// Les politiques RLS de la base et du stockage restent la sécurité serveur.
import {DRAFT_BUCKET} from "./admin-import.js";

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PRIVATE_PATH=/^imports\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.png$/i;
const PNG_MAGIC=[137,80,78,71,13,10,26,10];
const MAX_PRIVATE_PREVIEW=10*1024*1024;

async function sessionId(client){
  const response=await client.auth.getUser();
  if(response.error)throw response.error;
  return response.data?.user?.id||null;
}

async function confirmAdmin(client,verifiedUserId){
  if(await sessionId(client)!==verifiedUserId)
    throw new Error("Session administrateur expirée ou modifiée.");
  const response=await client.from("pictau_admins")
    .select("user_id").eq("user_id",verifiedUserId).maybeSingle();
  if(response.error)throw response.error;
  if(response.data?.user_id!==verifiedUserId)
    throw new Error("Accès Super Admin refusé.");
}

export async function loadPrivateAdminPreview(client,verifiedUserId,assetId){
  if(!UUID.test(verifiedUserId||"")||!UUID.test(assetId||""))
    throw new Error("Identifiant ou session invalide.");
  await confirmAdmin(client,verifiedUserId);

  // Lire le chemin sur le serveur, sans le placer dans le HTML ou les listes
  // client. La RLS autorise seulement les administrateurs authentifiés.
  const response=await client.from("pictau_assets")
    .select("id,title_fr,title_en,theme,status,created_at,image_path")
    .eq("id",assetId).maybeSingle();
  if(response.error)throw response.error;
  const asset=response.data;
  if(!asset||asset.id!==assetId)throw new Error("Pictogramme introuvable ou inaccessible.");
  if(typeof asset.image_path!=="string"||!PRIVATE_PATH.test(asset.image_path))
    throw new Error("Chemin d'image privée non conforme.");

  const result=await client.storage.from(DRAFT_BUCKET).download(asset.image_path);
  if(result.error)throw result.error;
  const blob=result.data;
  if(!blob||typeof blob.size!=="number"||typeof blob.slice!=="function"
      ||blob.size<8||blob.size>MAX_PRIVATE_PREVIEW)
    throw new Error("Image PNG absente ou trop volumineuse.");
  if(blob.type&&blob.type!=="image/png"&&blob.type!=="application/octet-stream")
    throw new Error("Le fichier n'est pas un PNG.");
  const header=new Uint8Array(await blob.slice(0,8).arrayBuffer());
  if(!PNG_MAGIC.every((byte,index)=>header[index]===byte))
    throw new Error("Signature PNG invalide.");

  // Refuser le retour du Blob si la session a changé durant le téléchargement.
  await confirmAdmin(client,verifiedUserId);
  return {
    blob,
    asset:{id:asset.id,title_fr:asset.title_fr,title_en:asset.title_en||null,
      theme:asset.theme,status:asset.status,created_at:asset.created_at}
  };
}
