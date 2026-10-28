// Pict-au : OAuth Google avec Supabase Auth (clé PUBLIABLE seulement).
export const SUPABASE_URL="https://hwgarcmyhmmovbxdngwc.supabase.co";
export const SUPABASE_PUBLIC_KEY="sb_publishable_vvm8ryHE14QUUQw_J9MHEw_0DtOS8C8";
export const SDK_URL="https://esm.sh/@supabase/supabase-js@2.118.0?bundle";
let pendingClient;
export function redirectAfterLogin(currentHref){
  const current=new URL(currentHref);
  if(current.protocol!=="https:"&&!(current.protocol==="http:"&&["localhost","127.0.0.1"].includes(current.hostname)))
    throw Error("Connexion Google : HTTPS ou localhost requis.");
  // Ne pas perdre le préfixe GitHub Pages /Picto-site/ ni envoyer le code OAuth au mauvais endroit.
  return new URL("./",current).href;
}
export async function supabaseClient(){
  if(!pendingClient){
    pendingClient=import(SDK_URL).then(({createClient})=>{
      if(typeof createClient!=="function")throw Error("Chargement de Supabase impossible.");
      return createClient(SUPABASE_URL,SUPABASE_PUBLIC_KEY,{
        auth:{flowType:"pkce",detectSessionInUrl:true,persistSession:true,autoRefreshToken:true,storageKey:"pictau-web-auth"}
      });
    }).catch(e=>{pendingClient=null;throw e;});
  }
  return pendingClient;
}
export async function loginGoogle(href){
  const client=await supabaseClient();
  const {error}=await client.auth.signInWithOAuth({
    provider:"google",options:{redirectTo:redirectAfterLogin(href),queryParams:{prompt:"select_account"}}
  });
  if(error)throw error;
}
export async function currentVerifiedUser(client){
  const c=client||await supabaseClient();
  const {data,error}=await c.auth.getUser();
  if(error)throw error;
  return data?.user?{id:data.user.id,email:data.user.email||""}:null;
}
export async function logoutGoogle(){
  const client=await supabaseClient();
  const {error}=await client.auth.signOut();
  if(error)throw error;
}
