import {validateImageFineTune} from "./image-fine-tune.js";

// Réglages propres à UNE image (jamais à un gabarit maître).
// Les déplacements sont exprimés en pourcentage de la zone de dessin.
export const BANK_SHEET_DEFAULT=Object.freeze({
  scalePercent:100,rotationDeg:0,offsetX:0,offsetY:0,mirrorHorizontal:false
});
export function validateBankSheetAdjustment({assetId,...values}={}){
  const v={...BANK_SHEET_DEFAULT,...values};
  validateImageFineTune({assetId,scalePercent:v.scalePercent});
  if(!Number.isInteger(v.rotationDeg)||v.rotationDeg< -180||v.rotationDeg>180)
    throw Error("Rotation individuelle invalide (-180 à 180°).");
  for(const key of ["offsetX","offsetY"]){
    if(!Number.isInteger(v[key])||v[key]< -40||v[key]>40)
      throw Error("Position individuelle invalide (-40 à 40 %).");
  }
  if(typeof v.mirrorHorizontal!=="boolean")throw Error("Miroir horizontal invalide.");
  return Object.freeze({assetId,...v});
}
export function hasBankSheetChanges(current,saved){
  return Object.keys(BANK_SHEET_DEFAULT).some(key=>current[key]!==saved[key]);
}
export function clampBankSheetOffset(n){
  return Math.max(-40,Math.min(40,Math.round(n)));
}
