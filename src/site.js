// Pict-au — site officiel de présentation, sans application cliente ni outils administrateur.
const translations=document.querySelectorAll("[data-fr][data-en]");
const controls=document.querySelectorAll("[data-lang]");
function changeLanguage(lang){
  const next=lang==="en"?"en":"fr";
  document.documentElement.lang=next;
  for(const element of translations)element.textContent=element.dataset[next];
  for(const button of controls){
    const active=button.dataset.lang===next;
    button.classList.toggle("active",active);
    button.setAttribute("aria-pressed",String(active));
  }
  document.title=next==="fr"?"Pict-au — Pictogrammes et routines visuelles":"Pict-au — Pictograms and visual routines";
  try{localStorage.setItem("pictau-site-lang",next);}catch{}
}
for(const button of controls)button.addEventListener("click",()=>changeLanguage(button.dataset.lang));
let saved="fr";try{saved=localStorage.getItem("pictau-site-lang")||"fr";}catch{}
changeLanguage(saved);

const site=document.querySelector(".home-site");
const views={accueil:"home",avantages:"features",fonctionnalites:"features",forfait:"plan"};
const viewLinks=[...document.querySelectorAll("[data-view-link]")];
function changeView(view,{updateHash=false}={}){
  const next=["home","features","plan"].includes(view)?view:"home";
  site.dataset.view=next;
  for(const link of viewLinks){
    const active=link.dataset.viewLink===next;
    link.classList.toggle("selected",active);
    if(link.closest(".mobile-dock"))link.setAttribute("aria-current",active?"page":"false");
  }
  if(updateHash){
    const hash=next==="home"?"#accueil":next==="features"?"#fonctionnalites":"#forfait";
    history.replaceState(null,"",location.pathname+location.search+hash);
  }
}
for(const link of viewLinks){
  link.addEventListener("click",event=>{
    event.preventDefault();
    changeView(link.dataset.viewLink,{updateHash:true});
  });
}
changeView(views[location.hash.slice(1)]||"home");
window.addEventListener("hashchange",()=>changeView(views[location.hash.slice(1)]||"home"));
