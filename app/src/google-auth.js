// Pict-au : authentification Supabase Google et courriel (clé PUBLIABLE seulement).
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
// Courriel : connexion à un compte EXISTANT, sans créer de compte ni attribuer de rôle.
export function validEmailAddress(value){
  const email=String(value||"").trim();
  if(email.length>254||!/^\S+@\S+\.\S+$/.test(email))throw Error("Adresse courriel invalide.");
  return email;
}
export async function loginWithEmail(email,password,client){
  const address=validEmailAddress(email);
  if(typeof password!=="string"||!password)throw Error("Mot de passe requis.");
  const c=client||await supabaseClient();
  const {error}=await c.auth.signInWithPassword({email:address,password});
  if(error)throw error;
}
export async function sendEmailSignInLink(email,href,client){
  const address=validEmailAddress(email);
  const c=client||await supabaseClient();
  const {error}=await c.auth.signInWithOtp({
    email:address,options:{shouldCreateUser:false,emailRedirectTo:redirectAfterLogin(href)}
  });
  if(error)throw error;
}
export async function sendPasswordReset(email,href,client){
  const address=validEmailAddress(email);
  const c=client||await supabaseClient();
  const {error}=await c.auth.resetPasswordForEmail(address,{redirectTo:redirectAfterLogin(href)});
  if(error)throw error;
}
export async function updateEmailPassword(password,client){
  if(typeof password!=="string"||password.length<8||password.length>128)
    throw Error("Mot de passe de 8 à 128 caractères requis.");
  const c=client||await supabaseClient();
  const {error}=await c.auth.updateUser({password});
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
