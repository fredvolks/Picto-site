const translations=[...document.querySelectorAll("[data-fr][data-en]")];
const buttons=[...document.querySelectorAll("[data-lang]")];
function setLanguage(lang){
 const selected=lang==="en"?"en":"fr";
 document.documentElement.lang=selected;
 for(const item of translations)item.textContent=item.dataset[selected];
 for(const btn of buttons){const active=btn.dataset.lang===selected;btn.classList.toggle("active",active);btn.setAttribute("aria-pressed",String(active));}
 const sectionTitle=document.querySelector(".info-surface h1 [data-fr][data-en]");
 document.title=sectionTitle?sectionTitle.dataset[selected]+" — Pict-au":(selected==="fr"?"Pict-au — Pictogrammes et routines visuelles":"Pict-au — Pictograms and visual routines");
 try{localStorage.setItem("pictau-language",selected);}catch{}
}
for(const btn of buttons)btn.addEventListener("click",()=>setLanguage(btn.dataset.lang));
let preferred="fr";try{preferred=localStorage.getItem("pictau-language")||"fr";}catch{}
setLanguage(preferred);
