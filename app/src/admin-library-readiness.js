// Read-only release preflight for the real Pict-au Super Admin workspace.
// This is a DIAGNOSTIC, not authorization to publish or apply database DDL.
// The server's RLS, Auth and curated catalogue remain the only authorities.
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MISSING_TABLE_CODES=new Set(["42P01","PGRST205","PGRST200","PGRST202"]);

async function requireSameAdmin(client,uid){
  if(!UUID.test(uid||""))throw Error("Session Super Admin requise.");
  const auth=await client.auth.getUser();
  if(auth.error)throw auth.error;
  if(auth.data?.user?.id!==uid)throw Error("La session a changé.");
  const role=await client.from("pictau_admins").select("user_id").eq("user_id",uid).maybeSingle();
  if(role.error)throw role.error;
  if(role.data?.user_id!==uid)throw Error("Accès Super Admin requis.");
}
function validCount(result){
  if(result?.error)throw result.error;
  if(!Number.isSafeInteger(result?.count)||result.count<0)
    throw Error("Le serveur n'a pas confirmé le nombre de fiches.");
  return result.count;
}
async function readCount(client,table,filter,column="id"){
  let q=client.from(table).select(column,{count:"exact",head:true});
  if(filter)q=q.eq(filter[0],filter[1]);
  return validCount(await q);
}
async function readProjection(client){
  try{
    // Even if the projection has zero rows, a successful count proves that
    // the table exists and this administrator has read access.
    const count=await readCount(client,"pictau_published_theme_links",null,"catalog_id");
    return {state:"available",count};
  }catch(error){
    // Network/RLS/backend failures are UNKNOWN, not "migration absent".
    return {state:MISSING_TABLE_CODES.has(error?.code)?"missing":"unknown",count:null};
  }
}
async function readMetadataGuard(client){
  if(typeof client.rpc!=="function")return "unknown";
  try{
    const {data,error}=await client.rpc("pictau_draft_metadata_can_edit");
    if(error)return MISSING_TABLE_CODES.has(error.code)||error.code==="42883"?"missing":"unknown";
    return data===true?"available":"unknown";
  }catch{return "unknown";}
}

// Le simple fait qu'un gabarit existe ne prouve ni sa publication ni son
// association à une image approuvée. Ne jamais convertir une panne/RLS en zéro.
async function readTemplateSummary(client){
  try{
    const [privateCount,publishedCount]=await Promise.all([
      readCount(client,"pictau_templates",["is_published",false]),
      readCount(client,"pictau_templates",["is_published",true])
    ]);
    return {state:"available",private:privateCount,published:publishedCount};
  }catch(error){
    return {state:MISSING_TABLE_CODES.has(error?.code)?"missing":"unknown",
      private:null,published:null};
  }
}

// Output intentionally contains no identifiers, PNG URLs, user records or
// hidden RLS policy details; only counts and explicitly qualified signals.
export async function readAdminLibraryReadiness(client,uid){
  await requireSameAdmin(client,uid);
  const [drafts,published,guard,projection,templates]=await Promise.all([
    readCount(client,"pictau_assets",["status","draft"]),
    readCount(client,"pictau_catalog_items"),
    readMetadataGuard(client),
    readProjection(client),
    readTemplateSummary(client)
  ]);
  await requireSameAdmin(client,uid);
  return {drafts,published,guard,projection:projection.state,templates,
    // Admin-only probes do NOT independently prove client RLS or real PNG review.
    clientRlsVerified:false,imagesApprovedByHuman:false};
}
