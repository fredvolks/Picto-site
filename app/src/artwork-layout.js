// Placement centralisé du dessin visible des SVG de démonstration Pict-au.
// Les versions PNG privées ne sont PAS inspectées par ce module :
// une extraction alpha/contraste sûre est requise avant usage en production.
export const DEFAULT_ART_PERCENT=70;
export const CENTER_UPPER="upper_illustration_area";
export const CENTER_WHOLE="entire_inner_square_height";

export function validArtPercent(value){
  return typeof value==="number"&&Number.isFinite(value)&&value>=30&&value<=95;
}
export function normalizeArtSettings(preset={}){
  return {
    percent:validArtPercent(preset.artPercent)?preset.artPercent:DEFAULT_ART_PERCENT,
    center:preset.shape==="square"&&preset.squareCenterMode===CENTER_WHOLE?CENTER_WHOLE:CENTER_UPPER
  };
}

/** All dimensions in CSS pixels, independent of viewport pixel density. */
export function computeArtworkBox({innerWidth,innerHeight,upperHeight,inkWidth,inkHeight,
  percent=DEFAULT_ART_PERCENT,shape="square",center=CENTER_UPPER}){
  const all=[innerWidth,innerHeight,upperHeight,inkWidth,inkHeight];
  if(all.some(n=>typeof n!=="number"||!Number.isFinite(n)||n<=0)||
     upperHeight>=innerHeight||!validArtPercent(percent)||
     !["square","portrait"].includes(shape))
    throw new Error("Invalid template or ink dimensions.");
  const useWhole=shape==="square"&&center===CENTER_WHOLE;
  const regionH=useWhole?innerHeight:upperHeight;
  const target=percent/100*Math.min(innerWidth,regionH);
  const ratio=target/Math.max(inkWidth,inkHeight);
  const width=inkWidth*ratio,height=inkHeight*ratio;
  const left=(innerWidth-width)/2;
  const top=(regionH-height)/2;
  const collides=top<-.05||top+height>upperHeight+.05;
  return{left,top,width,height,percent,center:useWhole?CENTER_WHOLE:CENTER_UPPER,
    collides,scale:ratio};
}

function cropSvg(svg){
  if(svg.dataset.pictauCropped==="1")return;
  const content=svg.querySelector("g")||svg;
  if(typeof content.getBBox!=="function")return;
  try{
    const bbox=content.getBBox();
    if(![bbox.x,bbox.y,bbox.width,bbox.height].every(Number.isFinite)||
       bbox.width<=0||bbox.height<=0)return;
    // Stroke margin for demo SVG with 4-unit outlines, not full pixel-color detection.
    const padding=3;
    svg.setAttribute("viewBox",[
      bbox.x-padding,bbox.y-padding,bbox.width+2*padding,bbox.height+2*padding
    ].join(" "));
    svg.setAttribute("preserveAspectRatio","xMidYMid meet");
    svg.dataset.pictauCropped="1";
  }catch{/* Un SVG invalide conserve sa vue source sans ouvrir l'accès. */}
}

export function layoutArtwork(scope){
  if(!scope?.querySelectorAll)return {processed:0,collisions:0};
  let processed=0,collisions=0;
  for(const picto of scope.querySelectorAll(".picto[data-art-percent]")){
    const wrapper=picto.querySelector(".picto-artwork");
    const svg=wrapper?.querySelector("svg");
    const img=wrapper?.querySelector("img[data-pictau-ink]");
    const label=picto.querySelector(".picto-label");
    if(!wrapper||(!svg&&!img)||!label)continue;
    if(svg)cropSvg(svg);
    const view=svg?.viewBox?.baseVal;
    const inkWidth=svg?view?.width:img.naturalWidth;
    const inkHeight=svg?view?.height:img.naturalHeight;
    const width=picto.clientWidth,height=picto.clientHeight;
    // offsetTop is relative to the .picto padding box (position:relative).
    const upperHeight=label.offsetTop;
    if(!inkWidth||!inkHeight||width<=0||height<=0||upperHeight<=0||upperHeight>=height)continue;
    const settings=normalizeArtSettings({
      artPercent:Number(picto.dataset.artPercent),
      shape:picto.dataset.artShape,
      squareCenterMode:picto.dataset.artCenter
    });
    try{
      const placement=computeArtworkBox({
        innerWidth:width,innerHeight:height,upperHeight,
        inkWidth,inkHeight,
        percent:settings.percent,shape:picto.dataset.artShape,center:settings.center
      });
      Object.assign(wrapper.style,{
        width:placement.width+"px",height:placement.height+"px",
        left:placement.left+"px",top:placement.top+"px"
      });
      picto.dataset.artCollision=String(placement.collides);
      processed++;
      if(placement.collides)collisions++;
    }catch{picto.dataset.artCollision="unknown";}
  }
  return{processed,collisions};
}
