// Gabarits Pict-au nommés et révisionnés : contrat REST du vrai Super Admin.
// La migration SQL séparée doit être installée dans un projet Supabase ISOLÉ
// puis approuvée avant intégration à l'éditeur réel. Aucune donnée de démo.
import {validatePreset} from "./core.js";

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const HEX=/^#[0-9a-f]{6}$/i;
const FIELDS="id,name,is_published,revision,shape,width_cm,art_percent,square_center_mode,band_mm,stroke_mm,font_pt,separator_mm,border_color,font_color,colored,rotation_deg,created_at,updated_at";
export const MAX_NAMED_TEMPLATES=100;
export function normalizeTemplateName(value){
  if(typeof value!=="string")throw Error("Nom de gabarit requis.");
  const name=value.trim().replace(/\s+/g," ");
  if(!name||name.length>80||/[\p{C}]/u.test(name))
    throw Error("Le nom doit contenir de 1 à 80 caractères lisibles.");
  return name;
}
function finiteIn(value,min,max){
  return typeof value==="number"&&Number.isFinite(value)&&value>=min&&value<=max;
}
function validSettings(p){
  return p&&typeof p==="object"&&!Array.isArray(p)&&validatePreset(p)&&
    typeof p.colored==="boolean"&&
    finiteIn(p.artPercent,30,95)&&HEX.test(p.color)&&HEX.test(p.fontColor)&&
    ["upper_illustration_area","entire_inner_square_height"].includes(p.squareCenterMode);
}
export function prepareNamedTemplate(name,preset,{widthCm=5,rotationDeg=0}={}){
  const safeName=normalizeTemplateName(name);
  if(!validSettings(preset)||!finiteIn(widthCm,2,10)||!finiteIn(rotationDeg,-180,180))
    throw Error("Réglages du gabarit invalides.");
  return {
    name:safeName,shape:preset.shape,width_cm:widthCm,
    art_percent:preset.artPercent,square_center_mode:preset.squareCenterMode,
    band_mm:preset.bandMm,stroke_mm:preset.strokeMm,font_pt:preset.fontPt,
    separator_mm:preset.separatorMm,border_color:preset.color,
    font_color:preset.fontColor,colored:preset.colored,rotation_deg:rotationDeg
  };
}
// Prépare un NOUVEAU brouillon à partir d'une fiche Super Admin déjà lue.
// Aucun INSERT/UPDATE ni changement de publication ici : seule l'action
// Enregistrer en brouillon crée ensuite une fiche sous contrôle Auth/RLS.
export function prepareNamedTemplateCopy(source,existing,fr=true){
  if(!source||!UUID.test(source.id||"")||!Array.isArray(existing)||
     existing.length>=MAX_NAMED_TEMPLATES||!existing.some(t=>t?.id===source.id)||
     existing.some(t=>!UUID.test(t?.id||"")||
       typeof t.name!=="string"||normalizeTemplateName(t.name)!==t.name)||
     !validSettings(source.preset)||!finiteIn(source.widthCm,2,10)||
     !finiteIn(source.rotationDeg,-180,180))
    throw Error("Impossible de dupliquer ce gabarit. Actualisez la liste.");
  const name=normalizeTemplateName(source.name),used=new Set(existing.map(
    t=>t.name.toLowerCase()
  ));
  for(let number=1;number<=MAX_NAMED_TEMPLATES+1;number++){
    const suffix=fr?
      (number===1?" (copie)":` (copie ${number})`):
      (number===1?" (copy)":` (copy ${number})`);
    const base=[...name].slice(0,80-[...suffix].length).join("").trimEnd();
    const candidate=normalizeTemplateName(base+suffix);
    if(!used.has(candidate.toLowerCase()))
      return {id:null,name:candidate,preset:{...source.preset},
        widthCm:source.widthCm,rotationDeg:source.rotationDeg};
  }
  throw Error("Aucun nom de copie disponible. Renommez un gabarit.");
}

function normalizedRow(row){
  if(!row||typeof row!=="object"||!UUID.test(row.id||"")||
     typeof row.name!=="string"||
     normalizeTemplateName(row.name)!==row.name||
     typeof row.is_published!=="boolean"||
     !Number.isSafeInteger(row.revision)||row.revision<1||
     !finiteIn(Number(row.width_cm),2,10)||!finiteIn(Number(row.rotation_deg),-180,180))
    throw Error("Gabarit serveur incohérent. Actualisez les gabarits.");
  const p={
    shape:row.shape,artPercent:Number(row.art_percent),
    squareCenterMode:row.square_center_mode,bandMm:Number(row.band_mm),
    strokeMm:Number(row.stroke_mm),fontPt:Number(row.font_pt),
    separatorMm:Number(row.separator_mm),color:row.border_color,
    fontColor:row.font_color,colored:row.colored
  };
  if(!validSettings(p))throw Error("Gabarit serveur invalide. Actualisez les gabarits.");
  const {created_by:_privateOwner,...safe}=row;
  return {...safe,preset:p,widthCm:Number(row.width_cm),rotationDeg:Number(row.rotation_deg)};
}
async function checkSession(client,uid){
  if(!UUID.test(uid||""))throw Error("Session invalide.");
  const result=await client.auth.getUser();
  if(result.error)throw result.error;
  if(result.data?.user?.id!==uid)throw Error("Session modifiée : opération annulée.");
}
async function requireAdmin(client,uid){
  await checkSession(client,uid);
  const role=await client.from("pictau_admins").select("user_id")
    .eq("user_id",uid).maybeSingle();
  if(role.error)throw role.error;
  if(role.data?.user_id!==uid)throw Error("Action réservée au Super Admin.");
}
export async function listAdminNamedTemplates(client,uid){
  await requireAdmin(client,uid);
  const r=await client.from("pictau_templates").select(FIELDS)
    .order("name",{ascending:true}).limit(MAX_NAMED_TEMPLATES+1);
  if(r.error)throw r.error;
  await requireAdmin(client,uid);
  if(!Array.isArray(r.data)||r.data.length>MAX_NAMED_TEMPLATES)
    throw Error("Liste de gabarits indisponible ou trop longue.");
  const rows=r.data.map(normalizedRow);
  if(new Set(rows.map(row=>row.id)).size!==rows.length)
    throw Error("Gabarits en double sur le serveur.");
  return rows;
}
export async function listClientPublishedTemplates(client,uid){
  await checkSession(client,uid);
  const r=await client.from("pictau_templates").select(FIELDS)
    .eq("is_published",true).order("name",{ascending:true})
    .limit(MAX_NAMED_TEMPLATES+1);
  if(r.error)throw r.error;
  await checkSession(client,uid);
  if(!Array.isArray(r.data)||r.data.length>MAX_NAMED_TEMPLATES)
    throw Error("Liste publique des gabarits indisponible.");
  const rows=r.data.map(normalizedRow);
  if(rows.some(row=>!row.is_published)||new Set(rows.map(row=>row.id)).size!==rows.length)
    throw Error("Le serveur a retourné un gabarit non approuvé ou en double.");
  return rows;
}
export async function saveAdminNamedTemplate(client,uid,{id=null,revision=null,name,preset,widthCm=5,rotationDeg=0}){
  const changes=prepareNamedTemplate(name,preset,{widthCm,rotationDeg});
  await requireAdmin(client,uid);
  let operation;
  if(id===null){
    // Brouillon privé par défaut : l'action Enregistrer NE publie jamais.
    operation=client.from("pictau_templates").insert({...changes,created_by:uid,
      is_published:false}).select(FIELDS).single();
  }else{
    if(!UUID.test(id)||!Number.isSafeInteger(revision)||revision<1)
      throw Error("Identifiant ou version de gabarit invalide.");
    operation=client.from("pictau_templates").update(changes)
      .eq("id",id).eq("revision",revision).select(FIELDS).maybeSingle();
  }
  const r=await operation;
  if(r.error)throw r.error;
  if(!r.data)throw Error("Ce gabarit a été modifié ailleurs. Actualisez la liste.");
  await requireAdmin(client,uid);
  const row=normalizedRow(r.data);
  if(row.name!==changes.name||(id!==null&&(row.id!==id||row.revision!==revision+1))||
     (id===null&&(row.is_published||row.revision!==1)))
    throw Error("L'enregistrement du gabarit n'est pas confirmé.");
  return row;
}
export async function setAdminTemplatePublication(client,uid,{id,revision,published}){
  if(!UUID.test(id||"")||!Number.isSafeInteger(revision)||revision<1||
     typeof published!=="boolean")
    throw Error("Publication de gabarit invalide.");
  await requireAdmin(client,uid);
  const r=await client.from("pictau_templates")
    .update({is_published:published})
    .eq("id",id).eq("revision",revision).select(FIELDS).maybeSingle();
  if(r.error)throw r.error;
  if(!r.data)throw Error("Version de gabarit périmée : actualisez les gabarits.");
  await requireAdmin(client,uid);
  const row=normalizedRow(r.data);
  if(row.id!==id||row.revision!==revision+1||row.is_published!==published)
    throw Error("Publication de gabarit non confirmée.");
  return row;
}
