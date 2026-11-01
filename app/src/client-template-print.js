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
