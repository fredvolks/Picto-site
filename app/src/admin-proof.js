// Épreuve PDF locale et PRIVÉE avant décision humaine de publication.
// Le PNG est relu sous Auth/RLS depuis la banque brouillon; aucune écriture
// Supabase, archive client, URL publique ou publication n'est créée ici.
import {loadPrivateAdminPreview} from "./admin-preview.js";
import {createPreparedPdf} from "./print-pdf.js";
import {DEFAULT_PRESET} from "./core.js";

export function planPrivateDraftProof(asset,pngBlob,{language="fr",preset=DEFAULT_PRESET}={}){
  if(!asset||asset.status!=="draft"||typeof asset.title_fr!=="string"||
     !asset.title_fr.trim()||!(pngBlob instanceof Blob))
    throw Error("Seul un brouillon privé vérifié peut produire une épreuve PDF.");
  if(!["fr","en"].includes(language))throw Error("Langue d'épreuve invalide.");
  const label=language==="en"?(asset.title_en||asset.title_fr):asset.title_fr;
  const name=String(label).trim();
  if(!name||/[\p{C}]/u.test(name))throw Error("Libellé privé invalide.");
  return {
    kind:"board",items:[{fr:asset.title_fr,en:asset.title_en||asset.title_fr,pngBlob}],
    widthCm:5,paper:"letter",columns:2,language,
    title:(language==="fr"?"Épreuve privée — ":"Private proof — ")+name.slice(0,96),
    separatorMode:"simple",
    preset:{...preset,colored:false,color:"#111111"}
  };
}

async function recheckSuperAdmin(client,uid){
  const auth=await client.auth.getUser();
  if(auth.error)throw auth.error;
  if(!uid||auth.data?.user?.id!==uid)
    throw Error("La session Super Admin a changé : aucune épreuve téléchargée.");
  const role=await client.from("pictau_admins")
    .select("user_id").eq("user_id",uid).maybeSingle();
  if(role.error)throw role.error;
  if(role.data?.user_id!==uid)
    throw Error("Les droits Super Admin ont changé : aucune épreuve téléchargée.");
}

export async function createPrivateDraftProof(client,uid,assetId,options={},renderPdf=createPreparedPdf){
  const source=await loadPrivateAdminPreview(client,uid,assetId);
  const proof=planPrivateDraftProof(source.asset,source.blob,options);
  await recheckSuperAdmin(client,uid);
  // Cette génération est locale; le rendu est strictement celui du moteur PDF client.
  const result=await renderPdf(proof);
  await recheckSuperAdmin(client,uid);
  if(!(result?.blob instanceof Blob)||result.blob.type!=="application/pdf"||
     result.blob.size<8||!Number.isSafeInteger(result.pageCount)||
     result.pageCount!==1)
    throw Error("Épreuve PDF locale invalide : aucun document téléchargé.");
  const signature=new Uint8Array(await result.blob.slice(0,5).arrayBuffer());
  if(signature[0]!==37||signature[1]!==80||signature[2]!==68||
     signature[3]!==70||signature[4]!==45)
    throw Error("Signature du PDF privé invalide.");
  await recheckSuperAdmin(client,uid);
  return result.blob;
}
