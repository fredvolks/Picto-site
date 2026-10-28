// Page d'accueil publique inspirée d'une mise en page aérée, sans reproduire la marque de référence.
// Les visuels d'appareils illustrent uniquement les pictogrammes d'exemple; aucun abonnement n'est actif.
const wording={
  fr:{
    navFeatures:"Fonctionnalités",navWhy:"Pourquoi Pict-au",navPlan:"Forfait",navApp:"Ouvrir l'application",
    tag:"PICTOGRAMMES ET ROUTINES VISUELLES",hero:"Les pictogrammes et les routines, simplement.",
    copy:"Des repères visuels clairs pour faciliter chaque étape du quotidien. Retrouvez vos pictogrammes, créez des routines et adaptez-les à vos besoins.",
    explore:"Explorer les pictogrammes",routine:"Créer une routine",demo:"APERÇU DE DÉMONSTRATION",
    mockWelcome:"Bienvenue sur Pict-au",mockRoutine:"Ma routine du matin",mockSearch:"Rechercher...",
    why1:"Simple à utiliser",why1detail:"Une interface intuitive, sans complications",
    why2:"Clair et lisible",why2detail:"Une présentation principalement en noir et blanc",
    why3:"Personnalisable",why3detail:"Des routines adaptées à votre quotidien",
    featuresTag:"DES OUTILS POUR VOTRE QUOTIDIEN",featuresTitle:"Tout ce qu'il faut, au même endroit.",
    f1:"Une bibliothèque organisée",f1desc:"Retrouvez les pictogrammes par thème et grâce à une recherche pratique.",
    f2:"Des routines visuelles",f2desc:"Choisissez vos images, placez-les dans l'ordre et ajustez leurs dimensions.",
    f3:"Facile à imprimer",f3desc:"Préparez vos supports visuels et imprimez-les depuis l'application.",
    planTag:"NOTRE FORFAIT",planTitle:"Un seul forfait. Tout simplement.",
    planCopy:"Une offre unique, sans trois formules à comparer.",
    planName:"Pict-au Essentiel",planSub:"Un accès pratique à vos supports visuels",
    price:"Tarif à confirmer",priceNote:"L'abonnement n'est pas encore disponible à l'achat.",
    benefit1:"Accès à la bibliothèque complète au lancement",benefit2:"Création de routines personnalisées",benefit3:"Personnalisation des cadres et impression",
    planButton:"Découvrir la démonstration",footer:"Des repères visuels pour chaque jour.",
    disclaimer:"Démo en développement · Aucun paiement actif."
  },
  en:{
    navFeatures:"Features",navWhy:"Why Pict-au",navPlan:"Plan",navApp:"Open the app",
    tag:"PICTOGRAMS AND VISUAL ROUTINES",hero:"Pictograms and routines, made simple.",
    copy:"Clear visual cues for daily life. Find pictograms, build visual routines and adapt them to your needs.",
    explore:"Explore pictograms",routine:"Build a routine",demo:"DEMONSTRATION PREVIEW",
    mockWelcome:"Welcome to Pict-au",mockRoutine:"My morning routine",mockSearch:"Search...",
    why1:"Easy to use",why1detail:"An intuitive interface without complications",
    why2:"Clear and readable",why2detail:"A primarily black-and-white design",
    why3:"Customizable",why3detail:"Routines to fit your daily life",
    featuresTag:"EVERYDAY VISUAL SUPPORT",featuresTitle:"Everything in one simple place.",
    f1:"An organized library",f1desc:"Find pictograms by theme with an easy search.",
    f2:"Visual routines",f2desc:"Choose your images, set the order and adjust their size.",
    f3:"Ready to print",f3desc:"Prepare visual supports and print them from the application.",
    planTag:"OUR PLAN",planTitle:"One plan. Keep it simple.",
    planCopy:"One straightforward offer, without three tiers to compare.",
    planName:"Pict-au Essential",planSub:"A convenient way to use visual supports",
    price:"Pricing to be confirmed",priceNote:"Subscriptions are not available to purchase yet.",
    benefit1:"Full library access after launch",benefit2:"Personalized visual routine creation",benefit3:"Adjustable frames and printing",
    planButton:"Try the demo",footer:"Visual cues for every day.",
    disclaimer:"Demo under development · No active payments."
  }
};
function homeBrand(){
  return '<span class="home-logo-symbol" aria-hidden="true">P</span><span class="home-logo-word">Pict-<span class="home-hand">a</span>u</span>';
}
function mockCard(pic,lang,escape){
  return '<div class="home-mock-picto"><div class="home-mock-art">'+pic.image+'</div><span>'+escape(lang==="en"?pic.en:pic.fr)+'</span></div>';
}
export function renderLanding({lang,samples,icon,escape}){
  const t=wording[lang]||wording.fr,choices=samples.slice(0,4);
  const cta=(page,label,style)=>'<button type="button" class="home-btn '+style+'" data-action="nav" data-page="'+page+'">'+label+(style==="primary"?icon("arrow","home-button-arrow"):"")+'</button>';
  const language='<div class="home-lang" role="group" aria-label="Language"><button type="button" data-action="lang" data-lang="fr" aria-pressed="'+(lang==="fr")+'" class="'+(lang==="fr"?"active":"")+'">FR</button><button type="button" data-action="lang" data-lang="en" aria-pressed="'+(lang==="en")+'" class="'+(lang==="en"?"active":"")+'">EN</button></div>';
  return '<a class="skip" href="#page-main">'+(lang==="en"?"Skip to content":"Aller au contenu")+'</a><div class="home-site">'
  +'<header class="home-header"><button type="button" class="home-logo" data-action="nav" data-page="home" aria-label="Pict-au">'+homeBrand()+'</button>'
  +'<nav class="home-header-links" aria-label="Navigation"><a href="#fonctionnalites">'+t.navFeatures+'</a><a href="#avantages">'+t.navWhy+'</a><a href="#forfait">'+t.navPlan+'</a></nav>'
  +'<div class="home-header-right">'+language+cta("library",t.navApp,"primary home-open")+'</div></header>'
  +'<main id="page-main"><section class="home-hero" aria-labelledby="landing-title">'
  +'<div class="home-hero-copy"><div class="home-kicker"><span></span>'+t.tag+'</div><h1 id="landing-title">'+t.hero+'</h1><p>'+t.copy+'</p>'
  +'<div class="home-hero-actions">'+cta("library",t.explore,"primary")+cta("routines",t.routine,"secondary")+'</div>'
  +'<div class="home-hero-caption"><span></span>'+t.demo+'</div></div>'
  +'<div class="home-art" role="img" aria-label="'+escape(t.demo)+'"><div class="home-art-circle"></div><div class="home-device"><div class="home-device-screen">'
  +'<div class="home-device-header"><span class="home-device-symbol">P<span class="home-hand">a</span></span><span class="home-device-search">'+icon("search","home-device-search-icon")+t.mockSearch+'</span><span class="home-device-avatar">●</span></div>'
  +'<div class="home-device-body"><p>'+t.mockWelcome+'</p><div class="home-device-routine-title">'+t.mockRoutine+'</div>'
  +'<div class="home-device-pictos">'+choices.map(p=>mockCard(p,lang,escape)).join("")+'</div>'
  +'<div class="home-device-placeholder"><span></span><span></span><span></span></div></div></div><div class="home-device-base"></div></div>'
  +'<div class="home-phone"><div class="home-phone-notch"></div><div class="home-phone-name">Pict-<span class="home-hand">a</span>u</div><div class="home-phone-text">'+t.mockRoutine+'</div><div class="home-phone-pictos">'+choices.slice(0,2).map(p=>mockCard(p,lang,escape)).join("")+'</div><div class="home-phone-tabs">● &nbsp; ◻ &nbsp; ○</div></div></div></section>'
  +'<section id="avantages" class="home-benefits" aria-label="'+t.navWhy+'">'
  +'<div class="home-benefit"><span class="home-benefit-icon">'+icon("check")+'</span><div><strong>'+t.why1+'</strong><small>'+t.why1detail+'</small></div></div>'
  +'<div class="home-benefit"><span class="home-benefit-icon">'+icon("info")+'</span><div><strong>'+t.why2+'</strong><small>'+t.why2detail+'</small></div></div>'
  +'<div class="home-benefit"><span class="home-benefit-icon">'+icon("settings")+'</span><div><strong>'+t.why3+'</strong><small>'+t.why3detail+'</small></div></div></section>'
  +'<section id="fonctionnalites" class="home-features"><div class="home-section-label">'+t.featuresTag+'</div><h2>'+t.featuresTitle+'</h2>'
  +'<div class="home-feature-grid"><article><span>'+icon("library")+'</span><h3>'+t.f1+'</h3><p>'+t.f1desc+'</p></article>'
  +'<article><span>'+icon("routine")+'</span><h3>'+t.f2+'</h3><p>'+t.f2desc+'</p></article>'
  +'<article><span>'+icon("print")+'</span><h3>'+t.f3+'</h3><p>'+t.f3desc+'</p></article></div></section>'
  +'<section id="forfait" class="home-pricing"><div class="home-section-label">'+t.planTag+'</div><h2>'+t.planTitle+'</h2><p class="home-pricing-intro">'+t.planCopy+'</p>'
  +'<div class="home-plan"><div class="home-plan-top"><span class="home-plan-emblem">✳</span><span class="home-plan-badge">'+(lang==="fr"?"1 FORFAIT":"1 PLAN")+'</span></div>'
  +'<h3>'+t.planName+'</h3><p>'+t.planSub+'</p><div class="home-plan-price">'+t.price+'</div><div class="home-plan-price-note">'+t.priceNote+'</div>'
  +'<ul><li>'+t.benefit1+'</li><li>'+t.benefit2+'</li><li>'+t.benefit3+'</li></ul>'+cta("library",t.planButton,"primary home-plan-cta")+'</div></section></main>'
  +'<footer class="home-footer"><div class="home-footer-logo">'+homeBrand()+'</div><p>'+t.footer+'</p><small>'+t.disclaimer+'</small></footer></div>';
}
