// Précontrôle éditorial NON publiant de pictogramme.
/// Toute composition réelle doit encore passer par le gabarit normatif
// et par la validation humaine du Super Admin.
export function assessDraftQuality(asset,technical=null){
  const fr=String(asset?.title_fr??"").trim();
  const en=String(asset?.title_en??"").trim();
  const theme=String(asset?.theme??"").trim();
  const startsLower=value=>!value||!/^\p{Lu}/u.test(value);
  const checks=[
    {id:"french",status:fr?"ok":"warning",fr:"Nom français présent",en:"French label present"},
    {id:"case_fr",status:fr&&startsLower(fr)?"ok":"warning",fr:"Nom français débute en minuscule",en:"French label starts lowercase"},
    {id:"english",status:en?"ok":"warning",fr:"Traduction anglaise renseignée",en:"English translation supplied"},
    {id:"case_en",status:en&&startsLower(en)?"ok":"warning",fr:"Nom anglais débute en minuscule",en:"English label starts lowercase"},
    {id:"theme",status:theme?"ok":"warning",fr:"Thème renseigné",en:"Theme provided"},
    {id:"source",status:technical?.width>0&&technical?.height>0?"ok":"warning",
      fr:"Dimensions source PNG contrôlées",en:"Source PNG dimensions inspected"}
  ];
  const manual=[
    {fr:"Vérifier le centrage et l'orientation du dessin",en:"Verify artwork centering and orientation"},
    {fr:"Vérifier le contraste, les contours et la cohérence noir et blanc",en:"Verify contrast, outlines and black-and-white consistency"},
    {fr:"Vérifier la bande de texte, la ligne de séparation et les dimensions physiques du gabarit",en:"Verify label band, separator and physical template size"},
    {fr:"Vérifier la provenance et les droits d'utilisation de l'image",en:"Verify image provenance and usage rights"}
  ];
  return{
    checks,
    issues:checks.filter(item=>item.status!=="ok").map(item=>item.id),
    manual,
    requiresHumanApproval:true,
    publishable:false
  };
}

// Contrôle purement indicatif de la catégorie principale, issu du référentiel
// PRIVÉ déjà relu sous Auth/RLS. Ne certifie jamais une approbation humaine.
// La publication serveur revalide le thème avant Storage puis avant INSERT.
export function assessDraftPrimaryTheme(asset,themes,{verified=false}={}){
  if(!asset||asset.status!=="draft")return {state:"not-draft",target:null};
  if(!verified||!Array.isArray(themes))return {state:"unknown",target:null};
  const row=themes.find(item=>item&&item.code===asset.theme);
  if(!row)return {state:"missing",target:null};
  if(row.merged_into!=null)return {state:"merged",target:row.merged_into};
  return {state:"ready",target:null};
}
