// Import volontaire d'un PNG dans la banque PRIVÉE du Super Admin.
// Aucune approbation ni publication automatique. Les politiques RLS Supabase
// sont l'autorité finale, indépendamment des contrôles d'interface.
export const DRAFT_BUCKET = "pictau-drafts";
export const MAX_DRAFT_BYTES = 6 * 1024 * 1024;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const pngSignature = [137,80,78,71,13,10,26,10];

export function validateDraftMetadata({titleFr,titleEn="",theme="autres"}={}) {
  const clean = value => typeof value==="string" ? value.trim().replace(/\s+/g," ") : "";
  const title_fr=clean(titleFr),title_en=clean(titleEn),category=clean(theme).toLowerCase();
  if(!title_fr || title_fr.length>100)throw new Error("Le nom français est obligatoire (1 à 100 caractères).");
  if(title_en.length>100)throw new Error("Le nom anglais doit contenir au maximum 100 caractères.");
  if(!/^[a-z0-9][a-z0-9_-]{0,59}$/.test(category))throw new Error("Le thème doit être un identifiant de 1 à 60 caractères (lettres a-z, chiffres, _ ou -).");
  return {title_fr,title_en:title_en||null,theme:category};
}

export async function validateDraftPng(file) {
  if(!file || typeof file.size!=="number" || typeof file.slice!=="function")
    throw new Error("Choisissez un fichier PNG.");
  if(file.size<8 || file.size>MAX_DRAFT_BYTES)
    throw new Error("Le PNG doit faire entre 8 octets et 6 Mo.");
  if(file.type && file.type!=="image/png")throw new Error("Seuls les fichiers PNG sont acceptés.");
  const name=typeof file.name==="string"?file.name:"";
  if(!/\.png$/i.test(name))throw new Error("Le nom du fichier doit se terminer par .png.");
  const header=new Uint8Array(await file.slice(0,8).arrayBuffer());
  if(!pngSignature.every((n,i)=>header[i]===n))
    throw new Error("Ce fichier ne contient pas la signature d'une image PNG.");
  return true;
}

async function getVerifiedId(client) {
  const {data,error}=await client.auth.getUser();
  if(error)throw error;
  return data?.user?.id || null;
}

async function requireAdmin(client,verifiedUserId,inProgress=false) {
  if(await getVerifiedId(client)!==verifiedUserId)
    throw new Error(inProgress?"Session modifiée pendant l'importation.":"Session administrateur expirée ou modifiée.");
  const role=await client.from("pictau_admins").select("user_id").eq("user_id",verifiedUserId).maybeSingle();
  if(role.error)throw role.error;
  if(role.data?.user_id!==verifiedUserId)
    throw new Error("Ce compte ne possède pas l'autorisation Super Admin.");
}

export async function importPrivateDraft(client,verifiedUserId,file,metadata,makeId=()=>globalThis.crypto.randomUUID()) {
  if(!uuid.test(verifiedUserId||""))throw new Error("Connexion administrateur requise.");
  await requireAdmin(client,verifiedUserId);

  const normalized=validateDraftMetadata(metadata);
  await validateDraftPng(file);
  // La lecture du fichier est asynchrone : revalider les droits avant tout upload.
  await requireAdmin(client,verifiedUserId,true);
  const identifier=makeId();
  if(!uuid.test(identifier))throw new Error("Identifiant d'importation invalide.");
  const imagePath=`imports/${verifiedUserId}/${identifier}.png`;
  const bucket=client.storage.from(DRAFT_BUCKET);
  const upload=await bucket.upload(imagePath,file,{contentType:"image/png",cacheControl:"3600",upsert:false});
  if(upload.error)throw upload.error;

  try{
    // Le transfert peut durer : refuser la création d'une fiche si la session
    // ou le rôle Super Admin a été révoqué, puis nettoyer uniquement cet upload.
    await requireAdmin(client,verifiedUserId,true);
    const record={
      ...normalized,
      image_path:imagePath,
      created_by:verifiedUserId,
      status:"draft",
      published_at:null,
      crop_data:{
        source:"manual-super-admin-upload",
        original_filename:String(file.name).slice(0,180),
        file_bytes:file.size
      }
    };
    const inserted=await client.from("pictau_assets").insert(record);
    if(inserted.error)throw inserted.error;
    return {status:"draft",imagePath};
  }catch(error){
    // Evite les fichiers orphelins si l'écriture de la fiche échoue.
    // La suppression est volontairement limitée au chemin créé ici.
    try{
      const cleanup=await bucket.remove([imagePath]);
      if(cleanup.error)throw cleanup.error;
    }catch{
      throw new Error("L'importation a échoué et le fichier privé n'a pas pu être nettoyé. Vérification manuelle nécessaire.",{cause:error});
    }
    throw error;
  }
}
