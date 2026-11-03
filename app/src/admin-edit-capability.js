// A missing or unavailable RPC is not permission to write.
// The RPC exists only after the server-side draft metadata guard is installed.
export async function readDraftEditCapability(client){
  if(typeof client?.rpc!=="function")return false;
  try{
    const {data,error}=await client.rpc("pictau_draft_metadata_can_edit");
    return !error && data===true;
  }catch{
    return false;
  }
}
