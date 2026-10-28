// Demandes de pictogrammes Pict-au : authentification et RLS restent obligatoires.
// Ce module ne publie ni ne génère automatiquement de pictogramme.
export const REQUEST_PAGE_SIZE=20;
export const REQUEST_STATUSES=Object.freeze(["submitted","in_progress","accepted","rejected","published","already_available"]);
export const REQUEST_LABELS=Object.freeze({
 submitted:{fr:"Envoyée",en:"Submitted"},in_progress:{fr:"En cours",en:"In progress"},
 accepted:{fr:"Acceptée",en:"Accepted"},rejected:{fr:"Refusée",en:"Declined"},
 published:{fr:"Publiée",en:"Published"},already_available:{fr:"Déjà disponible",en:"Already available"}
});
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ownFields="id,subject,description,theme,status,admin_note,linked_asset_id,created_at,updated_at";
const adminFields="id,requester_id,subject,description,theme,status,admin_note,linked_asset_id,handled_by,created_at,updated_at";
export function validateRequestForm({subject="",description="",theme=""}={}){
 const clean=value=>typeof value==="string"?value.replace(/\s+/g," ").trim():"";
 const title=clean(subject),detail=clean(description),category=clean(theme).toLowerCase();
 if(title.length<3||title.length>100)throw new Error("Le sujet doit contenir de 3 à 100 caractères.");
 if(detail.length<10||detail.length>1200)throw new Error("La description doit contenir de 10 à 1 200 caractères.");
 if(category && !/^[a-z0-9][a-z0-9_-]{0,59}$/.test(category))
   throw new Error("Le thème facultatif doit contenir uniquement a-z, chiffres, _ ou -.");
 return {subject:title,description:detail,theme:category||null};
}
function validPage(page){
 if(!Number.isSafeInteger(page)||page<0||page>100000)throw new Error("Numéro de page invalide.");
 return page;
}
async function verifyUser(client,uid){
 if(!UUID.test(uid||""))throw new Error("Connectez-vous pour demander un pictogramme.");
 const session=await client.auth.getUser();
 if(session.error)throw session.error;
 if(session.data?.user?.id!==uid)throw new Error("La session a changé. Reconnectez-vous.");
}
async function verifyAdmin(client,uid){
 await verifyUser(client,uid);
 const role=await client.from("pictau_admins").select("user_id").eq("user_id",uid).maybeSingle();
 if(role.error)throw role.error;
 if(role.data?.user_id!==uid)throw new Error("Accès Super Admin refusé.");
}
export async function submitPictogramRequest(client,uid,input){
 const values=validateRequestForm(input);
 await verifyUser(client,uid);
 const added=await client.from("pictau_requests")
  .insert({...values,requester_id:uid,status:"submitted"})
  .select(ownFields).single();
 if(added.error)throw added.error;
 if(!added.data||added.data.status!=="submitted"||!UUID.test(added.data.id||""))
   throw new Error("La demande n'a pas été confirmée par le serveur.");
 await verifyUser(client,uid);
 return added.data;
}
export async function listMyPictogramRequests(client,uid,{page=0}={}){
 validPage(page);await verifyUser(client,uid);
 const result=await client.from("pictau_requests").select(ownFields,{count:"exact"})
  .eq("requester_id",uid).order("created_at",{ascending:false}).order("id",{ascending:true})
  .range(page*REQUEST_PAGE_SIZE,(page+1)*REQUEST_PAGE_SIZE-1);
 if(result.error)throw result.error;
 if(!Number.isSafeInteger(result.count)||result.count<0)throw Error("Total des demandes indisponible.");
 await verifyUser(client,uid);
 return {items:result.data||[],total:result.count,page,pageSize:REQUEST_PAGE_SIZE};
}
export async function listAdminPictogramRequests(client,uid,{page=0,status="all",query="",sort="recent"}={}){
 validPage(page);if(status!=="all"&&!REQUEST_STATUSES.includes(status))throw Error("Statut invalide.");
 if(!["recent","oldest"].includes(sort))throw Error("Tri invalide.");
 if(typeof query!=="string"||query.length>80||(query&&!/^[\p{L}\p{N} '-]+$/u.test(query)))throw Error("Recherche invalide.");
 await verifyAdmin(client,uid);
 let q=client.from("pictau_requests").select(adminFields,{count:"exact"});
 if(status!=="all")q=q.eq("status",status);
 if(query.trim()){const pattern="%"+query.trim()+"%";q=q.or("subject.ilike."+pattern+",description.ilike."+pattern);}
 const r=await q.order("created_at",{ascending:sort==="oldest"}).order("id",{ascending:true})
  .range(page*REQUEST_PAGE_SIZE,(page+1)*REQUEST_PAGE_SIZE-1);
 if(r.error)throw r.error;
 if(!Number.isSafeInteger(r.count)||r.count<0)throw Error("Total des demandes indisponible.");
 await verifyAdmin(client,uid);
 return {items:r.data||[],total:r.count,page,pageSize:REQUEST_PAGE_SIZE};
}
export async function updateAdminPictogramRequest(client,uid,id,{status,adminNote="",linkedAssetId=null}={}){
 if(!UUID.test(id||"")||!REQUEST_STATUSES.includes(status)||status==="submitted")
   throw Error("Demande ou nouveau statut invalide.");
 const note=typeof adminNote==="string"?adminNote.trim():"";
 if(note.length>1000)throw Error("Note de suivi trop longue.");
 if(linkedAssetId!==null&&!UUID.test(linkedAssetId))throw Error("Pictogramme associé invalide.");
 if(["published","already_available"].includes(status)&&!linkedAssetId)
   throw Error("Associez d'abord un pictogramme réellement publié.");
 if(!["published","already_available"].includes(status)&&linkedAssetId)
   throw Error("L'association est réservée aux pictogrammes déjà publiés.");
 await verifyAdmin(client,uid);
 const r=await client.from("pictau_requests")
  .update({status,admin_note:note||null,linked_asset_id:linkedAssetId})
  .eq("id",id).select(adminFields).maybeSingle();
 if(r.error)throw r.error;
 if(!r.data||r.data.status!==status)throw Error("Mise à jour non confirmée : actualisez.");
 await verifyAdmin(client,uid);
 return r.data;
}
export async function listPictogramRequestHistory(client,uid,requestId){
 if(!UUID.test(requestId||""))throw Error("Identifiant de demande invalide.");
 await verifyUser(client,uid);
 const r=await client.from("pictau_request_events").select("id,request_id,actor_id,old_status,new_status,created_at")
  .eq("request_id",requestId).order("created_at",{ascending:true}).limit(100);
 if(r.error)throw r.error;
 await verifyUser(client,uid);
 return r.data||[];
}
