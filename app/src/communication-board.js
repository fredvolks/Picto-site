// Tableau de communication LOCAL DE DÉMONSTRATION.
// Ni norme de grille finale ni banque publiée ni synchronisation compte.
// Les dimensions et limites restent à approuver par le propriétaire.
export const DEMO_BOARD_CAP=16;
export const DEMO_BOARD_COLUMNS=[2,3,4];

export function sanitizeDemoBoard(ids,allowedIds){
  if(!Array.isArray(ids))return [];
  const allowed=new Set(allowedIds);
  return ids.filter(id=>typeof id==="string"&&allowed.has(id)).slice(0,DEMO_BOARD_CAP);
}
export function addDemoBoardItem(ids,id,allowedIds){
  const safe=sanitizeDemoBoard(ids,allowedIds);
  return safe.length<DEMO_BOARD_CAP&&allowedIds.includes(id)?[...safe,id]:safe;
}
export function moveDemoBoardItem(ids,index,direction){
  const safe=Array.isArray(ids)?[...ids]:[];
  const dest=index+direction;
  if(!Number.isInteger(index)||![-1,1].includes(direction)||index<0||dest<0||index>=safe.length||dest>=safe.length)
    return safe;
  [safe[index],safe[dest]]=[safe[dest],safe[index]];
  return safe;
}
export function removeDemoBoardItem(ids,index){
  if(!Array.isArray(ids)||!Number.isInteger(index)||index<0||index>=ids.length)return Array.isArray(ids)?[...ids]:[];
  const result=[...ids];result.splice(index,1);return result;
}
export function boardColumnCount(value){
  const n=Number(value);return DEMO_BOARD_COLUMNS.includes(n)?n:3;
}
export function demoBoardFitsWidth(cols,widthCm,paper){
  const printable=paper==="a4"?18.6:19.4;
  const w=Number(widthCm);
  return DEMO_BOARD_COLUMNS.includes(cols)&&Number.isFinite(w)&&w>=2&&w<=10&&cols*w<=printable;
}
