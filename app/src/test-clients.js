// Super Admin: appels sans privilèges navigateur à la fonction Pict-au Auth.
// Les identifiants temporaires ne sont jamais stockés en localStorage.
export const TEST_CLIENT_PLANS=Object.freeze(["decouverte","famille","professionnel"]);
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function validateTestClientInput(input={}) {
  const label=String(input.label||"").trim(),plan=String(input.plan||"");
  if(!label||label.length>50||/[<>\x00-\x1f]/.test(label))
    throw Error("Nom du compte de test invalide (1–50 caractères).");
  if(!TEST_CLIENT_PLANS.includes(plan))throw Error("Forfait de simulation invalide.");
  return {label,plan};
}
async function verify(client,uid) {
  if(!UUID.test(uid||""))throw Error("Session requise.");
  const r=await client.auth.getUser();
  if(r.error)throw r.error;
  if(r.data?.user?.id!==uid)throw Error("La session a changé.");
}
async function send(client,uid,body) {
  await verify(client,uid);
  const r=await client.functions.invoke("pictau-test-clients",{body});
  if(r.error)throw Error("Service clients de test indisponible ou accès refusé.");
  if(!r.data||typeof r.data!=="object"||r.data.error)
    throw Error(String(r.data?.error||"Réponse invalide du serveur."));
  await verify(client,uid);
  return r.data;
}
export async function listTestClients(client,uid) {
  const result=await send(client,uid,{action:"list"});
  if(!Array.isArray(result.items)||result.items.length>100||
     result.items.some(x=>!UUID.test(x.user_id||"")||
       typeof x.label!=="string"||typeof x.email!=="string"||
       !TEST_CLIENT_PLANS.includes(x.simulated_plan)))
    throw Error("Liste de comptes de test incohérente.");
  return result.items;
}
export async function createTestClient(client,uid,input) {
  const data=await send(client,uid,{action:"create",...validateTestClientInput(input)});
  if(!UUID.test(data.created?.user_id||"")||
     typeof data.created?.email!=="string"||
     typeof data.created?.password!=="string"||data.created.password.length<20)
    throw Error("Le serveur n'a pas confirmé les identifiants.");
  return data.created;
}
export async function setTestClientPlan(client,uid,id,plan) {
  if(!UUID.test(id||"")||!TEST_CLIENT_PLANS.includes(plan))
    throw Error("Compte ou forfait invalide.");
  const data=await send(client,uid,{action:"update-plan",user_id:id,plan});
  if(data.updated?.user_id!==id||data.updated.simulated_plan!==plan)
    throw Error("Changement de forfait non confirmé.");
  return data.updated;
}
export async function deleteTestClient(client,uid,id) {
  if(!UUID.test(id||""))throw Error("Identifiant invalide.");
  const data=await send(client,uid,{action:"delete",user_id:id});
  if(data.deleted?.user_id!==id)throw Error("Suppression non confirmée.");
  return data.deleted;
}
