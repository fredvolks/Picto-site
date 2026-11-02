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
export async function readAdminBank(client, verifiedUserId, filters={}) {
  const f=normalizeAdminBankFilters(filters);
  if(!verifiedUserId)return {...empty};
  const session=await client.auth.getUser();
  if(session.error)throw session.error;
  if(session.data?.user?.id!==verifiedUserId)return {...empty};
  const role=await client.from("pictau_admins")
    .select("user_id").eq("user_id",verifiedUserId).maybeSingle();
  if(role.error)throw role.error;
  if(role.data?.user_id!==verifiedUserId)return {...empty};

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
  if(!Number.isSafeInteger(response.count)||response.count<0)
    throw new Error("Total de fiches indisponible : la pagination ne peut être vérifiée.");
  return {
    authorized:true,
    items:Array.isArray(response.data)?response.data:[],
    total:response.count,
    page:f.page,
    pageSize:ADMIN_BANK_PAGE_SIZE
  };
}
