// Préférences des pictogrammes d'EXEMPLE uniquement, locales à ce navigateur.
// Ne pas présenter ces entrées comme une banque publiée ou un compte synchronisé.
export const MAX_LOCAL_FAVORITES=60;
export const MAX_LOCAL_RECENT=8;
export function sanitizedDemoIds(value,allowedIds,max=MAX_LOCAL_FAVORITES){
  if(!Array.isArray(value)||!Array.isArray(allowedIds))return [];
  const allowed=new Set(allowedIds),result=[];
  for(const item of value){
    if(typeof item!=="string"||!allowed.has(item)||result.includes(item))continue;
    result.push(item);
    if(result.length>=max)break;
  }
  return result;
}
export function toggleDemoFavorite(favorites,id,allowedIds){
  const saved=sanitizedDemoIds(favorites,allowedIds);
  if(!allowedIds.includes(id))return saved;
  return saved.includes(id)?saved.filter(x=>x!==id):saved.slice(0,MAX_LOCAL_FAVORITES-1).concat(id);
}
export function recordDemoRecent(recent,id,allowedIds){
  if(!allowedIds.includes(id))return sanitizedDemoIds(recent,allowedIds,MAX_LOCAL_RECENT);
  return [id,...sanitizedDemoIds(recent,allowedIds,MAX_LOCAL_RECENT).filter(x=>x!==id)].slice(0,MAX_LOCAL_RECENT);
}
export function libraryResults(items,baseResults,view,favoriteIds){
  if(view!=="favorites")return baseResults;
  const ids=new Set(favoriteIds);
  return baseResults.filter(item=>ids.has(item.id));
}
