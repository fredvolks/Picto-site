import {samples} from "./data.js";

// The public Pages build changes this to true. It must never expose the mock admin UI.
const PUBLIC_DEMO = true;
import {DEFAULT_PRESET, THEMES, clampWidth, scaleMetrics, labelFor, searchCatalog, addToRoutine, moveRoutine, routineFitsPaper, validatePreset} from "./core.js";

const translations = {
  fr: {
    library:"Bibliothèque", routines:"Mes routines", admin:"Super admin", discovery:"DÉCOUVERTE",
    greeting:"Des repères visuels, au quotidien.", subtitle:"Des pictogrammes simples pour accompagner chaque étape.",
    heroTag:"UN QUOTIDIEN PLUS CLAIR", heroTitle:"Chaque petit geste mérite son image.",
    heroCopy:"Trouvez vos pictogrammes et construisez une routine visuelle adaptée à vos besoins.",
    createRoutine:"Créer une routine", search:"Rechercher un pictogramme...", searchLabel:"Recherche",
    theme:"Thème", all:"Tous les thèmes", sort:"Trier par", recent:"Plus récents", alphabetical:"A à Z",
    selection:"Pictogrammes d’exemple", results:"résultats", add:"Ajouter", added:"Ajouté !",
    noResults:"Aucun pictogramme trouvé", noResultsCopy:"Essayez un autre mot ou sélectionnez tous les thèmes.",
    clean:"Effacer", routineTitle:"Votre routine, à votre façon", routineCopy:"Ajoutez de 2 à 10 pictogrammes puis choisissez votre format.",
    emptyRoutine:"Votre routine commence ici", emptyRoutineCopy:"Choisissez des pictogrammes dans la bibliothèque. Leur texte original suivra automatiquement chaque image.",
    backLibrary:"Explorer la bibliothèque", preview:"Aperçu de la routine", order:"Ordre des pictogrammes",
    settings:"Personnalisation", width:"Largeur de chaque case", format:"Format des cases",
    square:"Carré", portrait:"Rectangle haut", color:"Couleur des séparations", colored:"Afficher le contour coloré",
    separator:"Épaisseur des séparations", simple:"Simple", double:"Double", paper:"Format du papier",
    print:"Imprimer / enregistrer en PDF", warningLength:"Cette routine est trop large pour la feuille sélectionnée. Réduisez la largeur des cases ou changez de papier.",
    warningMin:"Ajoutez au moins deux pictogrammes pour imprimer une routine.",
    warningFont:"La police est très petite pour cette taille : vérifiez la lisibilité avant impression.",
    warningLabel:"Un libellé peut dépasser à cette taille : choisissez un cadre plus large.",
    adminTitle:"Le gabarit maître, à votre mesure", adminCopy:"Modifiez les paramètres, visualisez le rendu, puis enregistrez votre modèle local.",
    example:"Illustration d’exemple", adminPreview:"Aperçu fidèle à la géométrie du gabarit (démo)",
    labelBand:"Hauteur de la bande de texte", blackStroke:"Épaisseur du cadre noir", fontSize:"Taille de police",
    textColor:"Couleur du texte", preset:"Modèle par défaut", save:"Enregistrer ce modèle",
    restore:"Restaurer le modèle", adminNote:"Démonstration locale : les paramètres restent dans ce navigateur. Aucun accès super admin sécurisé ni publication réelle n’est encore connecté.",
    note:"Première version de démonstration : dessins d’exemple, sans banque client ni paiement actif.",
    saved:"Modèle enregistré dans ce navigateur.", restored:"Modèle restauré.", full:"Une routine contient au maximum 10 pictogrammes.",
    selected:"pictogrammes sélectionnés", printTitle:"Pict-au — routine visuelle", demo:"DÉMONSTRATION",
    libraryIntro:"Découvrez des illustrations noires et blanches à intégrer à votre routine.",
    localeWarning:"Les libellés sont toujours liés à leur illustration; ils ne sont pas modifiables par le client.",
    onlyDemo:"Illustrations fictives pour essayer le parcours. Rien n’est publié.",
    unavailable:"Fonction réservée à une étape ultérieure : comptes sécurisés, sources HD approuvées et publication.",
    changes:"Ajustements en direct"
  },
  en: {
    library:"Library", routines:"My routines", admin:"Super admin", discovery:"EXPLORE",
    greeting:"Visual cues for everyday life.", subtitle:"Simple pictograms for every step.",
    heroTag:"MAKE EACH DAY CLEARER", heroTitle:"Every little step deserves a picture.",
    heroCopy:"Find pictograms and build a visual routine that fits your needs.",
    createRoutine:"Build a routine", search:"Search for a pictogram...", searchLabel:"Search",
    theme:"Theme", all:"All themes", sort:"Sort by", recent:"Most recent", alphabetical:"A to Z",
    selection:"Sample pictograms", results:"results", add:"Add", added:"Added!",
    noResults:"No matching pictograms", noResultsCopy:"Try another search term or choose all themes.",
    clean:"Clear", routineTitle:"A routine that fits your day", routineCopy:"Add 2 to 10 pictograms and choose their size.",
    emptyRoutine:"Your routine starts here", emptyRoutineCopy:"Select pictograms in the library. Each image keeps its original translated label.",
    backLibrary:"Browse library", preview:"Routine preview", order:"Pictogram order",
    settings:"Customize", width:"Width per cell", format:"Cell shape",
    square:"Square", portrait:"Tall rectangle", color:"Separator colour", colored:"Show coloured border",
    separator:"Separator thickness", simple:"Single", double:"Double", paper:"Paper size",
    print:"Print / Save as PDF", warningLength:"Your routine is too wide for the selected sheet. Use narrower cells or another paper size.",
    warningMin:"Add at least two pictograms to print a routine.",
    warningFont:"Text is small at this width; check readability before printing.",
    warningLabel:"A label may overflow at this size: choose a wider cell.",
    adminTitle:"The master template, your way", adminCopy:"Adjust parameters, preview the result, then save your local preset.",
    example:"Sample illustration", adminPreview:"Preview follows the template geometry (demo)",
    labelBand:"Label band height", blackStroke:"Black frame thickness", fontSize:"Font size",
    textColor:"Text colour", preset:"Default preset", save:"Save preset",restore:"Restore preset",
    adminNote:"Local demo: settings are saved only in this browser. Secure admin access and real publication are not connected yet.",
    note:"Early functional demo: sample drawings only, without accounts or active payments.",
    saved:"Preset saved in this browser.", restored:"Preset restored.", full:"A routine can contain up to 10 pictograms.",
    selected:"pictograms selected", printTitle:"Pict-au — visual routine", demo:"DEMO",
    libraryIntro:"Explore black-and-white illustrations to build your own routine.",
    localeWarning:"Labels stay linked to each illustration and cannot be edited by the customer.",
    onlyDemo:"Sample drawings for testing only. Nothing is published.",
    unavailable:"Coming later: secure accounts, approved HD sources and publishing.",
    changes:"Live settings"
  }
};
const themeNames = {
  fr:{all:"Tous les thèmes",hygiene:"Hygiène",autonomie:"Autonomie",alimentation:"Alimentation",ecole:"École",loisirs:"Loisirs",transport:"Transport",sensoriel:"Sensoriel"},
  en:{all:"All themes",hygiene:"Hygiene",autonomie:"Independence",alimentation:"Food",ecole:"School",loisirs:"Leisure",transport:"Transport",sensoriel:"Sensory"}
};
const iconPaths = {
  library:'<rect x="4" y="4" width="7" height="7" rx="1"/><rect x="13" y="4" width="7" height="7" rx="1"/><rect x="4" y="13" width="7" height="7" rx="1"/><rect x="13" y="13" width="7" height="7" rx="1"/>',
  routine:'<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M9 4v16M15 4v16"/>',
  settings:'<path d="M4 7h16M4 17h16M8 4v6M16 14v6"/><circle cx="8" cy="7" r="2"/><circle cx="16" cy="17" r="2"/>',
  search:'<circle cx="10.8" cy="10.8" r="6.4"/><path d="m16 16 5 5"/>',
  plus:'<path d="M12 5v14M5 12h14"/>',
  arrow:'<path d="M5 12h14m-6-6 6 6-6 6"/>',
  up:'<path d="m6 15 6-6 6 6"/>',
  down:'<path d="m6 9 6 6 6-6"/>',
  trash:'<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v5M14 11v5"/>',
  print:'<path d="M6 9V3h12v6M6 18H4V9h16v9h-2M7 15h10v6H7z"/>',
  check:'<path d="m5 12 4 4L19 6"/>',
  info:'<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 7h.01"/>',
  upload:'<path d="M12 16V3m-5 5 5-5 5 5M4 17v4h16v-4"/>',
  close:'<path d="M5 5l14 14M19 5 5 19"/>'
};
function icon(name,extraClass) {
  return '<svg class="'+(extraClass||"nav-icon")+'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+(iconPaths[name]||iconPaths.info)+'</svg>';
}
const root = document.querySelector("#app");
const initial = load("pictau-preset", DEFAULT_PRESET);
const preset = validatePreset(initial) ? initial : {...DEFAULT_PRESET};
const state = {
  page:"library", language:load("pictau-language","fr")==="en"?"en":"fr",
  search:"", theme:"all", sort:"recent",
  routine:Array.isArray(load("pictau-routine",[])) ? load("pictau-routine",[]).filter(x=>samples.some(s=>s.id===x)).slice(0,10):[],
  widthCm:5, paper:"letter", separatorMode:"simple",
  currentPreset:{...preset}, savedPreset:{...preset}, adminItem:"toilette", toast:""
};
function load(key,fallback){try{const value=JSON.parse(localStorage.getItem(key));return value==null?fallback:value;}catch{return fallback;}}
function store(key,value){try{localStorage.setItem(key,JSON.stringify(value));}catch{}}
function esc(value){return String(value).replace(/[&<>"']/g,function(c){return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c];});}
function T(key){return translations[state.language][key]||key;}
function fmt(num){return Number(num).toLocaleString(state.language==="fr"?"fr-CA":"en-CA",{maximumFractionDigits:1});}
function selectedItems(){return state.routine.map(id=>samples.find(x=>x.id===id)).filter(Boolean);}
function brand(){return '<span class="brand-mark" aria-hidden="true">P</span><span><span class="brand-text">Pict-<span class="brand-hand">a</span>u</span><span class="brand-caption">VISUAL ROUTINES</span></span>';}
function navButton(page,name,ico,compact){return '<button class="'+(compact?"mobile-link":"side-link")+(state.page===page?" active":"")+'" type="button" data-action="nav" data-page="'+page+'" '+(state.page===page?'aria-current="page"':"")+'>'
  +icon(ico)+ '<span>'+esc(name)+'</span>'+(page==="routines"&&!compact?'<span class="side-count">'+state.routine.length+'</span>':"")+'</button>';}
function shell(content){
  return '<a class="skip" href="#page-main">'+(state.language==="fr"?"Aller au contenu":"Skip to content")+'</a><div class="app-shell">'
  +'<aside class="sidebar" aria-label="Navigation"><a class="brand" href="#library" data-action="nav" data-page="library">'+brand()+'</a>'
  +'<div><div class="side-label">MENU</div><nav class="side-links">'+navButton("library",T("library"),"library",false)+navButton("routines",T("routines"),"routine",false)+(PUBLIC_DEMO?'':navButton("admin",T("admin"),"settings",false))+'</nav></div>'
  +'<div class="sidebar-footer"><strong>'+T("demo")+'</strong><p>'+T("note")+'</p></div></aside>'
  +'<div class="workspace"><header class="topbar"><div class="topbar-heading"><div><div class="eyebrow">'+T("discovery")+'</div><h2 class="topbar-title">'+T(state.page==="library"?"library":state.page==="routines"?"routines":"admin")+'</h2></div></div>'
  +'<a class="mobile-brand" href="#library" data-action="nav" data-page="library">'+brand()+'</a>'
  +'<div class="topbar-actions"><div class="lang-switch" role="group" aria-label="Language"><button type="button" class="lang-btn'+(state.language==="fr"?" active":"")+'" data-action="lang" data-lang="fr" aria-pressed="'+(state.language==="fr")+'">FR</button><button type="button" class="lang-btn'+(state.language==="en"?" active":"")+'" data-action="lang" data-lang="en" aria-pressed="'+(state.language==="en")+'">EN</button></div><span class="avatar" title="Démo">D</span></div></header>'
  +'<main id="page-main" class="main">'+content+'<footer class="page-bottom">'+T("note")+'</footer></main></div></div>'
  +'<nav class="mobile-nav'+(PUBLIC_DEMO?' public':'')+'" aria-label="Navigation mobile">'+navButton("library",T("library"),"library",true)+navButton("routines",T("routines"),"routine",true)+(PUBLIC_DEMO?'':navButton("admin",T("admin"),"settings",true))+'</nav>'
  +(state.toast?'<div class="toast" role="status">'+esc(state.toast)+'</div>':"");
}
function customPicto(item,p,cm,thumb){
  const met=scaleMetrics(p,cm),label=labelFor(item,state.language);
  if(thumb){
    return '<div class="color-shell '+(p.colored?"":"no-color")+'" style="--bordercolor:'+p.color+';--colorwidth:3px"><div class="picto picto-thumbnail"><div class="picto-art">'+item.image+'</div><div class="picto-label">'+esc(label)+'</div></div></div>';
  }
  return '<div class="picto" style="--width:'+met.widthCm+'cm;--height:'+fmtRaw(met.heightCm)+'cm;--stroke:'+fmtRaw(met.strokeMm)+'mm;--band:'+fmtRaw(met.bandMm)+'mm;--line:'+fmtRaw(Math.max(.4,met.strokeMm*.6))+'mm;--font:'+fmtRaw(met.fontPt)+'pt;--fontcolor:'+esc(p.fontColor||"#111111")+'"><div class="picto-art">'+item.image+'</div><div class="picto-label">'+esc(label)+'</div></div>';
}
function fmtRaw(n){return Number(n).toFixed(3);}
function routineStrip(items){
  const met=scaleMetrics(state.currentPreset,state.widthCm),p=state.currentPreset;
  const gap=met.separatorMm*(state.separatorMode==="double"?2:1);
  return '<div class="routine-strip'+(p.colored?"":" no-color")+'" style="--gap:'+fmtRaw(gap)+'mm;--edge:'+fmtRaw(met.separatorMm)+'mm;--routine-color:'+p.color+';">'+items.map(item=>customPicto(item,p,state.widthCm,false)).join("")+'</div>';
}
function renderCard(item){
  return '<article class="sample-card"><div class="sample-visual">'+customPicto(item,state.currentPreset,5,true)+'</div><div class="sample-meta"><div class="sample-title">'+esc(labelFor(item,state.language))+'</div><div class="sample-theme">'+esc(themeNames[state.language][item.theme])+'</div></div>'
  +'<div class="card-actions"><button type="button" class="btn btn-light btn-small" data-action="add" data-id="'+item.id+'">'+icon("plus","btn-icon")+T("add")+'</button></div></article>';
}
function renderLibrary(){
  const results=searchCatalog(samples,state.search,state.theme,state.sort,state.language);
  return '<div class="page-intro"><div><h1>'+T("greeting")+'</h1><p>'+T("libraryIntro")+'</p></div><span class="count-badge">'+samples.length+' '+T("selection")+'</span></div>'
  +'<section class="hero"><div><div class="hero-label">'+T("heroTag")+'</div><h2>'+T("heroTitle")+'</h2><p>'+T("heroCopy")+'</p><button type="button" class="btn btn-primary" data-action="nav" data-page="routines">'+T("createRoutine")+icon("arrow","btn-icon")+'</button></div>'
  +'<div class="hero-display"><div class="hero-icon">'+samples[3].image+'</div></div></section>'
  +'<section class="toolbar" aria-label="Filtres"><div class="control search-field"><label for="search">'+T("searchLabel")+'</label><div class="search-input-wrap">'+icon("search")+'<input id="search" data-input="search" type="search" autocomplete="off" value="'+esc(state.search)+'" placeholder="'+esc(T("search"))+'"></div></div>'
  +'<div class="control filter-field"><label for="theme">'+T("theme")+'</label><select id="theme" data-field="theme">'+THEMES.map(key=>'<option value="'+key+'"'+(state.theme===key?" selected":"")+'>'+esc(themeNames[state.language][key])+'</option>').join("")+'</select></div>'
  +'<div class="control filter-field"><label for="sort">'+T("sort")+'</label><select id="sort" data-field="sort"><option value="recent"'+(state.sort==="recent"?" selected":"")+'>'+T("recent")+'</option><option value="az"'+(state.sort==="az"?" selected":"")+'>'+T("alphabetical")+'</option></select></div></section>'
  +'<div class="section-heading"><h2>'+T("selection")+'</h2><span class="muted">'+results.length+' '+T("results")+'</span></div>'
  +(results.length?'<div class="picto-grid">'+results.map(renderCard).join("")+'</div>':'<div class="empty"><div class="empty-icon">'+icon("search")+'</div><h2>'+T("noResults")+'</h2><p>'+T("noResultsCopy")+'</p><button class="btn btn-light" data-action="clear">'+T("clean")+'</button></div>')
  +'<div class="notice blue" style="margin-top:22px">'+icon("info","btn-icon")+' '+T("onlyDemo")+'</div>';
}
function renderRoutine(){
  const items=selectedItems(),p=state.currentPreset,met=scaleMetrics(p,state.widthCm);
  const canFit=routineFitsPaper(state.routine,state.widthCm,state.paper),min=items.length>=2;
  const small=met.fontPt<8;
  const maybeOverflow=items.some(x=>labelFor(x,state.language).length*met.fontPt*.18>state.widthCm*10-5);
  let messages=[];
  if(!min)messages.push(T("warningMin"));
  if(min&&!canFit)messages.push(T("warningLength"));
  if(small)messages.push(T("warningFont"));
  if(maybeOverflow)messages.push(T("warningLabel"));
  const disabled=!min||!canFit||maybeOverflow||small;
  const stage=items.length?'<div class="routine-stage" id="routine-stage">'+routineStrip(items)+'</div>':'<div class="empty"><div class="empty-icon">'+icon("routine")+'</div><h2>'+T("emptyRoutine")+'</h2><p>'+T("emptyRoutineCopy")+'</p><button class="btn btn-primary" data-action="nav" data-page="library">'+T("backLibrary")+icon("arrow","btn-icon")+'</button></div>';
  const order=items.map((item,index)=>'<div class="routine-line"><span class="routine-number">'+(index+1)+'</span><span class="routine-name">'+esc(labelFor(item,state.language))+'</span><button type="button" class="mini-btn" title="Gauche" aria-label="Déplacer '+esc(labelFor(item,state.language))+' à gauche" data-action="move" data-index="'+index+'" data-direction="-1" '+(index===0?"disabled":"")+'>'+icon("up")+'</button><button type="button" class="mini-btn" title="Droite" aria-label="Déplacer '+esc(labelFor(item,state.language))+' à droite" data-action="move" data-index="'+index+'" data-direction="1" '+(index===items.length-1?"disabled":"")+'>'+icon("down")+'</button><button type="button" class="mini-btn" title="Retirer" aria-label="Retirer '+esc(labelFor(item,state.language))+'" data-action="remove" data-index="'+index+'">'+icon("trash")+'</button></div>').join("");
  const printStage=items.length?'<section class="print-sheet" aria-label="Routine à imprimer"><div class="print-title">'+T("printTitle")+'</div>'+routineStrip(items)+'</section>':"";
  return '<div class="page-intro"><div><h1>'+T("routineTitle")+'</h1><p>'+T("routineCopy")+'</p></div><span class="count-badge">'+items.length+' / 10</span></div>'
  +'<div class="page-two-col"><section class="panel"><div class="section-heading"><h2>'+T("preview")+'</h2></div>'+stage
  +(items.length?'<div class="routine-items"><div class="section-heading"><h2>'+T("order")+'</h2><button class="btn btn-light btn-small" data-action="nav" data-page="library">'+icon("plus","btn-icon")+T("add")+'</button></div>'+order+'</div>':"")
  +'</section><section class="panel"><h2 class="panel-title">'+T("settings")+'</h2><p class="panel-copy">'+T("localeWarning")+'</p>'
  +'<div class="settings-grid"><div class="control full-span"><div class="range-header"><label for="size">'+T("width")+'</label><output id="size-value">'+fmt(state.widthCm)+' cm</output></div><input id="size" type="range" data-field="size" min="2" max="10" step=".5" value="'+state.widthCm+'"></div>'
  +'<div class="control"><label for="shape">'+T("format")+'</label><select id="shape" data-field="shape"><option value="square"'+(p.shape==="square"?" selected":"")+'>'+T("square")+'</option><option value="portrait"'+(p.shape==="portrait"?" selected":"")+'>'+T("portrait")+'</option></select></div>'
  +'<div class="control"><label for="mode">'+T("separator")+'</label><select id="mode" data-field="mode"><option value="simple"'+(state.separatorMode==="simple"?" selected":"")+'>'+T("simple")+'</option><option value="double"'+(state.separatorMode==="double"?" selected":"")+'>'+T("double")+'</option></select></div>'
  +'<div class="control"><label for="color">'+T("color")+'</label><div class="color-select"><input type="color" id="color" data-field="color" value="'+p.color+'"><small>'+esc(p.color.toUpperCase())+'</small></div></div>'
  +'<div class="control"><label for="paper">'+T("paper")+'</label><select id="paper" data-field="paper"><option value="letter"'+(state.paper==="letter"?" selected":"")+'>Lettre / Letter</option><option value="a4"'+(state.paper==="a4"?" selected":"")+'>A4</option></select></div>'
  +'<label class="toggle-row full-span"><input type="checkbox" data-field="colored" '+(p.colored?"checked":"")+'>'+T("colored")+'</label></div>'
  +(messages.length?'<div class="notice" style="margin-top:16px">'+messages.map(esc).join("<br>")+'</div>':"")
  +'<button type="button" style="width:100%;margin-top:18px" class="btn btn-primary" data-action="print" '+(disabled?"disabled":"")+'>'+icon("print","btn-icon")+T("print")+'</button>'
  +'<p class="tablet-note">'+(state.language==="fr"?"Pour un PDF, choisissez « Enregistrer au format PDF » dans la boîte d’impression du navigateur.":"To make a PDF, choose Save as PDF in your browser print dialog.")+'</p></section></div>'+printStage;
}
function adminPreview(){
  const item=samples.find(x=>x.id===state.adminItem)||samples[0],p=state.currentPreset;
  const size=5;
  const content=customPicto(item,p,size,false);
  return '<div class="picto-wrapper"><div class="color-shell'+(p.colored?"":" no-color")+'" style="--bordercolor:'+p.color+';--colorwidth:2mm">'+content.replace('class="picto" style="','class="picto" style="width:5cm;height:'+(p.shape==="portrait"?'6.75':'5')+'cm;')+'</div></div>';
}
function renderAdmin(){
  const p=state.currentPreset;
  return '<div class="page-intro"><div><div class="admin-title"><h1>'+T("adminTitle")+'</h1><span class="label-tag">'+T("demo")+'</span></div><p>'+T("adminCopy")+'</p></div></div>'
  +'<div class="page-two-col"><section class="panel"><h2 class="panel-title">'+T("adminPreview")+'</h2><div id="admin-stage" class="admin-stage">'+adminPreview()+'</div><p class="admin-preview-caption">'+T("example")+' · 5 cm · '+T("changes")+'</p>'
  +'<div class="notice blue" style="margin-top:20px">'+T("adminNote")+'</div></section>'
  +'<section class="panel"><h2 class="panel-title">'+T("preset")+'</h2><p class="panel-copy">'+T("adminCopy")+'</p><div class="settings-grid">'
  +'<div class="control full-span"><label for="admin-item">'+T("example")+'</label><select id="admin-item" data-field="adminItem">'+samples.map(x=>'<option value="'+x.id+'"'+(state.adminItem===x.id?" selected":"")+'>'+esc(labelFor(x,state.language))+'</option>').join("")+'</select></div>'
  +'<div class="control"><label for="admin-shape">'+T("format")+'</label><select id="admin-shape" data-field="adminShape"><option value="square"'+(p.shape==="square"?" selected":"")+'>'+T("square")+'</option><option value="portrait"'+(p.shape==="portrait"?" selected":"")+'>'+T("portrait")+'</option></select></div>'
  +'<div class="control"><label for="admin-color">'+T("color")+'</label><div class="color-select"><input id="admin-color" type="color" data-field="adminColor" value="'+p.color+'"><small>'+esc(p.color.toUpperCase())+'</small></div></div>'
  +adminRange("bandMm",T("labelBand"),p.bandMm,6,30,.5,"mm")
  +adminRange("strokeMm",T("blackStroke"),p.strokeMm,.4,4,.2,"mm")
  +adminRange("fontPt",T("fontSize"),p.fontPt,7,26,1,"pt")
  +'<div class="control full-span"><label for="admin-font-color">'+T("textColor")+'</label><div class="color-select"><input id="admin-font-color" type="color" data-field="adminFontColor" value="'+(p.fontColor||"#111111")+'"><small>'+esc((p.fontColor||"#111111").toUpperCase())+'</small></div></div>'
  +adminRange("separatorMm",T("separator"),p.separatorMm,.5,4,.1,"mm")
  +'<label class="toggle-row full-span"><input type="checkbox" data-field="adminColored" '+(p.colored?"checked":"")+'>'+T("colored")+'</label></div>'
  +'<div class="admin-actions" style="margin-top:22px"><button class="btn btn-primary" data-action="save">'+icon("check","btn-icon")+T("save")+'</button><button class="btn btn-quiet" data-action="restore">'+T("restore")+'</button></div>'
  +'</section></div>';
}
function adminRange(key,label,value,min,max,step,unit){
  return '<div class="control full-span"><div class="range-header"><label for="admin-'+key+'">'+label+'</label><output id="out-'+key+'">'+fmt(value)+' '+unit+'</output></div><input id="admin-'+key+'" data-input="admin-range" data-key="'+key+'" type="range" min="'+min+'" max="'+max+'" step="'+step+'" value="'+value+'"></div>';
}
function render(){
  if(PUBLIC_DEMO && state.page==="admin")state.page="library";
  document.documentElement.lang=state.language;
  document.title="Pict-au — "+T(state.page==="library"?"library":state.page==="routines"?"routines":"admin");
  root.innerHTML=shell(state.page==="routines"?renderRoutine():state.page==="admin"?renderAdmin():renderLibrary());
}
function syncRoutine(){store("pictau-routine",state.routine);}
function notify(message){state.toast=message;render();}
function safeFocusSearch(){
  const el=document.querySelector("#search");if(el){el.focus();const length=el.value.length;el.setSelectionRange(length,length);}
}
function adminLive(){
  const stage=document.querySelector("#admin-stage");
  if(stage)stage.innerHTML=adminPreview();
}
function routineLive(){
  const stage=document.querySelector("#routine-stage");
  if(stage&&state.routine.length)stage.innerHTML=routineStrip(selectedItems());
  const output=document.querySelector("#size-value");
  if(output)output.textContent=fmt(state.widthCm)+" cm";
}
root.addEventListener("click",function(event){
  const el=event.target.closest("[data-action]");
  if(!el)return;
  if(el.tagName==="A")event.preventDefault();
  const a=el.dataset.action;
  if(a==="nav"){if(PUBLIC_DEMO && el.dataset.page==="admin")return;state.page=el.dataset.page;state.toast="";render();window.scrollTo({top:0,behavior:"instant"});}
  if(a==="lang"){state.language=el.dataset.lang;store("pictau-language",state.language);state.toast="";render();}
  if(a==="add"){if(state.routine.length>=10){notify(T("full"));return;}state.routine=addToRoutine(state.routine,el.dataset.id);syncRoutine();notify(T("added"));}
  if(a==="remove"){state.routine.splice(Number(el.dataset.index),1);syncRoutine();render();}
  if(a==="move"){state.routine=moveRoutine(state.routine,Number(el.dataset.index),Number(el.dataset.direction));syncRoutine();render();}
  if(a==="clear"){state.search="";state.theme="all";render();}
  if(a==="print"){if(state.routine.length>=2&&routineFitsPaper(state.routine,state.widthCm,state.paper))window.print();}
  if(a==="save"){if(!validatePreset(state.currentPreset)){notify(T("unavailable"));return;}state.savedPreset={...state.currentPreset};store("pictau-preset",state.savedPreset);notify(T("saved"));}
  if(a==="restore"){state.currentPreset={...state.savedPreset};notify(T("restored"));}
});
root.addEventListener("input",function(event){
  const field=event.target.dataset.input;
  if(field==="search"){state.search=event.target.value;render();safeFocusSearch();return;}
  if(field==="admin-range"){const k=event.target.dataset.key;state.currentPreset[k]=Number(event.target.value);const o=document.querySelector("#out-"+k);if(o)o.textContent=fmt(state.currentPreset[k])+" "+(k==="fontPt"?"pt":"mm");adminLive();return;}
  if(event.target.dataset.field==="size"){state.widthCm=clampWidth(event.target.value);routineLive();}
});
root.addEventListener("change",function(event){
  const field=event.target.dataset.field;
  if(!field)return;
  const value=event.target.value;
  if(field==="theme")state.theme=value;
  if(field==="sort")state.sort=value;
  if(field==="size")state.widthCm=clampWidth(value);
  if(field==="shape")state.currentPreset.shape=value;
  if(field==="mode")state.separatorMode=value;
  if(field==="paper")state.paper=value;
  if(field==="color")state.currentPreset.color=value;
  if(field==="colored")state.currentPreset.colored=event.target.checked;
  if(field==="adminItem")state.adminItem=value;
  if(field==="adminShape")state.currentPreset.shape=value;
  if(field==="adminColor")state.currentPreset.color=value;
  if(field==="adminFontColor")state.currentPreset.fontColor=value;
  if(field==="adminColored")state.currentPreset.colored=event.target.checked;
  render();
});
render();
