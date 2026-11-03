// Ajustement d'affichage privé : garder l'image entière visible dans la fiche
// Banque sans modifier ses valeurs sauvegardées ni la géométrie des templates.
export function computeBankHeroFit({
  imageWidth,imageHeight,frameWidth,frameHeight,
  scalePercent=100,rotationDeg=0,offsetX=0,offsetY=0
}={}){
  const w=Number(imageWidth),h=Number(imageHeight);
  const fw=Number(frameWidth),fh=Number(frameHeight);
  if(![w,h,fw,fh].every(Number.isFinite)||Math.min(w,h,fw,fh)<=0)return 1;
  const angle=(Number(rotationDeg)||0)*Math.PI/180;
  const zoom=Math.max(0.01,(Number(scalePercent)||100)/100);
  const cos=Math.abs(Math.cos(angle)),sin=Math.abs(Math.sin(angle));
  // CSS: fit -> translate(% de la taille de l'image) -> rotate -> mirror -> zoom.
  const requiredWidth=zoom*(w*cos+h*sin)+2*w*Math.abs(Number(offsetX)||0)/100;
  const requiredHeight=zoom*(w*sin+h*cos)+2*h*Math.abs(Number(offsetY)||0)/100;
  return Math.max(0,Math.min(1,fw/requiredWidth,fh/requiredHeight));
}
