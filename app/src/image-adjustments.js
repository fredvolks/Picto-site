import {validateImageFineTune} from "./image-fine-tune.js";

// Données privées Super Admin. Source de vérité: RLS sur Supabase.
// Aucune écriture possible en absence de migration, de session vérifiée,
// ou quand une révision concurrente est devenue périmée.
const MISSING_TABLE_CODES=new Set(["42P01","PGRST205","PGRST116_TABLE"]);
function message(error){return String(error?.message||error||"");}
function missingTable(error){
  return MISSING_TABLE_CODES.has(error?.code)||
    /Could not find the table 'public\.pictau_image_adjustments'/i.test(message(error));
}
function validateRevision(revision){
  if(revision!==null&&(!Number.isSafeInteger(revision)||revision<1))
    throw new Error("Version du réglage individuel invalide.");
}
async function verifiedAdminSession(client,uid){
  if(!client?.auth?.getUser||!client?.from||typeof uid!=="string")
    throw new Error("Connexion à la banque privée indisponible.");
  const {data,error}=await client.auth.getUser();
  if(error||!data?.user||data.user.id!==uid)
    throw new Error("Session administrateur expirée. Reconnectez-vous.");
  return data.user;
}
function parsedRow(row,assetId){
  if(!row||row.asset_id!==assetId||
     !Number.isSafeInteger(row.revision)||row.revision<1)
    throw new Error("Réglage individuel incomplet. Actualisez la fiche.");
  const {scalePercent}=validateImageFineTune({assetId,scalePercent:row.scale_percent});
  return Object.freeze({scalePercent,revision:row.revision,updatedAt:row.updated_at||null});
}

export async function readAdminImageAdjustment(client,uid,assetId){
  validateImageFineTune({assetId});
  await verifiedAdminSession(client,uid);
  const {data,error}=await client.from("pictau_image_adjustments")
    .select("asset_id,scale_percent,revision,updated_at")
    .eq("asset_id",assetId).maybeSingle();
  if(error){
    if(missingTable(error))return Object.freeze({available:false,scalePercent:100,revision:null});
    throw new Error("Lecture du réglage individuel impossible : "+message(error));
  }
  await verifiedAdminSession(client,uid);
  if(data===null)
    return Object.freeze({available:true,scalePercent:100,revision:null});
  return Object.freeze({available:true,...parsedRow(data,assetId)});
}

export async function saveAdminImageAdjustment(client,uid,{assetId,scalePercent,revision}){
  validateImageFineTune({assetId,scalePercent});
  validateRevision(revision);
  await verifiedAdminSession(client,uid);
  const op=revision===null
    ?client.from("pictau_image_adjustments")
      .insert({asset_id:assetId,scale_percent:scalePercent})
    :client.from("pictau_image_adjustments")
      .update({scale_percent:scalePercent}).eq("asset_id",assetId)
      .eq("revision",revision);
  const {data,error}=await op.select("asset_id,scale_percent,revision,updated_at").maybeSingle();
  if(error){
    if(missingTable(error))throw new Error("Sauvegarde indisponible : migration Supabase non installée.");
    if(error.code==="23505")throw new Error("Une autre session a créé ce réglage. Actualisez la fiche.");
    throw new Error("Sauvegarde du réglage refusée : "+message(error));
  }
  if(data===null)
    throw new Error("Ce dessin a été modifié ailleurs ou n'est plus en brouillon. Actualisez la fiche.");
  await verifiedAdminSession(client,uid);
  return parsedRow(data,assetId);
}
