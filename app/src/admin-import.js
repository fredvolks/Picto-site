import {inspectCompletePngBytes} from "./admin-review.js";
// Import volontaire d'un PNG dans la banque PRIVÉE du Super Admin.
// Aucune approbation ni publication automatique. Les politiques RLS Supabase
// sont l'autorité finale, indépendamment des contrôles d'interface.
export const DRAFT_BUCKET = "pictau-drafts";
export const MAX_DRAFT_BYTES = 6 * 1024 * 1024;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;


export function validateDraftMetadata({titleFr,titleEn="",theme="autres"}={}) {
  const clean = value => typeof value==="string" ? value.trim().replace(/\s+/g," ") : "";
  const title_fr=clean(titleFr),title_en=clean(titleEn),category=clean(theme).toLowerCase();
  if(!title_fr || title_fr.length>100)throw new Error("Le nom français est obligatoire (1 à 100 caractères).");
  if(title_en.length>100)throw new Error("Le nom anglais doit contenir au maximum 100 caractères.");
  if(!/^[a-z0-9][a-z0-9_-]{0,59}$/.test(category))throw new Error("Le thème doit être un identifiant de 1 à 60 caractères (lettres a-z, chiffres, _ ou -).");
  return {title_fr,title_en:title_en||null,theme:category};
}

// CRC et blocs corrects ne garantissent pas que les pixels compressés sont
// lisibles. Dans le navigateur, faire aussi décoder le PNG sans jamais l'envoyer.
async function ensureBrowserCanDecodeDraft(file,dimensions){
  const expectedWidth=dimensions.width,expectedHeight=dimensions.height;
  if(typeof globalThis.createImageBitmap==="function"){
    let bitmap;
    try{
      bitmap=await globalThis.createImageBitmap(file);
      if(bitmap.width!==expectedWidth||bitmap.height!==expectedHeight)
        throw Error("Dimensions décodées incompatibles.");
    }catch{
      throw Error("Impossible de décoder le dessin PNG. Choisissez une image valide.");
    }finally{
      bitmap?.close?.();
    }
    return;
  }
  // Repli pour les versions Safari sans createImageBitmap.
  if(typeof globalThis.document==="undefined")return; // tests Node sans DOM
  if(typeof globalThis.Image!=="function"||
     typeof globalThis.URL?.createObjectURL!=="function"||
     typeof globalThis.URL?.revokeObjectURL!=="function")
    throw Error("Ce navigateur ne peut pas vérifier le PNG avant importation.");
  const url=globalThis.URL.createObjectURL(file);
  try{
    const decoded=await new Promise((resolve,reject)=>{
      const img=new globalThis.Image();
      img.onload=()=>resolve({width:img.naturalWidth,height:img.naturalHeight});
      img.onerror=()=>reject(Error("PNG illisible."));
      img.src=url;
    });
    if(decoded.width!==expectedWidth||decoded.height!==expectedHeight)
      throw Error("Dimensions PNG décodées incompatibles.");
  }catch{
    throw Error("Impossible de décoder le dessin PNG. Choisissez une image valide.");
  }finally{
    globalThis.URL.revokeObjectURL(url);
  }
}

export async function validateDraftPng(file) {
  if(!file || typeof file.size!=="number" || typeof file.slice!=="function")
    throw new Error("Choisissez un fichier PNG.");
  if(file.size<8 || file.size>MAX_DRAFT_BYTES)
    throw new Error("Le PNG doit faire entre 8 octets et 6 Mo.");
  if(file.type && file.type!=="image/png")throw new Error("Seuls les fichiers PNG sont acceptés.");
  const name=typeof file.name==="string"?file.name:"";
  if(!/\.png$/i.test(name))throw new Error("Le nom du fichier doit se terminer par .png.");
  // Le fichier (6 Mo maximum) est vérifié entièrement AVANT la première
  // mutation Supabase, même dans un lot mixte de vingt PNG.
  const bytes=new Uint8Array(await file.slice(0,file.size).arrayBuffer());
  if(bytes.length!==file.size)
    throw new Error("Lecture du fichier PNG incomplète.");
  const dimensions=inspectCompletePngBytes(bytes);
  await ensureBrowserCanDecodeDraft(file,dimensions);
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

// Un INSERT peut être persisté alors que son accusé réseau est perdu.
// Ne jamais traiter le seul résultat de insert() comme preuve d'absence ou
// comme reçu; relire sous la session Super Admin et comparer l'actif réel.
async function readVerifiedImportedDraft(client,uid,imagePath,expected){
  await requireAdmin(client,uid,true);
  const found=await client.from("pictau_assets")
    .select("id,created_by,title_fr,title_en,theme,image_path,status,published_at,crop_data")
    .eq("image_path",imagePath).maybeSingle();
  if(found.error)throw found.error;
  const row=found.data;
  if(!row)return null;
  if(!uuid.test(row.id||"")||row.created_by!==uid||
     row.image_path!==imagePath||row.title_fr!==expected.title_fr||
     row.title_en!==expected.title_en||row.theme!==expected.theme||
     row.status!=="draft"||row.published_at!==null||
     row.crop_data?.source!=="manual-super-admin-upload")
    throw new Error("La fiche privée importée diffère de celle demandée.");
  await requireAdmin(client,uid,true);
  return {status:"draft",imagePath};
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

  let insertStarted=false,insertRejected=false;
  try{
    // Avant l'INSERT, une révocation autorise le nettoyage de ce nouvel upload.
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
    insertStarted=true;
    const inserted=await client.from("pictau_assets").insert(record);
    // Une réponse explicite de rejet SQL est différente d'une réponse perdue.
    if(inserted.error){insertRejected=true;throw inserted.error;}
    const confirmed=await readVerifiedImportedDraft(client,verifiedUserId,imagePath,normalized);
    if(!confirmed)throw new Error("Fiche privée non confirmée après INSERT.");
    return confirmed;
  }catch(error){
    if(insertStarted){
      let recovered;
      try{
        recovered=await readVerifiedImportedDraft(client,verifiedUserId,imagePath,normalized);
      }catch{
        // Si la lecture RLS, la session ou les métadonnées sont incertaines,
        // supprimer le PNG risquerait de laisser une fiche SQL sans fichier.
        throw new Error("Importation incertaine : PNG privé conservé pour vérification manuelle.",{cause:error});
      }
      if(recovered)return recovered;
      if(!insertRejected)
        throw new Error("Importation incertaine : PNG privé conservé pour vérification manuelle.",{cause:error});
    }
    // Ne nettoyer que si l'INSERT n'a jamais commencé ou si le serveur
    // l'a explicitement rejeté ET que la relecture ne trouve aucune fiche.
    try{
      const cleanup=await bucket.remove([imagePath]);
      if(cleanup.error)throw cleanup.error;
    }catch{
      throw new Error("L'importation a échoué et le fichier privé n'a pas pu être nettoyé. Vérification manuelle nécessaire.",{cause:error});
    }
    throw error;
  }
}


// Importation multiple de vrais PNG privés : prévalidation TOTALE avant la
// première écriture puis import séquentiel, sans publication automatique.
// Une réponse de serveur incertaine arrête le lot, JAMAIS de reprise aveugle.
export const MAX_PRIVATE_DRAFT_BATCH=20;

/**
 * Contrôle local des images sélectionnées AVANT de proposer l'importation.
 * La sélection peut changer pendant un décodage asynchrone : isCurrent
 * empêche qu'un ancien résultat soit présenté comme valide.
 * Aucune lecture Supabase ni mutation Storage/SQL ici.
 */
export async function preflightPrivateDraftFiles(files,{isCurrent=()=>true,onChecked=()=>{}}={}){
  if(!Array.isArray(files)||files.length<1||files.length>MAX_PRIVATE_DRAFT_BATCH)
    throw Error("Sélectionnez de 1 à 20 fichiers PNG.");
  if(typeof isCurrent!=="function"||typeof onChecked!=="function")
    throw Error("Contrôle des PNG invalide.");
  for(const [index,file] of files.entries()){
    if(!isCurrent())return false;
    try{
      await validateDraftPng(file);
    }catch(error){
      throw Error("Image "+(index+1)+" sur "+files.length+" : "+
        String(error?.message||"PNG invalide."));
    }
    if(!isCurrent())return false;
    try{onChecked({completed:index+1,total:files.length});}
    catch{/* La progression n'est jamais une preuve de validité et ne relance aucun upload. */}
  }
  return true;
}


export function draftTitleFromFilename(filename){
  if(typeof filename!=="string"||filename.length>255||
     !/\.png$/i.test(filename)||/[\p{C}/\\]/u.test(filename))
    throw Error("Nom de fichier PNG invalide.");
  const title=filename.slice(0,-4).normalize("NFC").replace(/[_-]+/g," ")
    .trim().replace(/\s+/g," ");
  if(!title||title.length>100||!/[\p{L}\p{N}]/u.test(title))throw Error("Nom français issu du PNG invalide (maximum 100 caractères).");
  return title;
}

export async function preparePrivateDraftBatch(files,theme="autres",titles=null,englishTitles=null,themes=null){
  if(!Array.isArray(files)||files.length<1||files.length>MAX_PRIVATE_DRAFT_BATCH)
    throw Error("Sélectionnez de 1 à 20 fichiers PNG.");
  if(titles!==null&&(!Array.isArray(titles)||titles.length!==files.length))
    throw Error("Les noms du lot ne correspondent pas aux fichiers sélectionnés.");
  if(englishTitles!==null&&(!Array.isArray(englishTitles)||englishTitles.length!==files.length||
     englishTitles.some(value=>typeof value!=="string")))
    throw Error("Les noms anglais du lot ne correspondent pas aux fichiers sélectionnés.");
  if(themes!==null&&(!Array.isArray(themes)||themes.length!==files.length||
     themes.some(value=>typeof value!=="string")))
    throw Error("Les thèmes du lot ne correspondent pas aux fichiers sélectionnés.");
  const entries=[],seen=new Set();
  for(const [index,file] of files.entries()){
    const suggested=draftTitleFromFilename(file?.name);
    const metadata={titleFr:titles===null?suggested:titles[index],
      titleEn:englishTitles===null?"":englishTitles[index],theme:themes===null?theme:themes[index]};
    const normalized=validateDraftMetadata(metadata);
    const key=normalized.title_fr.toLocaleLowerCase("fr");
    if(seen.has(key))throw Error("Deux PNG du lot portent le même nom : "+normalized.title_fr);
    seen.add(key);
    try{
      await validateDraftPng(file);
    }catch(error){
      // Localiser le fichier fautif dans un lot sans jamais en envoyer une
      // partie, même si le nom saisi contient des caractères HTML.
      throw Error("Image "+(index+1)+" sur "+files.length+" : "+
        String(error?.message||"PNG invalide."));
    }
    entries.push({file,metadata:{...metadata,titleFr:normalized.title_fr}});
  }
  return entries;
}

export async function importPrivateDraftBatch(client,uid,files,theme,{
 onProgress=()=>{},isCurrent=()=>true,importOne=importPrivateDraft,titles=null,englishTitles=null,themes=null
}={}){
  // Si un PNG est corrompu ou un nom invalide, aucun fichier n'est envoyé.
  const entries=await preparePrivateDraftBatch(files,theme,titles,englishTitles,themes);
  if(typeof onProgress!=="function"||typeof isCurrent!=="function"||
     typeof importOne!=="function")throw Error("Opération de lot invalide.");
  let completed=0;
  for(let i=0;i<entries.length;i++){
    if(!isCurrent())return {
      completed,total:entries.length,failedIndex:i,error:"Session ou lot modifié : importation arrêtée."
    };
    try{
      await importOne(client,uid,entries[i].file,entries[i].metadata);
      completed++;
      try{onProgress({completed,total:entries.length,name:entries[i].metadata.titleFr});}
      catch{/* Un message d'interface ne doit pas créer un faux échec d'INSERT. */}
    }catch(error){
      return {
        completed,total:entries.length,failedIndex:i,
        name:entries[i].metadata.titleFr,error:String(error?.message||error)
      };
    }
  }
  return {completed,total:entries.length,failedIndex:null,error:""};
}
