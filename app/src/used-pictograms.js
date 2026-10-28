// « Mes pictogrammes utilisés » : la lecture est limitée au propriétaire par RLS.
// Les PNG dépubliés restent invisibles même si l'historique garde leur ID.
export const USED_PAGE_SIZE=24;
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const COLS="owner_id,pictogram_id,last_used_at,approved_id,title_fr,title_en,theme,image_path";
export function normalizeUsedFilters({query="",theme="all",sort="recent",page=0}={}){
  if(typeof query!=="string"||query.length>80||!/^[\p{L}\p{N} '\-]*$/u.test(query))
    throw Error("Recherche invalide.");
  if(theme!=="all"&&(typeof theme!=="string"||!/^[a-z0-9][a-z0-9_-]{0,59}$/.test(theme)))
    throw Error("Filtre invalide.");
  if(!["recent","name"].includes(sort))throw Error("Tri invalide.");
  if(!Number.isSafeInteger(page)||page<0||page>100000)throw Error("Page invalide.");
  return {query:query.trim().replace(/\s+/g," "),theme,sort,page};
}
async function authenticated(client,uid){
  if(!UUID.test(uid||""))throw Error("Session requise.");
  const r=await client.auth.getUser();
  if(r.error)throw r.error;
  if(r.data?.user?.id!==uid)throw Error("La session a changé.");
}
export function approvedFromUsage(row){
  if(!row||!UUID.test(row.pictogram_id||"")||row.approved_id!==row.pictogram_id||
    typeof row.title_fr!=="string"||!row.title_fr.trim()||
    typeof row.image_path!=="string"||row.image_path!=="items/"+row.pictogram_id+".png"||
    typeof row.theme!=="string"||!/^[a-z0-9][a-z0-9_-]{0,59}$/.test(row.theme))return null;
  return {id:row.approved_id,title_fr:row.title_fr,title_en:row.title_en||null,
    theme:row.theme,image_path:row.image_path};
}
// Sélection temporaire, sans écriture au serveur. Conservée entre filtres et pages,
// mais jamais entre comptes. L'export revalide toujours les images officielles.
export const MAX_USED_CHOICES=16;
export function toggleUsedChoice(current,id,visibleRows){
  if(!(current instanceof Map)||!Array.isArray(visibleRows)||current.size>MAX_USED_CHOICES)
    throw Error("Sélection de pictogrammes invalide.");
  const item=approvedFromUsage(visibleRows.find(row=>row?.pictogram_id===id));
  if(!item||item.id!==id)throw Error("Pictogramme indisponible pour la sélection.");
  const next=new Map(current);
  if(next.has(id))next.delete(id);
  else{
    if(next.size>=MAX_USED_CHOICES)throw Error("Maximum de 16 pictogrammes sélectionnés.");
    next.set(id,item);
  }
  return next;
}
// Retirer un seul choix, même lorsqu'il est masqué par un filtre ou sur une autre page.
// Aucun appel réseau ni modification de la composition déjà sauvegardée.
export function removeUsedChoice(current,id){
  if(!(current instanceof Map)||current.size>MAX_USED_CHOICES||!UUID.test(id||""))
    throw Error("Sélection de pictogrammes invalide.");
  const next=new Map(current);
  next.delete(id);
  return next;
}
export function selectedUsedChoices(current){
  if(!(current instanceof Map)||current.size>MAX_USED_CHOICES)
    throw Error("Sélection de pictogrammes invalide.");
  return [...current.values()].map(item=>({...item}));
}

export async function listUsedPictograms(client,uid,filters={}){
  const f=normalizeUsedFilters(filters);
  await authenticated(client,uid);
  let q=client.from("pictau_used_catalog").select(COLS,{count:"exact"}).eq("owner_id",uid);
  if(f.query)q=q.or("title_fr.ilike.%"+f.query+"%,title_en.ilike.%"+f.query+"%");
  if(f.theme!=="all")q=q.eq("theme",f.theme);
  if(f.sort==="name")q=q.order("title_fr",{ascending:true,nullsFirst:false});
  else q=q.order("last_used_at",{ascending:false});
  const r=await q.order("pictogram_id",{ascending:true})
    .range(f.page*USED_PAGE_SIZE,(f.page+1)*USED_PAGE_SIZE-1);
  if(r.error)throw r.error;
  if(!Number.isSafeInteger(r.count)||r.count<0||!Array.isArray(r.data))
    throw Error("Historique indisponible.");
  if(r.data.some(row=>row.owner_id!==uid||!UUID.test(row.pictogram_id||"")))
    throw Error("Historique privé invalide.");
  await authenticated(client,uid);
  return {items:r.data,total:r.count,page:f.page};
}

// Quand le catalogue officiel évolue sur un autre appareil (dépublication,
// changement de filtre), le feuillet courant peut cesser d'exister. Ne jamais
// conclure que le compte ne possède aucun usage si le compte exact est > 0.
export function lastUsedPictogramsPage(total){
  if(!Number.isSafeInteger(total)||total<0)throw Error("Historique indisponible.");
  return Math.max(0,Math.ceil(total/USED_PAGE_SIZE)-1);
}
export async function listUsedPictogramsAvailablePage(client,uid,filters={}){
  let page=filters.page??0;
  if(!Number.isSafeInteger(page)||page<0||page>100000)throw Error("Page invalide.");
  // Chaque lecture passe par les mêmes vérifications Auth/RLS et validation de
  // l'identité du propriétaire. Un catalogue fluctuant ne cause jamais de boucle.
  for(let attempt=0;attempt<3;attempt++){
    const result=await listUsedPictograms(client,uid,{...filters,page});
    const last=lastUsedPictogramsPage(result.total);
    if(page<=last)return {...result,page};
    if(result.total===0)return {...result,page:0};
    page=last;
  }
  throw Error("L’historique a changé. Actualisez vos pictogrammes utilisés.");
}
