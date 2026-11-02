// Adaptateur d'impression de la fiche client : relecture des gabarits confirmés
// avant chaque génération, jamais les brouillons ou les gabarits dépubliés.
import {listClientPictoTemplateChoices} from "./picto-template-choices.js";
import {validatePreset} from "./core.js";

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const finite=(v,min,max)=>v!==null&&v!==undefined&&v!==""&&
  Number.isFinite(Number(v))&&Number(v)>=min&&Number(v)<=max;
const color=v=>typeof v==="string"&&/^#[0-9a-f]{6}$/i.test(v);

// Tous les champs utilisés par le PDF doivent être validés, même si la
// relecture réseau a déjà filtré l'ID et l'état de publication.
export function namedTemplatePrintSettings(template){
 if(!template||typeof template!=="object"||!UUID.test(template.id||"")||
    template.is_published!==true||
    !["square","portrait"].includes(template.shape)||
    !finite(template.width_cm,2,10)||!finite(template.art_percent,30,95)||
    !finite(template.band_mm,6,30)||!finite(template.stroke_mm,0.4,4)||
    !finite(template.font_pt,7,26)||!finite(template.separator_mm,0.5,4)||
    !finite(template.rotation_deg,-180,180)||
    !["upper_illustration_area","entire_inner_square_height"].includes(template.square_center_mode)||
    !color(template.border_color)||!color(template.font_color)||
    typeof template.colored!=="boolean")
   throw Error("Gabarit confirmé invalide : actualisez la fiche.");
 const preset={
   shape:template.shape,artPercent:Number(template.art_percent),
   squareCenterMode:template.square_center_mode,bandMm:Number(template.band_mm),
   strokeMm:Number(template.stroke_mm),fontPt:Number(template.font_pt),
   separatorMm:Number(template.separator_mm),color:template.border_color,
   fontColor:template.font_color,colored:template.colored,
   rotationDeg:Number(template.rotation_deg)
 };
 if(!validatePreset(preset))throw Error("Le gabarit ne peut pas être imprimé.");
 return {templateId:template.id,widthCm:Number(template.width_cm),preset};
}
export async function loadConfirmedPrintSettings(client,uid,pictoId,templateId){
 if(!UUID.test(pictoId||"")||!UUID.test(templateId||""))
   throw Error("Pictogramme ou gabarit invalide.");
 // La sélection UI est indicative : refuser tout gabarit retiré, dépublié
 // ou remplacé depuis son affichage, avant toute génération de PDF.
 const templates=await listClientPictoTemplateChoices(client,uid,pictoId);
 const selected=templates.find(row=>row.id===templateId);
 if(!selected)throw Error("Ce gabarit n'est plus proposé. Actualisez la fiche.");
 return namedTemplatePrintSettings(selected);
}


function approvedImageScale(value){
 if(!Number.isInteger(value)||value<60||value>140||(value-60)%5!==0)
   throw Error("Taille du dessin approuvé invalide : actualisez la fiche.");
 return value;
}
// Les clients ne peuvent PAS lire les ajustements privés. Seule la valeur
// explicitement copiée dans le catalogue au moment de l'approbation est lue.
export async function loadPublishedImageScale(client,uid,pictoId){
 if(!UUID.test(pictoId||"")||typeof uid!=="string"||!client?.auth?.getUser)
   throw Error("Lecture de la taille approuvée indisponible.");
 const before=await client.auth.getUser();
 if(before.error||before.data?.user?.id!==uid)throw Error("Session modifiée : reconnectez-vous.");
 const {data,error}=await client.from("pictau_catalog_items")
   .select("id,image_scale_percent").eq("id",pictoId).maybeSingle();
 if(error)throw Error("Taille approuvée indisponible : vérifiez les migrations Supabase.");
 if(!data||data.id!==pictoId)throw Error("Pictogramme retiré du catalogue.");
 const percent=approvedImageScale(data.image_scale_percent);
 const after=await client.auth.getUser();
 if(after.error||after.data?.user?.id!==uid)throw Error("Session modifiée : reconnectez-vous.");
 return percent;
}
// Un seul calcul de taille pour l'aperçu client et le PDF. Ne jamais changer
// le gabarit enregistré ni ses autres couleurs/dimensions physiques.
export function applyPublishedImageScale(settings,scalePercent=100){
 const factor=approvedImageScale(scalePercent);
 if(!settings||typeof settings!=="object"||!settings.preset||
    !validatePreset(settings.preset))
   throw Error("Gabarit confirmé invalide.");
 const effectiveArtPercent=Math.round(settings.preset.artPercent*factor)/100;
 if(effectiveArtPercent<30||effectiveArtPercent>95)
   throw Error("Ce pictogramme déborde dans ce gabarit. Choisissez un autre modèle ou demandez un ajustement.");
 const preset={...settings.preset,artPercent:effectiveArtPercent};
 if(!validatePreset(preset))throw Error("Gabarit imprimable invalide.");
 return {...settings,preset};
}

// Le client personnalise UNIQUEMENT le contour du PDF privé. Les valeurs
// du gabarit confirmé ne sont jamais mutées ni enregistrées côté Super Admin.
export function applyClientBorderPreference(settings,{colored=null,borderColor=null}={}){
 if(!settings||typeof settings!=="object"||!settings.preset||
    typeof settings.preset.colored!=="boolean"||
    (colored!==null&&typeof colored!=="boolean")||
    (borderColor!==null&&!color(borderColor)))
   throw Error("Choix de contour invalide.");
 const preset={...settings.preset,
   colored:colored===null?settings.preset.colored:colored,
   color:borderColor===null?settings.preset.color:borderColor.toLowerCase()
 };
 if(!validatePreset(preset))throw Error("Couleur de contour invalide.");
 return {...settings,preset};
}

// Imprimer plusieurs exemplaires identiques d'un pictogramme approuvé.
// La composition est répartie automatiquement en colonnes par le moteur PDF.
// Chaque exemplaire conserve son propre contour et sa taille physique réelle.
export const MAX_CLIENT_PICTO_COPIES=12;
export function validateClientPictoCopies(value){
 if(typeof value!=="number"||!Number.isInteger(value)||value<1||
    value>MAX_CLIENT_PICTO_COPIES)
   throw Error("Nombre d'exemplaires invalide (1 à 12).");
 return value;
}
export function repeatApprovedPictoForPrint(row,pngBlob,copies=1){
 validateClientPictoCopies(copies);
 if(!row||typeof row.title_fr!=="string"||!row.title_fr.trim()||
    (row.title_en!==undefined&&row.title_en!==null&&
     (typeof row.title_en!=="string"||!row.title_en.trim()))||
    !(pngBlob instanceof Blob)||pngBlob.type!=="image/png")
   throw Error("Pictogramme PNG approuvé invalide.");
 const item=Object.freeze({fr:row.title_fr,en:row.title_en||row.title_fr,pngBlob});
 return Array.from({length:copies},()=>item);
}
