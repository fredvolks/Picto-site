// Recherche et pagination côté Supabase de la banque PRIVÉE Pict-au.
// Pas de clé privilégiée : les RLS restent la source d'autorisation.
// Une page ne contient jamais le chemin des images (chargement séparé par l'aperçu).
export const ADMIN_BANK_PAGE_SIZE=24;
const fields="id,created_by,title_fr,title_en,theme,status,created_at,published_at,admin_name";
const empty={authorized:false,items:[],total:0,page:0,pageSize:ADMIN_BANK_PAGE_SIZE};

export function normalizeAdminBankFilters(filters={}) {
  const query=String(filters.query??"").trim().replace(/\s+/g," ");
  if(query.length>100 || (query && !/^[\p{L}\p{N} '-]+$/u.test(query)))
    throw new Error("Recherche invalide : utiliser des lettres, chiffres, espaces, apostrophes ou traits d'union (100 caractères maximum).");
  const status=filters.status??"all";
  if(!["all","draft","published"].includes(status))
    throw new Error("Statut de recherche invalide.");
  const theme=filters.theme??"all";
  if(theme!=="all" && (typeof theme!=="string"||!/^[a-z0-9][a-z0-9_-]{0,59}$/.test(theme)))
    throw new Error("Thème de recherche invalide.");
  const sort=filters.sort??"recent";
  if(!["recent","oldest","name","name_desc"].includes(sort))throw new Error("Tri de recherche invalide.");
  const page=filters.page??0;
  if(!Number.isSafeInteger(page)||page<0||page>100000)
    throw new Error("Page de recherche invalide.");
  return {query,status,theme,sort,page};
}

// Les filtres PostgREST imatch utilisent un motif POSIX sûr, sans caractères
// de regex fournis directement par l'utilisateur. Pas de changement SQL.
const accentClasses=Object.freeze({
  a:"[aàáâäãåā]",c:"[cçćč]",e:"[eéèêëē]",
  i:"[iíìîïī]",n:"[nñń]",o:"[oóòôöõøō]",
  u:"[uúùûüū]",y:"[yýÿ]",s:"[sśš]",z:"[zźž]"
});
export function buildAccentInsensitivePattern(query){
  const value=normalizeAdminBankFilters({query}).query;
  if(!value)return "";
  const text=value.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLocaleLowerCase("fr-CA");
  return Array.from(text,char=>{
    if(char===" ")return "[ ]";
    if(char==="-")return "[-]";
    if(char==="'")return "[']";
    return accentClasses[char]||char;
  }).join("");
}
// Une requête Supabase peut rester en vol après déconnexion, changement de
// compte ou révocation du rôle. Vérifier AVANT et APRÈS la lecture : la RLS
// protège le serveur, cette relecture évite de rendre un résultat privé périmé.
async function currentAdminVerified(client,verifiedUserId){
  const session=await client.auth.getUser();
  if(session.error)throw session.error;
  if(session.data?.user?.id!==verifiedUserId)return false;
  const role=await client.from("pictau_admins")
    .select("user_id").eq("user_id",verifiedUserId).maybeSingle();
  if(role.error)throw role.error;
  return role.data?.user_id===verifiedUserId;
}
export async function readAdminBank(client, verifiedUserId, filters={}) {
  const f=normalizeAdminBankFilters(filters);
  if(!verifiedUserId)return {...empty};
  if(!await currentAdminVerified(client,verifiedUserId))return {...empty};

  let q=client.from("pictau_assets")
    .select(fields+(f.theme!=="all"?",pictau_asset_themes!inner(theme_code)":""),{count:"exact"});
  if(f.status!=="all")q=q.eq("status",f.status);
  if(f.theme!=="all")q=q.eq("pictau_asset_themes.theme_code",f.theme);
  if(f.query){
    // ~* (imatch) prend une expression POSIX construite uniquement à
    // partir de caractères autorisés. Les crochets sont entre guillemets,
    // conformément aux règles PostgREST pour les valeurs réservées.
    const pattern=buildAccentInsensitivePattern(f.query);
    q=q.or('title_fr.imatch."'+pattern+'",title_en.imatch."'+pattern+'",admin_name.imatch."'+pattern+'",theme.imatch."'+pattern+'"');
  }
  const primary=f.sort==="name"||f.sort==="name_desc"?"admin_sort_name":"created_at";
  const ascending=f.sort==="name"||f.sort==="oldest";
  q=q.order(primary,{ascending}).order("id",{ascending:true});
  const from=f.page*ADMIN_BANK_PAGE_SIZE;
  const response=await q.range(from,from+ADMIN_BANK_PAGE_SIZE-1);
  if(response.error)throw response.error;
  // Ne jamais remettre les lignes en mémoire si les droits ont expiré au cours
  // du transport ; s'applique à chacune des lectures du repli de pagination.
  if(!await currentAdminVerified(client,verifiedUserId))return {...empty};
  if(!Number.isSafeInteger(response.count)||response.count<0)
    throw new Error("Total de fiches indisponible : la pagination ne peut être vérifiée.");
  // Un corps PostgREST absent ou partiel n'est PAS une banque vide.
  if(!Array.isArray(response.data)||response.data.length>ADMIN_BANK_PAGE_SIZE||
     response.data.length>response.count||
     (f.page*ADMIN_BANK_PAGE_SIZE>=response.count&&response.data.length>0)||
     response.data.some(row=>!row||typeof row!=="object"||
       typeof row.id!=="string"||!row.id))
    throw new Error("Réponse de la banque incohérente. Actualisez la bibliothèque.");
  return {
    authorized:true,
    items:response.data,
    total:response.count,
    page:f.page,
    pageSize:ADMIN_BANK_PAGE_SIZE
  };
}

// Les suppressions, fusions et changements de thème peuvent faire disparaître
// une page entre le clic de pagination et la réponse. Récupérer la dernière
// page existante sans jamais traiter un échec RLS ou un corps nul comme 0.
// File éditoriale L2 : navigation purement locale sur les résultats privés
// filtrés par Supabase (status=draft, ancien d'abord). N'approuve et ne publie
// jamais un PNG; chaque fiche passe par son aperçu et sa confirmation humaine.
export function planNextPrivateDraftReview({items,seen,total,page}={}){
  if(!Array.isArray(items)||!(seen instanceof Set)||
     !Number.isSafeInteger(total)||total<0||
     !Number.isSafeInteger(page)||page<0||
     items.length>ADMIN_BANK_PAGE_SIZE||
     (items.length>total)||
     items.some(row=>!row||typeof row.id!=="string"||!row.id||
       row.status!=="draft")||
     new Set(items.map(row=>row.id)).size!==items.length)
    throw Error("File de révision privée incohérente. Actualisez la banque.");
  for(const row of items){
    if(!seen.has(row.id))return {kind:"open",id:row.id};
  }
  if((page+1)*ADMIN_BANK_PAGE_SIZE<total)return {kind:"page",page:page+1};
  return {kind:"done"};
}

export function lastAdminBankPage(total){
  if(!Number.isSafeInteger(total)||total<0)
    throw new Error("Total de fiches indisponible.");
  return Math.max(0,Math.ceil(total/ADMIN_BANK_PAGE_SIZE)-1);
}
export async function readAdminBankAvailablePage(client,verifiedUserId,filters={}){
  let page=normalizeAdminBankFilters(filters).page;
  for(let attempt=0;attempt<3;attempt++){
    const result=await readAdminBank(client,verifiedUserId,{...filters,page});
    if(!result.authorized)return result;
    const last=lastAdminBankPage(result.total);
    if(result.total===0){
      if(result.items.length)throw Error("Banque incohérente : total nul avec fiches.");
      return {...result,page:0};
    }
    if(page>last){page=last;continue;}
    if(result.items.length)return result;
    // Le total est positif, mais cette page censée exister ne contient rien :
    // après trois lectures, signaler une erreur plutôt que mentir à l'admin.
  }
  throw new Error("La bibliothèque a changé. Actualisez la banque.");
}
