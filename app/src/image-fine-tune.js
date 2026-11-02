// Réglage d'illustration propre à un pictogramme, distinct de tout gabarit.
// Contrat pur : AUCUNE écriture en base, modification du PNG, ni publication.
// Les migrations et la recette RLS sont nécessaires avant une sauvegarde réelle.
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const IMAGE_FINE_TUNE_DEFAULT=100;
export const IMAGE_FINE_TUNE_MIN=60;
export const IMAGE_FINE_TUNE_MAX=140;
export const IMAGE_FINE_TUNE_STEP=5;

export function validateImageFineTune({assetId,scalePercent=100}={}){
  if(typeof assetId!=="string"||!UUID.test(assetId))
    throw new Error("Identifiant de pictogramme invalide.");
  if(!Number.isInteger(scalePercent)||scalePercent<IMAGE_FINE_TUNE_MIN||
     scalePercent>IMAGE_FINE_TUNE_MAX||
     (scalePercent-IMAGE_FINE_TUNE_MIN)%IMAGE_FINE_TUNE_STEP!==0)
    throw new Error("Agrandissement individuel invalide (60 à 140 %, par pas de 5).");
  return Object.freeze({assetId,scalePercent});
}
function validTemplate(template){
  return template&&typeof template==="object"&&
    UUID.test(template.id||"")&&
    typeof template.name==="string"&&template.name.trim().length>0&&
    ["square","portrait"].includes(template.shape)&&
    Number.isFinite(template.art_percent)&&
    template.art_percent>=30&&template.art_percent<=95;
}

// Le pourcentage du gabarit est la base. Le facteur propre au dessin se
// combine à cette base; ni la définition du gabarit ni le PNG ne changent.
// Si le résultat sort de la plage métier, NE PAS le limiter silencieusement:
// signaler "à vérifier" avant toute mise à disposition d'un modèle.
export function previewImageInTemplates({assetId,scalePercent=100,templates=[]}={}){
  const fineTune=validateImageFineTune({assetId,scalePercent});
  if(!Array.isArray(templates)||templates.some(t=>!validTemplate(t)))
    throw new Error("Gabarits enregistrés invalides.");
  if(new Set(templates.map(t=>t.id)).size!==templates.length)
    throw new Error("Gabarits en double.");
  return templates.map(template=>{
    const effectiveArtPercent=Math.round(template.art_percent*fineTune.scalePercent)/100;
    const compatible=effectiveArtPercent>=30&&effectiveArtPercent<=95;
    return Object.freeze({
      templateId:template.id,name:template.name,shape:template.shape,
      templateArtPercent:template.art_percent,scalePercent:fineTune.scalePercent,
      effectiveArtPercent,
      status:compatible?"ready":"needs-review",
      // Une copie utilisable uniquement pour l'aperçu dans le moteur existant.
      // Ne jamais persister cette copie comme un nouveau gabarit.
      previewTemplate:Object.freeze({...template,art_percent:effectiveArtPercent})
    });
  });
}

// Payload de contrat, NON connecté à la base : nécessite table dédiée,
// droits Super Admin RLS, revision concurrente et approbation de migration.
export function proposedImageAdjustment({assetId,scalePercent=100,revision}={}){
  const fineTune=validateImageFineTune({assetId,scalePercent});
  if(!Number.isSafeInteger(revision)||revision<1)
    throw new Error("Version du réglage individuel requise.");
  return Object.freeze({
    asset_id:fineTune.assetId,
    scale_percent:fineTune.scalePercent,
    expected_revision:revision
  });
}
