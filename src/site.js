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
