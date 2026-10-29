import {samples} from "./data.js";
import {sanitizedDemoIds,recordDemoRecent} from "./client-collections.js";
import {renderLanding} from "./landing.js";
import {loginGoogle,logoutGoogle,supabaseClient,currentVerifiedUser,loginWithEmail,sendEmailSignInLink,sendPasswordReset,updateEmailPassword} from "./google-auth.js";
import {readAdminBank,ADMIN_BANK_PAGE_SIZE,normalizeAdminBankFilters} from "./admin-bank.js";
import {renameAdminAsset} from "./admin-asset-name.js";
import {readThemes,readAssetThemes,createTheme,editThemeLabels,addAssetTheme,removeAssetTheme,mergeThemes,MAX_THEMES_PER_ASSET} from "./admin-themes.js";
import {importPrivateDraft,validateDraftMetadata} from "./admin-import.js";
import {editPrivateDraftMetadata} from "./admin-draft-edit.js";
import {assessDraftQuality} from "./admin-quality.js";
import {sanitizeDemoBoard,addDemoBoardItem,moveDemoBoardItem,removeDemoBoardItem,boardColumnCount,demoBoardFitsWidth,DEMO_BOARD_CAP} from "./communication-board.js";
import {loadPrivateAdminPreview} from "./admin-preview.js";
import {inspectPngBlob} from "./admin-review.js";
import {createLocalInkCrop} from "./png-ink.js";
import {layoutArtwork,normalizeArtSettings,CENTER_WHOLE,CENTER_UPPER} from "./artwork-layout.js";
import {restoreVersionedPreset,serializeVersionedPreset} from "./preset-version.js";
import {submitPictogramRequest,listMyPictogramRequests,listAdminPictogramRequests,updateAdminPictogramRequest,listPictogramRequestHistory,REQUEST_PAGE_SIZE,REQUEST_STATUSES,REQUEST_LABELS,validateRequestForm} from "./pictogram-requests.js";
import {renderAdminRequestDesk} from "./request-ui.js";
import {archivePdf,validatePdfBlob,normalizeDocumentTitle,listMyDocumentsAvailablePage,downloadMyDocument,renameMyDocument,DOCUMENTS_PAGE_SIZE} from "./client-files.js";
import {renderClientFiles,renderVerifiedPdfRetry} from "./client-files-ui.js";
import {listPublishedCatalogAvailablePage,loadApprovedSelection,downloadPublishedArtwork,publishReviewedPictogram,unpublishReviewedPictogram,CATALOG_PAGE_SIZE} from "./catalog.js";
import {listUsedPictogramsAvailablePage,approvedFromUsage,USED_PAGE_SIZE,toggleUsedChoice,removeUsedChoice,selectedUsedChoices,planUsedBatchApproval} from "./used-pictograms.js";
import {readCaptionPermission,setCaptionPermission} from "./caption-permission.js";
import {selectApprovedItem,addApprovedPage,setApprovedItemLabel,approvedItemCaption,changeApprovedOrder,removeApprovedItem,canPrepareApproved,renderOfficialComposer} from "./official-composer.js";
import {listEditableDraftsAvailablePage,MAX_EDITABLE_DRAFTS,loadEditableDraft,saveEditableDraft,deleteEditableDraft,normalizeEditableDraft} from "./client-drafts.js";
import {createDraftAutosave,beginDraftReplacement,beginDraftDeletion} from "./draft-autosave.js";
import {previewPagesFromOriginalPdf} from "./pdf-preview.js";
import {createPreparedPdf} from "./print-pdf.js";
import {shouldOpenArchivedPdf} from "./export-navigation.js";
import {renderPdfRecovery} from "./pdf-recovery-ui.js";

// The public Pages build changes this to true. It must never expose the mock admin UI.
const PUBLIC_DEMO = false;
// Le site GitHub Pages officiel conserve l’unique accueil commercial à sa racine.
// Dans /app/, entrer directement dans la bibliothèque sans dupliquer cet accueil.
const SITE_EMBEDDED = Boolean(document.querySelector('meta[name="pictau-site-app"]'));
// Sauvegarde verrouillée : la politique SQL proposée est encore EN REVUE.
const DRAFT_METADATA_WRITES_ENABLED = false;
import {DEFAULT_PRESET, THEMES, clampWidth, scaleMetrics, labelFor, searchCatalog, addToRoutine, moveRoutine, routineFitsPaper, validatePreset} from "./core.js";

const translations = {
  fr: {
    library:"Bibliothèque", routines:"Mes routines", boards:"Tableaux", files:"Mes fichiers", admin:"Super admin", discovery:"DÉCOUVERTE",
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
    labelBand:"Hauteur de la bande de texte", artPercent:"Taille de l’illustration", squareArtCenter:"Centrage vertical du dessin", artUpper:"Partie supérieure", artWhole:"Hauteur totale", blackStroke:"Épaisseur du cadre noir", fontSize:"Taille de police",
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
    library:"Library", routines:"My routines", boards:"Boards", files:"My files", admin:"Super admin", discovery:"EXPLORE",
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
    labelBand:"Label band height", artPercent:"Illustration size", squareArtCenter:"Artwork vertical centering", artUpper:"Upper illustration area", artWhole:"Full square height", blackStroke:"Black frame thickness", fontSize:"Font size",
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
  home:'<path d="M3 10.5 12 3l9 7.5M5 9.5V21h14V9.5M9 21v-7h6v7"/>',
  library:'<rect x="4" y="4" width="7" height="7" rx="1"/><rect x="13" y="4" width="7" height="7" rx="1"/><rect x="4" y="13" width="7" height="7" rx="1"/><rect x="13" y="13" width="7" height="7" rx="1"/>',
  routine:'<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M9 4v16M15 4v16"/>',
  database:'<ellipse cx="12" cy="6" rx="8" ry="3"/><path d="M4 6v12c0 2 3.6 4 8 4s8-2 8-4V6M4 12c0 2 3.6 4 8 4s8-2 8-4"/>',
  upload:'<path d="M12 16V3m-5 5 5-5 5 5M4 17v4h16v-4"/>',
  settings:'<path d="M4 7h16M4 17h16M8 4v6M16 14v6"/><circle cx="8" cy="7" r="2"/><circle cx="16" cy="17" r="2"/>',
  search:'<circle cx="10.8" cy="10.8" r="6.4"/><path d="m16 16 5 5"/>',
  plus:'<path d="M12 5v14M5 12h14"/>',
  heart:'<path d="M20.8 4.9c-2.1-2.1-5.5-2.1-7.6 0L12 6.1l-1.2-1.2c-2.1-2.1-5.5-2.1-7.6 0s-2.1 5.5 0 7.6L12 21l8.8-8.5c2.1-2.1 2.1-5.5 0-7.6Z"/>',
  arrow:'<path d="M5 12h14m-6-6 6 6-6 6"/>',
  up:'<path d="m6 15 6-6 6 6"/>',
  down:'<path d="m6 9 6 6 6-6"/>',
  trash:'<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v5M14 11v5"/>',
  print:'<path d="M6 9V3h12v6M6 18H4V9h16v9h-2M7 15h10v6H7z"/>',
  edit:'<path d="m4 20 4.2-1 11-11a2.12 2.12 0 0 0-3-3L5.2 16 4 20ZM14.5 6.5l3 3M12 21h8"/>',
  'file-text':'<path d="M6 2h8l5 5v15H6zM14 2v5h5M9 12h7M9 16h7"/>',
  check:'<path d="m5 12 4 4L19 6"/>',
  info:'<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 7h.01"/>',
  upload:'<path d="M12 16V3m-5 5 5-5 5 5M4 17v4h16v-4"/>',
  close:'<path d="M5 5l14 14M19 5 5 19"/>',
  menu:'<path d="M3 6h18M3 12h18M3 18h18"/>'
};
function icon(name,extraClass) {
  return '<svg class="'+(extraClass||"nav-icon")+'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+(iconPaths[name]||iconPaths.info)+'</svg>';
}
const root = document.querySelector("#app");
let pdfExportBusy=false;
// Annule une lecture privée tardive dès que l'utilisateur choisit un autre écran,
// même s'il revient ensuite à la même page avant le retour du serveur.
let clientNavigationEpoch=0;
// Repli temporaire en mémoire : ne jamais perdre un PDF créé si Storage échoue.
let pendingGeneratedPdf=null;
let pdfRecoveryBusy=false,pdfRecoveryRequest=0,pdfRecoveryError="";
const authStatus={user:null,working:false,ready:false,roleReady:false,roleError:"",recovery:false,email:"",emailBusy:false,emailError:"",emailMessage:"",error:""};
function emptyComposerSettings(){
  return {routine:{title:null,widthCm:"3",paper:"letter",columns:"3"},
    board:{title:null,widthCm:"5",paper:"letter",columns:"3"}};
}
const officialComposer={routine:[],board:[],settings:emptyComposerSettings(),busy:false,error:"",request:0};
// Relecture canonique au clic et résultat éphémère propre au contexte d'affichage.
const singleApprovedAdd={busy:false,request:0,page:null,message:"",error:""};
function resetSingleApprovedAdd(){
 singleApprovedAdd.request++;singleApprovedAdd.busy=false;
 singleApprovedAdd.page=null;singleApprovedAdd.message="";singleApprovedAdd.error="";
}
function renderSingleApprovedAddFeedback(page){
 if(singleApprovedAdd.page!==page)return "";
 if(singleApprovedAdd.error)return '<p class="pa-catalog-notice pa-single-add-notice" data-single-approval="error" role="alert">'+esc(singleApprovedAdd.error)+'</p>';
 if(singleApprovedAdd.message)return '<p class="pa-catalog-notice pa-single-add-notice" data-single-approval="status" role="status">'+esc(singleApprovedAdd.message)+'</p>';
 return "";
}
const captionFeature={enabled:false,loaded:false,loading:false,saving:false,error:"",message:"",request:0,updated_at:null};
function resetCaptionFeature(){
  captionFeature.request++;captionFeature.enabled=false;captionFeature.loaded=false;
  captionFeature.loading=false;captionFeature.saving=false;captionFeature.error="";
  captionFeature.message="";captionFeature.updated_at=null;
}
async function fetchCaptionFeature(){
  if(!SITE_EMBEDDED||!authStatus.user)return;
  const uid=authStatus.user.id,ticket=++captionFeature.request;
  captionFeature.enabled=false;captionFeature.loaded=false;
  captionFeature.loading=true;captionFeature.error="";render();
  try{
    const client=await supabaseClient(),p=await readCaptionPermission(client,uid);
    if(authStatus.user?.id!==uid||ticket!==captionFeature.request)return;
    captionFeature.enabled=p.enabled;captionFeature.loaded=true;captionFeature.updated_at=p.updated_at;
  }catch(error){
    if(authStatus.user?.id!==uid||ticket!==captionFeature.request)return;
    captionFeature.enabled=false;captionFeature.error=String(error?.message||error);
  }finally{
    if(ticket===captionFeature.request&&authStatus.user?.id===uid){
      captionFeature.loading=false;render();
    }
  }
}
const editableDrafts={items:[],total:0,page:0,loaded:false,loading:false,busy:false,deletingKind:null,copyKind:null,error:"",message:"",request:0,sessionEpoch:0,
  openEpoch:{routine:0,board:0},current:{routine:null,board:null},dirty:{routine:false,board:false}};
function resetEditableDrafts(){
  draftAutosave.reset();editableDrafts.sessionEpoch++;
  editableDrafts.openEpoch.routine++;editableDrafts.openEpoch.board++;
  editableDrafts.request++;editableDrafts.items=[];editableDrafts.total=0;editableDrafts.page=0;editableDrafts.loaded=false;
  editableDrafts.loading=false;editableDrafts.busy=false;editableDrafts.deletingKind=null;editableDrafts.copyKind=null;editableDrafts.error="";editableDrafts.message="";
  editableDrafts.current={routine:null,board:null};editableDrafts.dirty={routine:false,board:false};
}
async function fetchEditableDrafts(){
  if(!SITE_EMBEDDED||!authStatus.user||canOpenAdmin())return;
  const uid=authStatus.user.id,token=++editableDrafts.request;
  editableDrafts.loading=true;editableDrafts.error="";render();
  try{
    const client=await supabaseClient();
    const result=await listEditableDraftsAvailablePage(client,uid,{page:editableDrafts.page});
    if(token!==editableDrafts.request||authStatus.user?.id!==uid)return;
    editableDrafts.items=result.items;editableDrafts.total=result.total;editableDrafts.page=result.page;editableDrafts.loaded=true;
  }catch(error){
    if(token!==editableDrafts.request||authStatus.user?.id!==uid)return;
    editableDrafts.error=String(error?.message||error);
  }finally{
    if(token===editableDrafts.request&&authStatus.user?.id===uid){
      editableDrafts.loading=false;render();
    }
  }
}
function composerSource(kind){
  return {kind,items:officialComposer[kind].map(x=>({...x})),
    settings:{...officialComposer.settings[kind]}};
}
let draftWriteTail=Promise.resolve();
async function saveCurrentDraftSnapshot(kind){
  if(!SITE_EMBEDDED||!authStatus.user||canOpenAdmin()||officialComposer.busy||pendingGeneratedPdf)
    throw Error("Sauvegarde indisponible durant cette opération.");
  // Instantané AVANT le premier await : ne jamais valider des modifications tardives.
  const source=composerSource(kind);
  try{normalizeEditableDraft(source);}
  catch(error){error.autosaveRetryOnEdit=true;throw error;}
  const uid=authStatus.user.id,session=editableDrafts.sessionEpoch,
    opening=editableDrafts.openEpoch[kind],
    previous=editableDrafts.current[kind]?{...editableDrafts.current[kind]}:{};
  let release;
  const prior=draftWriteTail;
  draftWriteTail=new Promise(done=>{release=done;});
  await prior;
  const valid=()=>authStatus.user?.id===uid&&editableDrafts.sessionEpoch===session&&
    editableDrafts.openEpoch[kind]===opening&&!canOpenAdmin();
  try{
    if(!valid()||officialComposer.busy)throw Error("La session ou la composition a changé.");
    editableDrafts.busy=true;
    const client=await supabaseClient();
    const permission=await readCaptionPermission(client,uid);
    if(!valid())throw Error("La session ou la composition a changé.");
    captionFeature.enabled=permission.enabled;captionFeature.loaded=true;
    const saved=await saveEditableDraft(client,uid,source,previous);
    if(!valid())throw Error("La session ou la composition a changé.");
    editableDrafts.current[kind]={id:saved.id,revision:saved.revision};
    editableDrafts.loaded=false;
    editableDrafts.message=state.language==="fr"?"Brouillon sauvegardé dans votre compte.":"Draft saved in your account.";
  }finally{
    if(editableDrafts.sessionEpoch===session)editableDrafts.busy=false;
    release();
  }
}
function draftAutosaveLabel(kind,status){
  const fr=state.language==="fr";
  if(editableDrafts.copyKind===kind)return fr?"Enregistrement d’une nouvelle copie…":"Saving a new copy…";
  if(status.busy)return fr?"Enregistrement dans votre compte…":"Saving to your account…";
  if(status.blocked&&status.conflict)return fr?"Conflit : ce brouillon a changé sur un autre appareil. Enregistrez une copie pour conserver vos modifications.":"Conflict: this draft changed on another device. Save a new copy to keep your edits.";
  if(status.blocked)return fr?"Sauvegarde interrompue : "+status.failed+" Cliquez sur « Enregistrer le brouillon » pour réessayer.":"Save failed: "+status.failed+" Select Save draft to retry.";
  if(status.dirty)return fr?"Modifications non enregistrées — sauvegarde automatique prévue.":"Unsaved edits — autosave scheduled.";
  if(status.confirmed||editableDrafts.current[kind])return fr?"Brouillon enregistré dans votre compte.":"Draft saved in your account.";
  return fr?"Pas encore enregistré.":"Not saved yet.";
}
const draftAutosave=createDraftAutosave({
  save:saveCurrentDraftSnapshot,
  onState:(kind,status)=>{
    editableDrafts.dirty[kind]=status.dirty;
    const active=state.page==="routines"?"routine":state.page==="boards"?"board":null;
    if(active!==kind)return;
    // Un conflit change aussi les ACTIONS visibles : ajouter/retirer « Enregistrer
    // une copie » sans reconstruire l'éditeur pendant chaque frappe de saisie.
    // Le statut seul ne suffit pas : la reprise serait autrement inaccessible.
    const copyAction=root.querySelector('[data-action="draft-save-copy"][data-kind="'+kind+'"]');
    if(Boolean(copyAction)!==Boolean(status.conflict)){
      render();
      return;
    }
    const info=root.querySelector(".pa-composer-draft-status");
    if(info){info.textContent=draftAutosaveLabel(kind,status);info.setAttribute("data-save-state",
      status.blocked?"error":status.busy?"saving":status.dirty?"pending":"saved");}
    const button=root.querySelector('[data-action="draft-save"][data-kind="'+kind+'"]');
    if(button)button.disabled=status.busy||status.conflict||editableDrafts.busy||officialComposer.busy||editableDrafts.copyKind===kind;
    const pdf=root.querySelector('form[data-form="approved-export"] [type="submit"]');
    if(pdf)pdf.disabled=status.busy||status.conflict||editableDrafts.busy||officialComposer.busy||editableDrafts.copyKind===kind||Boolean(pendingGeneratedPdf)||
      officialComposer[kind].length<(kind==="routine"?2:1);
  }
});
function markDraftChanged(kind){
  if(!["routine","board"].includes(kind))return;
  if(!officialComposer[kind].length&&!editableDrafts.current[kind])return;
  draftAutosave.change(kind);
}
function resetOfficialComposer(){
  resetSingleApprovedAdd();
  officialComposer.request++;officialComposer.routine=[];officialComposer.board=[];
  officialComposer.settings=emptyComposerSettings();
  officialComposer.busy=false;officialComposer.error="";
}
function recordComposerFormValue(target){
  const form=target?.closest?.('form[data-form="approved-export"]'),kind=form?.dataset.kind;
  if(!SITE_EMBEDDED||!authStatus.user||canOpenAdmin()||officialComposer.busy||
     (editableDrafts.deletingKind===kind||editableDrafts.copyKind===kind)||!["routine","board"].includes(kind))return false;
  const field=target.name;
  if(!["title","widthCm","paper","columns"].includes(field))return false;
  officialComposer.settings[kind][field]=String(target.value).slice(0,120);
  markDraftChanged(kind);
  return true;
}
function recordComposerCaption(target){
  if(!SITE_EMBEDDED||!authStatus.user||canOpenAdmin()||officialComposer.busy||
     (editableDrafts.deletingKind===target?.dataset?.kind||editableDrafts.copyKind===target?.dataset?.kind)||
     target?.dataset?.input!=="official-caption")return false;
  if(!captionFeature.loaded||!captionFeature.enabled)return true;
  const kind=target.dataset.kind,index=Number(target.dataset.index);
  if(!["routine","board"].includes(kind)||!Number.isInteger(index))return true;
  try{
    officialComposer[kind]=setApprovedItemLabel(officialComposer[kind],index,target.value);
    markDraftChanged(kind);
    target.setCustomValidity("");
    const caption=approvedItemCaption(officialComposer[kind][index],state.language);
    const card=target.closest(".pa-composer-item");
    if(card){
      const below=card.querySelector(".pa-catalog-art-caption");
      const title=card.querySelector(".pa-composer-item-name");
      if(below)below.textContent=caption;
      if(title)title.textContent=caption;
    }
  }catch(error){target.setCustomValidity(state.language==="fr"?
    "Le texte doit contenir 48 caractères ou moins, sans caractères de contrôle.":
    "Use 48 characters or fewer, with no control characters.");}
  return true;
}
const usedPictos={items:[],total:0,page:0,loading:false,error:"",query:"",sort:"recent",theme:"all",request:0,notice:"",selected:new Map(),adding:false,addRequest:0};
function resetUsedPictos(){
  usedPictos.request++;usedPictos.addRequest++;usedPictos.adding=false;usedPictos.items=[];usedPictos.total=0;usedPictos.page=0;
  usedPictos.loading=false;usedPictos.error="";usedPictos.notice="";usedPictos.selected=new Map();usedPictos.query="";usedPictos.sort="recent";usedPictos.theme="all";
}
async function fetchUsedPictos(){
  if(!SITE_EMBEDDED||!authStatus.user||canOpenAdmin())return;
  if(singleApprovedAdd.page==="used")resetSingleApprovedAdd();
  const uid=authStatus.user.id,ticket=++usedPictos.request;
  usedPictos.loading=true;usedPictos.error="";usedPictos.notice="";render();
  try{
    const client=await supabaseClient();
    const result=await listUsedPictogramsAvailablePage(client,uid,{
      query:usedPictos.query,theme:usedPictos.theme,sort:usedPictos.sort,page:usedPictos.page
    });
    if(ticket!==usedPictos.request||authStatus.user?.id!==uid)return;
    usedPictos.page=result.page;usedPictos.items=result.items;usedPictos.total=result.total;
  }catch(error){
    if(ticket!==usedPictos.request||authStatus.user?.id!==uid)return;
    usedPictos.error=String(error?.message||error);usedPictos.items=[];usedPictos.total=0;
  }finally{
    if(ticket===usedPictos.request&&authStatus.user?.id===uid){
      usedPictos.loading=false;render();
    }
  }
}
const publishedCatalog={items:[],total:0,page:0,loading:false,loaded:false,error:"",request:0,
  imageUrls:new Map(),loadingImages:new Set(),approvedByAdmin:new Set(),publishing:false,publishError:"",publishMessage:""};
function clearPublishedCatalog(){
  publishedCatalog.request++;
  for(const url of publishedCatalog.imageUrls.values())URL.revokeObjectURL(url);
  publishedCatalog.imageUrls.clear();publishedCatalog.loadingImages.clear();
  publishedCatalog.items=[];publishedCatalog.total=0;publishedCatalog.page=0;
  publishedCatalog.loading=false;publishedCatalog.loaded=false;publishedCatalog.error="";
  publishedCatalog.approvedByAdmin.clear();publishedCatalog.publishing=false;
  publishedCatalog.publishError="";publishedCatalog.publishMessage="";
}
async function fetchPublishedCatalog(){
  if(!SITE_EMBEDDED||!authStatus.user||!authStatus.roleReady||canOpenAdmin())return;
  if(singleApprovedAdd.page==="library")resetSingleApprovedAdd();
  const uid=authStatus.user.id,ticket=++publishedCatalog.request;
  publishedCatalog.loading=true;publishedCatalog.error="";render();
  try{
    const client=await supabaseClient();
    const result=await listPublishedCatalogAvailablePage(client,uid,{
      query:state.search,theme:state.clientCategory||"all",page:publishedCatalog.page
    });
    if(ticket!==publishedCatalog.request||authStatus.user?.id!==uid)return;
    const held=new Set([...officialComposer.routine,...officialComposer.board].map(row=>row.id));
    for(const [id,url] of publishedCatalog.imageUrls)if(!held.has(id)&&!result.items.some(row=>row.id===id)){
      URL.revokeObjectURL(url);publishedCatalog.imageUrls.delete(id);
    }
    publishedCatalog.items=result.items;publishedCatalog.total=result.total;
    publishedCatalog.page=result.page;publishedCatalog.loaded=true;
  }catch(error){
    if(ticket!==publishedCatalog.request||authStatus.user?.id!==uid)return;
    publishedCatalog.error=String(error?.message||error);
    publishedCatalog.items=[];publishedCatalog.total=0;publishedCatalog.loaded=false;
  }finally{
    if(ticket===publishedCatalog.request){publishedCatalog.loading=false;render();}
  }
}
let catalogImageObserver=null;
function observePublishedArtwork(){
  if(catalogImageObserver)catalogImageObserver.disconnect();
  catalogImageObserver=null;
  if(!SITE_EMBEDDED||!authStatus.user||canOpenAdmin()||!["library","used","routines","boards"].includes(state.page))return;
  const nodes=[...root.querySelectorAll("img[data-catalog-id]")];
  if(!nodes.length)return;
  const uid=authStatus.user.id;
  const load=async img=>{
    const id=img.dataset.catalogId,row=[...publishedCatalog.items,
      ...usedPictos.items.map(approvedFromUsage).filter(Boolean),
      ...officialComposer.routine,...officialComposer.board].find(x=>x.id===id);
    if(!row||publishedCatalog.loadingImages.has(id))return;
    if(publishedCatalog.imageUrls.has(id)){img.src=publishedCatalog.imageUrls.get(id);return;}
    publishedCatalog.loadingImages.add(id);
    try{
      const client=await supabaseClient();
      const blob=await downloadPublishedArtwork(client,uid,row);
      if(authStatus.user?.id!==uid||![...publishedCatalog.items,
          ...usedPictos.items.map(approvedFromUsage).filter(Boolean),
          ...officialComposer.routine,...officialComposer.board].some(x=>x.id===id))return;
      const url=URL.createObjectURL(blob);
      publishedCatalog.imageUrls.set(id,url);
      for(const match of root.querySelectorAll("img[data-catalog-id]"))if(match.dataset.catalogId===id)match.src=url;
    }catch(error){
      if(authStatus.user?.id===uid)for(const match of root.querySelectorAll("img[data-catalog-id]")){
        if(match.dataset.catalogId===id)match.closest(".pa-catalog-art")?.classList.add("is-unavailable");
      }
    }finally{publishedCatalog.loadingImages.delete(id);}
  };
  if(typeof IntersectionObserver==="undefined"){nodes.forEach(node=>{void load(node);});return;}
  catalogImageObserver=new IntersectionObserver(entries=>{
    for(const entry of entries)if(entry.isIntersecting){
      catalogImageObserver?.unobserve(entry.target);
      void load(entry.target);
    }
  },{rootMargin:"220px"});
  nodes.forEach(node=>{
    if(publishedCatalog.imageUrls.has(node.dataset.catalogId))node.src=publishedCatalog.imageUrls.get(node.dataset.catalogId);
    else catalogImageObserver.observe(node);
  });
}
const clientFiles={items:[],total:0,page:0,query:"",type:"all",sort:"recent",loading:false,busy:false,error:"",message:"",
 renameId:null,request:0,preview:null,reprintRetry:null,draft:{title:"",documentType:"routine"}};
function clearPdfReprintRetry(){
  if(clientFiles.reprintRetry?.url)URL.revokeObjectURL(clientFiles.reprintRetry.url);
  clientFiles.reprintRetry=null;
}
function clearClientPreview(){
  if(clientFiles.preview?.url)URL.revokeObjectURL(clientFiles.preview.url);
  clientFiles.preview=null;
}
function selectClientPreviewPage(nextIndex){
  const p=clientFiles.preview;
  if(!authStatus.user||!p||!Array.isArray(p.pages)||!p.pages.length||!Number.isSafeInteger(nextIndex)||
     nextIndex<0||nextIndex>=p.pages.length||nextIndex===p.pageIndex)return false;
  const newUrl=URL.createObjectURL(p.pages[nextIndex].blob);
  if(p.url)URL.revokeObjectURL(p.url);
  p.url=newUrl;p.pageIndex=nextIndex;
  return true;
}
function resetClientFiles(){
 clearPdfReprintRetry();clearClientPreview();
 pendingGeneratedPdf=null; // effacer toute copie du compte précédent au changement de session
 pdfRecoveryRequest++;pdfRecoveryBusy=false;pdfRecoveryError="";
 clientFiles.request++;clientFiles.items=[];clientFiles.total=0;clientFiles.page=0;
 clientFiles.query="";clientFiles.type="all";clientFiles.sort="recent";clientFiles.loading=false;clientFiles.busy=false;
 clientFiles.error="";clientFiles.message="";clientFiles.renameId=null;
 clientFiles.draft={title:"",documentType:"routine"};
}
async function fetchClientFiles(client,uid){
 const ticket=++clientFiles.request;
 clientFiles.loading=true;clientFiles.error="";render();
 try{
  const r=await listMyDocumentsAvailablePage(client,uid,{page:clientFiles.page,query:clientFiles.query,type:clientFiles.type,sort:clientFiles.sort});
  if(ticket!==clientFiles.request||authStatus.user?.id!==uid)return;
  clientFiles.page=r.page;clientFiles.items=r.items;clientFiles.total=r.total;
 }catch(error){
  if(ticket!==clientFiles.request||authStatus.user?.id!==uid)return;
  clientFiles.error=String(error?.message||error);
 }finally{
  if(ticket===clientFiles.request){clientFiles.loading=false;render();}
 }
}
function refreshFilesForCurrentUser(){
 if(!authStatus.user)return;
 const uid=authStatus.user.id;
 void supabaseClient().then(client=>{
  // Un chargement de liste différé ne doit JAMAIS annuler l'ouverture d'une
  // source PDF, une réimpression ou une autre mutation déjà commencée.
  if(authStatus.user?.id!==uid||clientFiles.busy||!["files","home"].includes(state.page))return;
  return fetchClientFiles(client,uid);
 }).catch(error=>{
  if(authStatus.user?.id===uid&&!clientFiles.busy){
    clientFiles.error=String(error?.message||error);render();
  }
 });
}

const customerRequests={view:"closed",items:[],total:0,page:0,loading:false,submitting:false,error:"",message:"",request:0,form:{subject:"",description:"",theme:""},historyId:null,history:[]};
const adminRequests={items:[],total:0,page:0,status:"all",query:"",sort:"recent",loading:false,error:"",request:0,selectedId:null,historyId:null,history:[],saving:false,saved:"",draft:{status:"in_progress",adminNote:"",linkedAssetId:""}};
function resetRequests(){
  customerRequests.request++;customerRequests.items=[];customerRequests.total=0;customerRequests.page=0;customerRequests.loading=false;customerRequests.submitting=false;
  customerRequests.historyId=null;customerRequests.history=[];customerRequests.error="";customerRequests.message="";customerRequests.form={subject:"",description:"",theme:""};
  adminRequests.request++;adminRequests.items=[];adminRequests.total=0;adminRequests.page=0;adminRequests.status="all";adminRequests.query="";adminRequests.sort="recent";adminRequests.loading=false;adminRequests.error="";adminRequests.selectedId=null;adminRequests.historyId=null;adminRequests.history=[];adminRequests.saving=false;adminRequests.saved="";
}
function renderCustomerRequestsKeepingFocus(){
  // Le rafraîchissement asynchrone reconstruit le DOM ; ne restaurer que le
  // contrôle de Demandes encore activement ciblé, sans voler un focus déplacé.
  const active=document.activeElement;
  const action=active?.closest?.(".request-center")?.contains(active)?active?.dataset?.action:null;
  const view=action==="request-view"?active.dataset.view:null;
  const target=view==="mine"||view==="form"?
    '.request-center [data-action="request-view"][data-view="'+view+'"]':
    action==="request-refresh"?'.request-center [data-action="request-refresh"]':null;
  render();
  if(target)root.querySelector(target)?.focus({preventScroll:true});
}
async function fetchCustomerRequests(client,uid){
  const ticket=++customerRequests.request;
  customerRequests.loading=true;customerRequests.error="";renderCustomerRequestsKeepingFocus();
  try{
    const result=await listMyPictogramRequests(client,uid,{page:customerRequests.page});
    if(ticket!==customerRequests.request||authStatus.user?.id!==uid)return;
    customerRequests.items=result.items;customerRequests.total=result.total;
  }catch(error){
    if(ticket!==customerRequests.request||authStatus.user?.id!==uid)return;
    customerRequests.error=String(error?.message||error);
  }finally{
    if(ticket===customerRequests.request){customerRequests.loading=false;renderCustomerRequestsKeepingFocus();}
  }
}
async function fetchAdminRequests(client,uid){
  const ticket=++adminRequests.request;
  adminRequests.loading=true;adminRequests.error="";render();
  try{
    const result=await listAdminPictogramRequests(client,uid,{page:adminRequests.page,status:adminRequests.status,query:adminRequests.query,sort:adminRequests.sort});
    if(ticket!==adminRequests.request||authStatus.user?.id!==uid||!canOpenAdmin())return;
    adminRequests.items=result.items;adminRequests.total=result.total;
    if(adminRequests.selectedId&&!result.items.some(x=>x.id===adminRequests.selectedId))adminRequests.selectedId=null;
  }catch(error){
    if(ticket!==adminRequests.request||authStatus.user?.id!==uid)return;
    adminRequests.error=String(error?.message||error);
  }finally{
    if(ticket===adminRequests.request){adminRequests.loading=false;render();}
  }
}
function requestStatusLabel(status){return REQUEST_LABELS[status]?.[state.language]||status;}
function requestDate(value){const ms=Date.parse(value||"");return Number.isFinite(ms)?new Date(ms).toLocaleDateString(state.language==="fr"?"fr-CA":"en-CA",{year:"numeric",month:"short",day:"numeric"}):"—";}

const privateBank={allowed:false,loading:false,items:[],error:"",request:0,total:0,page:0};
let bankQueryTimer=null;
const privateImport={file:null,loading:false,error:"",message:"",request:0,draft:{titleFr:"",titleEn:"",theme:"autres"}};
const privatePreview={id:null,asset:null,url:null,inkUrl:null,inkInfo:null,inkError:"",technical:null,loading:false,error:"",request:0};
const bankFilters={query:"",status:"all",theme:"all",sort:"recent"};
const themeUI={items:[],links:{},error:"",message:"",assetId:null,editCode:"",
 form:{code:"",fr:"",en:""},edit:{fr:"",en:""},
 merge:{source:"",target:""},busy:false,request:0};
function clearThemeUI(){
  themeUI.request++;themeUI.items=[];themeUI.links={};themeUI.error="";themeUI.message="";
  themeUI.assetId=null;themeUI.editCode="";themeUI.busy=false;
  themeUI.form={code:"",fr:"",en:""};themeUI.edit={fr:"",en:""};
  themeUI.merge={source:"",target:""};
}
async function performThemeMutation(callback,successMessage){
  if(!canOpenAdmin()||themeUI.busy||!authStatus.user)return;
  const uid=authStatus.user.id,ticket=++themeUI.request;
  themeUI.busy=true;themeUI.error="";themeUI.message="";render();
  try{
    const client=await supabaseClient();
    await callback(client,uid);
    if(ticket!==themeUI.request||authStatus.user?.id!==uid||!canOpenAdmin())return;
    themeUI.message=successMessage;
    await refreshPrivateBank(client,uid);
  }catch(error){
    if(ticket===themeUI.request&&authStatus.user?.id===uid)
      themeUI.error=String(error?.message||error);
  }finally{
    if(ticket===themeUI.request){themeUI.busy=false;render();}
  }
}
function themeLabel(code,lang=state.language){
  const found=themeUI.items.find(t=>t.code===code);
  return found?(lang==="fr"?found.label_fr:found.label_en):code;
}
let bankView=["list","small","medium"].includes(load("pictau-admin-bank-view","small"))?load("pictau-admin-bank-view","small"):"small";
const bankRename={id:null,expected:null,value:"",busy:false,error:"",message:"",request:0};
function clearBankRename(){
  bankRename.request++;bankRename.id=null;bankRename.expected=null;bankRename.value="";
  bankRename.busy=false;bankRename.error="";bankRename.message="";
}
function openBankRename(id){
  if(!canOpenAdmin()||bankRename.busy)return;
  const asset=privateBank.items.find(item=>item.id===id);
  if(!asset)return;
  clearBankRename();bankRename.id=id;bankRename.expected=asset.admin_name??null;
  bankRename.value=asset.admin_name||asset.title_fr||"";
  clearAdminPreview();clearDraftEditor();render();
}
const bankThumbs={epoch:0,urls:new Map(),queue:[],queued:new Set(),loading:0,observer:null};
function clearBankThumbs(){
  bankThumbs.epoch++;bankThumbs.observer?.disconnect();bankThumbs.observer=null;
  for(const url of bankThumbs.urls.values())URL.revokeObjectURL(url);
  bankThumbs.urls.clear();bankThumbs.queue=[];bankThumbs.queued.clear();bankThumbs.loading=0;
}
function renderBankThumb(asset){
  const url=bankThumbs.urls.get(asset.id);
  return '<span class="admin-bank-thumb" data-thumb-id="'+esc(asset.id)+'">'+
    '<img alt="" data-private-thumb'+(url?' src="'+esc(url)+'"':' hidden')+'>'+
    '<span class="admin-bank-thumb-placeholder"'+(url?' hidden':'')+' aria-hidden="true">'+icon("library")+'</span></span>';
}
function startBankThumbDownloads(){
  if(!canOpenAdmin()||state.page!=="admin"||state.adminTab!=="bank")return;
  const epoch=bankThumbs.epoch,uid=authStatus.user.id;
  while(bankThumbs.loading<2&&bankThumbs.queue.length){
    const id=bankThumbs.queue.shift();
    if(bankThumbs.urls.has(id)||!privateBank.items.some(item=>item.id===id)){bankThumbs.queued.delete(id);continue;}
    bankThumbs.loading++;
    void (async()=>{
      try{
        const client=await supabaseClient();
        const {blob}=await loadPrivateAdminPreview(client,uid,id);
        if(bankThumbs.epoch!==epoch||!canOpenAdmin()||authStatus.user?.id!==uid||
          !privateBank.items.some(item=>item.id===id))return;
        const url=URL.createObjectURL(blob);bankThumbs.urls.set(id,url);
        for(const node of root.querySelectorAll(".admin-bank-thumb")){
          if(node.dataset.thumbId!==id)continue;
          const image=node.querySelector("img[data-private-thumb]");
          const placeholder=node.querySelector(".admin-bank-thumb-placeholder");
          if(image){image.src=url;image.hidden=false;}
          if(placeholder)placeholder.hidden=true;
        }
      }catch{/* La banque ne révèle pas les erreurs privées des objets. L'aperçu manuel reste disponible. */}
      finally{
        // Un téléchargement d'une ancienne page ne doit pas toucher à la file
        // d'attente de la nouvelle page, même si l'identifiant y figure encore.
        if(bankThumbs.epoch===epoch){
          bankThumbs.queued.delete(id);bankThumbs.loading--;startBankThumbDownloads();
        }
      }
    })();
  }
}
function observeBankThumbnails(){
  bankThumbs.observer?.disconnect();bankThumbs.observer=null;
  if(!canOpenAdmin()||state.page!=="admin"||state.adminTab!=="bank"||privateBank.loading)return;
  const nodes=[...root.querySelectorAll(".admin-bank-thumb[data-thumb-id]")];
  if(typeof IntersectionObserver!=="function")return;
  bankThumbs.observer=new IntersectionObserver(entries=>{
    for(const entry of entries){
      if(!entry.isIntersecting)continue;
      const id=entry.target.dataset.thumbId;
      if(!bankThumbs.urls.has(id)&&!bankThumbs.queued.has(id)){
        bankThumbs.queue.push(id);bankThumbs.queued.add(id);
      }
      bankThumbs.observer?.unobserve(entry.target);
    }
    startBankThumbDownloads();
  },{rootMargin:"160px"});
  for(const node of nodes)bankThumbs.observer.observe(node);
}
const draftEditor={id:null,original:null,form:{titleFr:"",titleEn:"",theme:"autres"},saving:false,error:"",message:"",request:0};
function clearDraftEditor(){
  draftEditor.request++;draftEditor.id=null;draftEditor.original=null;
  draftEditor.form={titleFr:"",titleEn:"",theme:"autres"};draftEditor.saving=false;
  draftEditor.error="";draftEditor.message="";
}
function openDraftEditor(assetId){
  if(!canOpenAdmin()||draftEditor.saving)return;
  const item=privateBank.items.find(asset=>asset.id===assetId);
  if(!item||item.status!=="draft"||item.created_by!==authStatus.user?.id)return;
  clearDraftEditor();clearAdminPreview();
  draftEditor.id=item.id;
  draftEditor.original={title_fr:item.title_fr,title_en:item.title_en??null,theme:item.theme};
  draftEditor.form={titleFr:item.title_fr,titleEn:item.title_en||"",theme:item.theme};
  render();
}
function exportDraftProposal(){
  if(!canOpenAdmin()||!draftEditor.id||draftEditor.saving)return;
  try{
    const values=validateDraftMetadata(draftEditor.form);
    const payload={format:"pictau-draft-review-v1",assetId:draftEditor.id,
      proposed:{title_fr:values.title_fr,title_en:values.title_en,theme:values.theme},
      disclaimer:"Proposition de modifications NON enregistrée dans Supabase. Brouillon non publié."};
    const blob=new Blob([JSON.stringify(payload,null,2)],{type:"application/json"});
    const url=URL.createObjectURL(blob);
    const link=document.createElement("a");
    link.href=url;link.download="pictau-proposition-"+draftEditor.id+".json";
    document.body.appendChild(link);link.click();link.remove();
    setTimeout(()=>URL.revokeObjectURL(url),1500);
    draftEditor.error="";draftEditor.message=state.language==="fr"?"Proposition exportée sur cet appareil, sans enregistrement Supabase.":"Proposal exported locally; nothing saved to Supabase.";
  }catch(error){draftEditor.message="";draftEditor.error=String(error.message||error);}
  render();
}
function clearAdminPreview(){
  privatePreview.request++;
  if(privatePreview.url)URL.revokeObjectURL(privatePreview.url);
  if(privatePreview.inkUrl)URL.revokeObjectURL(privatePreview.inkUrl);
  privatePreview.id=null;privatePreview.asset=null;privatePreview.url=null;
  privatePreview.inkUrl=null;privatePreview.inkInfo=null;privatePreview.inkError="";privatePreview.technical=null;
  privatePreview.loading=false;privatePreview.error="";
}
async function openAdminPreview(assetId){
  if(!canOpenAdmin()||privatePreview.loading||!privateBank.items.some(item=>item.id===assetId))return;
  clearAdminPreview();
  const userId=authStatus.user.id,request=++privatePreview.request;
  privatePreview.id=assetId;privatePreview.loading=true;render();
  try{
    const client=await supabaseClient();
    const result=await loadPrivateAdminPreview(client,userId,assetId);
    const technical=await inspectPngBlob(result.blob);
    let crop=null,cropError="";
    try{crop=await createLocalInkCrop(result.blob,technical);}
    catch(error){cropError=String(error?.message||error);}
    if(request!==privatePreview.request||authStatus.user?.id!==userId||!canOpenAdmin())return;
    privatePreview.asset=result.asset;privatePreview.technical=technical;
    privatePreview.url=URL.createObjectURL(result.blob);
    privatePreview.inkInfo=crop;privatePreview.inkError=cropError;
    if(crop)privatePreview.inkUrl=URL.createObjectURL(crop.blob);
  }catch(error){
    if(request!==privatePreview.request||authStatus.user?.id!==userId)return;
    privatePreview.error=String(error?.message||error);
  }finally{
    if(request===privatePreview.request){privatePreview.loading=false;render();}
  }
}
function canOpenAdmin(){return !PUBLIC_DEMO && Boolean(authStatus.user && privateBank.allowed);}
function resetPrivateBank(){
  resetOfficialComposer();resetEditableDrafts();resetUsedPictos();resetCaptionFeature();clearPublishedCatalog();resetRequests();resetClientFiles();clearAdminPreview();clearDraftEditor();clearBankRename();clearBankThumbs();clearThemeUI();
  clearTimeout(bankQueryTimer);bankQueryTimer=null;
  privateBank.request++;
  privateBank.allowed=false;privateBank.loading=false;privateBank.items=[];privateBank.error="";privateBank.total=0;privateBank.page=0;
  bankFilters.query="";bankFilters.status="all";bankFilters.theme="all";bankFilters.sort="recent";
  privateImport.request++;privateImport.file=null;privateImport.loading=false;privateImport.error="";privateImport.message="";privateImport.draft={titleFr:"",titleEn:"",theme:"autres"};
}
async function refreshPrivateBank(client,userId){
  clearBankThumbs();
  const request=++privateBank.request;
  privateBank.loading=true;privateBank.error="";
  render();
  try{
    const result=await readAdminBank(client,userId,{...bankFilters,page:privateBank.page});
    if(request!==privateBank.request || authStatus.user?.id!==userId)return;
    privateBank.allowed=result.authorized;
    authStatus.roleReady=true;authStatus.roleError="";
    if(SITE_EMBEDDED&&!captionFeature.loading&&!captionFeature.loaded)
      void fetchCaptionFeature();
    if(SITE_EMBEDDED&&!result.authorized){
      if(state.page==="home")void fetchClientFiles(client,userId);
      if(!publishedCatalog.loaded&&!publishedCatalog.loading)void fetchPublishedCatalog();
    }
    if(SITE_EMBEDDED&&result.authorized){state.page="admin";state.adminTab="overview";}
    else if(SITE_EMBEDDED&&state.page==="admin")state.page="home";
    privateBank.items=result.items;privateBank.total=result.total;privateBank.page=result.page;
    if(result.authorized){
      try{
        const [catalog,links]=await Promise.all([
          readThemes(client,userId),readAssetThemes(client,userId,result.items.map(x=>x.id))
        ]);
        if(request!==privateBank.request||authStatus.user?.id!==userId)return;
        themeUI.items=catalog;themeUI.links=links;themeUI.error="";
      }catch(themeError){
        if(request!==privateBank.request||authStatus.user?.id!==userId)return;
        themeUI.error=String(themeError?.message||themeError);
      }
    }
    if(draftEditor.id&&!result.items.some(item=>item.id===draftEditor.id&&item.status==="draft"&&item.created_by===userId))clearDraftEditor();
    if(!result.authorized||(privatePreview.id&&!result.items.some(item=>item.id===privatePreview.id)))clearAdminPreview();
  }catch(error){
    if(request!==privateBank.request || authStatus.user?.id!==userId)return;
    // Conserver le menu admin lors d'une erreur de recherche; les RLS restent
    // la protection réelle des données. Une session réellement invalide
    // est traitée par readAdminBank et la notification Auth.
    privateBank.items=[];privateBank.total=0;
    clearAdminPreview();clearDraftEditor();
    privateBank.error=String(error?.message||error);
    if(SITE_EMBEDDED&&!authStatus.roleReady)authStatus.roleError=state.language==="fr"?"Impossible de vérifier les droits du compte.":"Unable to verify your account permissions.";
  }finally{
    if(request===privateBank.request){
      privateBank.loading=false;
      render();
    }
  }
}
function queueAdminBankRefresh(delay=0){
  if(!canOpenAdmin()||!authStatus.user)return;
  clearTimeout(bankQueryTimer);bankQueryTimer=null;
  ++privateBank.request; // invalider les réponses déjà en vol avant le debounce
  privateBank.loading=true;privateBank.error="";
  const uid=authStatus.user.id,epoch=privateBank.request;
  const load=()=>{
    bankQueryTimer=null;
    if(!canOpenAdmin()||authStatus.user?.id!==uid)return;
    void supabaseClient().then(c=>refreshPrivateBank(c,uid)).catch(error=>{
      if(authStatus.user?.id!==uid||privateBank.request!==epoch)return;
      privateBank.loading=false;privateBank.error=String(error?.message||error);
      render();
    });
  };
  if(delay)bankQueryTimer=setTimeout(load,delay);else load();
  render();
}
function googleButton(){
  const fr=state.language==="fr";
  if(authStatus.user){
    const email=esc(authStatus.user.email||"");
    return '<div class="login-identity"><span class="login-username" title="'+email+'">'+email+'</span><button type="button" class="login-control login-signout" data-action="google-logout">'+(fr?"Déconnexion":"Sign out")+'</button></div>';
  }
  const signInLabel=authStatus.working?(fr?"Connexion…":"Signing in…"):(fr?"Continuer avec Google":"Continue with Google");
  return '<button class="login-control login-google" type="button" data-action="google-login" aria-label="'+esc(signInLabel)+'"'+(authStatus.working?" disabled":"")+'><span class="google-letter" aria-hidden="true">G</span><span class="google-login-copy">'+esc(signInLabel)+'</span><span class="google-login-short" aria-hidden="true">Google</span></button>';
}
async function refreshGoogleUser(client){
  try{
    const verified=await currentVerifiedUser(client);
    const previousId=authStatus.user?.id;
    authStatus.user=verified;authStatus.error="";authStatus.working=false;authStatus.ready=true;
    if(!verified){authStatus.roleReady=false;authStatus.roleError="";authStatus.recovery=false;resetPrivateBank();render();return;}
    if(previousId!==verified.id){authStatus.roleReady=false;authStatus.roleError="";resetPrivateBank();render();void refreshPrivateBank(client,verified.id);if(state.page==="files")void fetchClientFiles(client,verified.id);return;}
  }catch(error){
    authStatus.user=null;authStatus.error=String(error.message||error);authStatus.ready=true;authStatus.roleReady=false;
    resetPrivateBank();
  }
  render();
}
async function initializeGoogle(){
  try{
    const client=await supabaseClient();
    client.auth.onAuthStateChange((event)=>{
      if(event==="SIGNED_OUT"){authStatus.user=null;authStatus.ready=true;authStatus.roleReady=false;authStatus.recovery=false;resetPrivateBank();render();}
      else if(event==="PASSWORD_RECOVERY"){authStatus.recovery=true;authStatus.ready=true;void refreshGoogleUser(client);}
      else if(["INITIAL_SESSION","SIGNED_IN","TOKEN_REFRESHED","USER_UPDATED"].includes(event)){
        // Ne pas appeler getUser directement dans le callback de changement de session.
        setTimeout(()=>{void refreshGoogleUser(client);},0);
      }
    });
    await refreshGoogleUser(client);
  }catch(error){authStatus.error="Connexion Google indisponible.";authStatus.ready=true;render();}
}

const initial = load("pictau-preset", DEFAULT_PRESET);
const preset=restoreVersionedPreset(initial,DEFAULT_PRESET,validatePreset);
const state = {
  page:"home", language:load("pictau-language","fr")==="en"?"en":"fr",
  search:"", clientCategory:"", theme:"all", sort:"recent", showFavorites:false, detailId:null,
  recentlyViewed:sanitizedDemoIds(load("pictau-demo-recent",[]),samples.map(x=>x.id),8),
  favorites:Array.isArray(load("pictau-demo-favorites",[]))?[...new Set(load("pictau-demo-favorites",[]).filter(id=>samples.some(item=>item.id===id)))].slice(0,samples.length):[],
  routine:Array.isArray(load("pictau-routine",[])) ? load("pictau-routine",[]).filter(x=>samples.some(s=>s.id===x)).slice(0,10):[],
  widthCm:5, paper:"letter", separatorMode:"simple", routinePdfTitle:"Ma routine visuelle",
  currentPreset:{...preset}, savedPreset:{...preset}, adminItem:"toilette", adminTab:"overview", adminMenuOpen:false, toast:"",
  board:sanitizeDemoBoard(load("pictau-board",[]),samples.map(x=>x.id)),
  boardTitle:String(load("pictau-board-title","")).slice(0,80),
  boardCols:boardColumnCount(load("pictau-board-cols",3)),boardWidthCm:4
};
function load(key,fallback){try{const value=JSON.parse(localStorage.getItem(key));return value==null?fallback:value;}catch{return fallback;}}
function store(key,value){try{localStorage.setItem(key,JSON.stringify(value));}catch{}}
function esc(value){return String(value).replace(/[&<>"']/g,function(c){return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c];});}
function T(key){return translations[state.language][key]||key;}
function fmt(num){return Number(num).toLocaleString(state.language==="fr"?"fr-CA":"en-CA",{maximumFractionDigits:1});}
function selectedItems(){return state.routine.map(id=>samples.find(x=>x.id===id)).filter(Boolean);}
function boardItems(){return state.board.map(id=>samples.find(x=>x.id===id)).filter(Boolean);}
function saveDemoBoard(){store("pictau-board",state.board);store("pictau-board-title",state.boardTitle);store("pictau-board-cols",state.boardCols);}
function brand(){return '<span class="brand-mark" aria-hidden="true">P</span><span><span class="brand-text">Pict-<span class="brand-hand">a</span>u</span><span class="brand-caption">VISUAL ROUTINES</span></span>';}
function navButton(page,name,ico,compact){
  if(page==="home"&&SITE_EMBEDDED)return '<a class="'+(compact?"mobile-link":"side-link")+'" href="../index.html">'+icon(ico)+'<span>'+esc(name)+'</span></a>';
  return '<button class="'+(compact?"mobile-link":"side-link")+(state.page===page?" active":"")+'" type="button" data-action="nav" data-page="'+page+'" '+(state.page===page?'aria-current="page"':"")+'>'
  +icon(ico)+ '<span>'+esc(name)+'</span>'+(page==="routines"&&!compact?'<span class="side-count">'+state.routine.length+'</span>':"")+'</button>';}
function renderUnarchivedPdf(){
  return renderPdfRecovery({pending:pendingGeneratedPdf,uid:authStatus.user?.id,
    busy:pdfExportBusy,retrying:pdfRecoveryBusy,error:pdfRecoveryError,
    language:state.language,escape:esc,icon});
}
function shell(content){
  return '<a class="skip" href="#page-main">'+(state.language==="fr"?"Aller au contenu":"Skip to content")+'</a><div class="app-shell">'
  +'<aside class="sidebar" aria-label="Navigation"><a class="brand" href="#home" data-action="nav" data-page="home">'+brand()+'</a>'
  +'<div><div class="side-label">MENU</div><nav class="side-links">'+navButton("home",state.language==="fr"?"Accueil":"Home","home",false)+navButton("library",T("library"),"library",false)+navButton("routines",T("routines"),"routine",false)+navButton("boards",T("boards"),"library",false)+navButton("files",T("files"),"database",false)+(canOpenAdmin()?navButton("admin",T("admin"),"settings",false):"")+'</nav></div>'
  +'<div class="sidebar-footer"><strong>'+T("demo")+'</strong><p>'+T("note")+'</p></div></aside>'
  +'<div class="workspace"><header class="topbar"><div class="topbar-heading"><div><div class="eyebrow">'+T("discovery")+'</div><h2 class="topbar-title">'+T(state.page==="library"?"library":state.page==="routines"?"routines":state.page==="boards"?"boards":state.page==="files"?"files":"admin")+'</h2></div></div>'
  +'<a class="mobile-brand" href="#library" data-action="nav" data-page="library">'+brand()+'</a>'
  +'<div class="topbar-actions"><div class="lang-switch" role="group" aria-label="Language"><button type="button" class="lang-btn'+(state.language==="fr"?" active":"")+'" data-action="lang" data-lang="fr" aria-pressed="'+(state.language==="fr")+'">FR</button><button type="button" class="lang-btn'+(state.language==="en"?" active":"")+'" data-action="lang" data-lang="en" aria-pressed="'+(state.language==="en")+'">EN</button></div>'+googleButton()+'</div></header>'
  +'<main id="page-main" class="main">'+renderUnarchivedPdf()+content+'<footer class="page-bottom">'+T("note")+'</footer></main></div></div>'
  +'<nav class="mobile-nav'+(PUBLIC_DEMO?' public':'')+(canOpenAdmin()?' has-admin':'')+'" aria-label="Navigation mobile">'+navButton("home",state.language==="fr"?"Accueil":"Home","home",true)+navButton("library",T("library"),"library",true)+navButton("routines",T("routines"),"routine",true)+navButton("boards",T("boards"),"library",true)+navButton("files",T("files"),"database",true)+(canOpenAdmin()?navButton("admin",T("admin"),"settings",true):"")+'</nav>'
  +(state.toast?'<div class="toast" role="status">'+esc(state.toast)+'</div>':"");
}
function customPicto(item,p,cm,thumb){
  const met=scaleMetrics(p,cm),label=labelFor(item,state.language);
  const settings=normalizeArtSettings(p);
  const artAttrs=' data-art-percent="'+settings.percent+'" data-art-shape="'+esc(p.shape)+'" data-art-center="'+esc(settings.center)+'"';
  const content='<div class="picto-art"><div class="picto-artwork">'+item.image+'</div></div><div class="picto-label">'+esc(label)+'</div>';
  if(thumb){
    return '<div class="color-shell '+(p.colored?"":"no-color")+'" style="--bordercolor:'+p.color+';--colorwidth:3px"><div class="picto picto-thumbnail"'+artAttrs+'>'+content+'</div></div>';
  }
  return '<div class="picto"'+artAttrs+' style="--width:'+met.widthCm+'cm;--height:'+fmtRaw(met.heightCm)+'cm;--stroke:'+fmtRaw(met.strokeMm)+'mm;--band:'+fmtRaw(met.bandMm)+'mm;--line:'+fmtRaw(Math.max(.4,met.strokeMm*.6))+'mm;--font:'+fmtRaw(met.fontPt)+'pt;--fontcolor:'+esc(p.fontColor||"#111111")+'">'+content+'</div>';
}
function fmtRaw(n){return Number(n).toFixed(3);}
function routineStrip(items){
  const met=scaleMetrics(state.currentPreset,state.widthCm),p=state.currentPreset;
  const gap=met.separatorMm*(state.separatorMode==="double"?2:1);
  return '<div class="routine-strip'+(p.colored?"":" no-color")+'" style="--gap:'+fmtRaw(gap)+'mm;--edge:'+fmtRaw(met.separatorMm)+'mm;--routine-color:'+p.color+';">'+items.map(item=>customPicto(item,p,state.widthCm,false)).join("")+'</div>';
}
function renderCard(item){
 const favorite=state.favorites.includes(item.id),label=labelFor(item,state.language);
 return '<article class="sample-card"><div class="sample-visual">'+customPicto(item,state.currentPreset,5,true)+'</div>'
  +'<button type="button" class="favorite-toggle'+(favorite?' is-favorite':'')+'" data-action="favorite" data-id="'+esc(item.id)+'" aria-pressed="'+favorite+'" aria-label="'+esc((state.language==="fr"?(favorite?"Retirer des favoris : ":"Ajouter aux favoris : "):(favorite?"Remove from favorites: ":"Add to favorites: "))+label)+'">'+icon("heart")+'</button>'
  +'<div class="sample-meta"><div class="sample-title">'+esc(label)+'</div><div class="sample-theme">'+esc(themeNames[state.language][item.theme])+'</div></div>'
  +'<div class="card-actions"><button type="button" class="btn btn-light btn-small" data-action="view-picto" data-id="'+item.id+'">'+icon("search","btn-icon")+esc(state.language==="fr"?"Voir":"View")+'</button>'
  +'<button type="button" class="btn btn-light btn-small" data-action="add" data-id="'+item.id+'">'+icon("plus","btn-icon")+T("add")+'</button>'
  +'<button type="button" class="btn btn-light btn-small" data-action="add-board" data-id="'+item.id+'">'+icon("library","btn-icon")+esc(state.language==="fr"?"Tableau":"Board")+'</button></div></article>';
}
function renderCustomerRequestCenter(){
 const fr=state.language==="fr",v=customerRequests.view,logged=Boolean(authStatus.user);
 const controls='<div class="request-controls"><button type="button" class="btn '+(v==="form"?"btn-primary":"btn-light")+'" data-action="request-view" data-view="form" aria-pressed="'+(v==="form")+'">'+
   icon("plus","btn-icon")+esc(fr?"Demander un pictogramme":"Request a pictogram")+'</button>'+
   '<button type="button" class="btn '+(v==="mine"?"btn-primary":"btn-light")+'" data-action="request-view" data-view="mine" aria-pressed="'+(v==="mine")+'">'+
   icon("library","btn-icon")+esc(fr?"Mes demandes":"My requests")+'</button></div>';
 let content="";
 if(v!=="closed"&&!logged)content='<p class="request-callout" role="status">'+esc(fr?
   "Connectez-vous avec Google en haut de la page pour envoyer une demande et suivre son état.":
   "Sign in with Google above to submit a request and follow its status.")+'</p>';
 else if(v==="form"){
   content='<form class="request-form" data-form="customer-request">'+
    '<div class="control"><label for="request-subject">'+esc(fr?"Sujet du pictogramme *":"Pictogram subject *")+'</label>'+
    '<input id="request-subject" type="text" name="subject" required maxlength="100" minlength="3" value="'+esc(customerRequests.form.subject)+'" placeholder="'+esc(fr?"Ex. : ranger mon sac":"Example: pack my school bag")+'"></div>'+
    '<div class="control"><label for="request-description">'+esc(fr?"Que doit représenter le dessin ? *":"What should the image show? *")+'</label>'+
    '<textarea id="request-description" rows="4" name="description" required minlength="10" maxlength="1200" placeholder="'+esc(fr?"Décrivez l’objet, l’action ou la situation sans inscrire de renseignements personnels.":"Describe the object, action or situation without sharing personal information.")+'">'+esc(customerRequests.form.description)+'</textarea></div>'+
    '<div class="control"><label for="request-theme">'+esc(fr?"Thème (facultatif)":"Theme (optional)")+'</label><select id="request-theme" name="theme">'+
      '<option value="">'+esc(fr?"Aucune préférence":"No preference")+'</option>'+
      ["autres","hygiene","autonomie","alimentation","ecole","loisirs","transport","sensoriel","socialisation","lieux"].map(v=>
       '<option value="'+v+'"'+(customerRequests.form.theme===v?" selected":"")+'>'+esc(themeNames[state.language][v]||v)+'</option>').join("")+
     '</select></div>'+
    '<p class="request-help">'+esc(fr?"L’envoi ne crée pas automatiquement une image, ne garantit aucun délai et n’engendre aucun frais décidé ici.":"Submitting does not automatically create an image, guarantee a deadline or introduce any fee.")+'</p>'+
    '<button type="submit" class="btn btn-primary"'+(customerRequests.submitting?' disabled':'')+'>'+esc(customerRequests.submitting?(fr?"Envoi en cours…":"Sending…"):(fr?"Envoyer la demande":"Send request"))+'</button></form>';
 }else if(v==="mine"){
   const last=Math.max(0,Math.ceil(customerRequests.total/REQUEST_PAGE_SIZE)-1);
   content='<div class="request-heading"><h3>'+esc(fr?"Mes demandes enregistrées":"My submitted requests")+'</h3>'+
      '<button type="button" class="btn btn-light btn-small" data-action="request-refresh"'+(customerRequests.loading?' disabled':'')+'>'+esc(fr?"Actualiser":"Refresh")+'</button></div>'+
    (customerRequests.loading?'<p role="status">'+esc(fr?"Chargement…":"Loading…")+'</p>':
     customerRequests.items.length?'<div class="request-list">'+customerRequests.items.map(item=>
      '<article class="request-entry"><div class="request-entry-head"><strong>'+esc(item.subject)+'</strong><span class="request-status">'+esc(requestStatusLabel(item.status))+'</span></div>'+
      '<p class="request-meta">'+esc(requestDate(item.created_at))+'</p><p>'+esc(item.description)+'</p>'+
      (item.admin_note?'<p class="request-note">'+esc(fr?"Réponse du Super Admin : ":"Super Admin reply: ")+esc(item.admin_note)+'</p>':"")+
      '<button type="button" class="btn btn-light btn-small" data-action="request-history" data-id="'+esc(item.id)+'">'+esc(fr?"Historique":"History")+'</button>'+
      (customerRequests.historyId===item.id?'<div class="request-history">'+(customerRequests.history.length?customerRequests.history.map(h=>
         '<p>'+esc(requestDate(h.created_at))+' · '+esc(requestStatusLabel(h.new_status))+'</p>').join(""):esc(fr?"Aucun événement affiché.":"No events to display."))+'</div>':"")+
      '</article>').join("")+'</div>':'<p class="request-empty">'+esc(fr?"Aucune demande pour le moment.":"No requests yet.")+'</p>')+
      '<div class="admin-bank-pagination"><button class="btn btn-light btn-small" data-action="request-page" data-direction="-1"'+(customerRequests.loading||customerRequests.page===0?' disabled':'')+'>'+esc(fr?"Précédent":"Previous")+'</button>'+
      '<span>'+esc((customerRequests.page+1)+"/"+(last+1)+" · "+customerRequests.total)+'</span>'+
      '<button class="btn btn-light btn-small" data-action="request-page" data-direction="1"'+(customerRequests.loading||customerRequests.page>=last?' disabled':'')+'>'+esc(fr?"Suivant":"Next")+'</button></div>';
 }
 return '<section id="pa-client-request-center" class="request-center" aria-labelledby="pa-client-requests-title"><div class="request-heading"><div><h2 id="pa-client-requests-title" tabindex="-1">'+esc(fr?"Un pictogramme vous manque ?":"Missing a pictogram?")+'</h2>'+
   '<p>'+esc(fr?"Proposez une nouvelle image ou retrouvez les demandes liées à votre compte.":"Suggest a new image or review requests linked to your account.")+'</p></div></div>'+
   controls+(customerRequests.message?'<p class="request-success" role="status">'+esc(customerRequests.message)+'</p>':"")+
   (customerRequests.error?'<p class="request-error" role="alert">'+esc(customerRequests.error)+'</p>':"")+
   content+'</section>';
}
function renderDemoPictoDetail(){
 const item=samples.find(x=>x.id===state.detailId);
 if(!item)return "";
 const fr=state.language==="fr";
 const favorite=state.favorites.includes(item.id);
 return '<section class="client-picto-detail" aria-label="'+esc(fr?"Fiche du pictogramme":"Pictogram details")+'">'
   +'<div class="client-detail-heading"><div><span class="client-detail-kicker">'+esc(fr?"APERÇU D’UN EXEMPLE":"SAMPLE PREVIEW")+'</span><h2>'+esc(labelFor(item,state.language))+'</h2></div>'
   +'<button class="client-detail-close" type="button" data-action="close-picto" aria-label="'+esc(fr?"Fermer la fiche":"Close details")+'">'+icon("close")+'</button></div>'
   +'<div class="client-detail-content"><div class="client-detail-illustration">'+customPicto(item,state.currentPreset,5,true)+'</div>'
   +'<div class="client-detail-info"><p>'+esc(fr?"Cet exemple reste sur cet appareil. Ce n’est pas un pictogramme publié dans la banque réelle.":"This sample stays on this device. It is not published in the real pictogram library.")+'</p>'
   +'<p class="client-detail-category">'+esc(themeNames[state.language][item.theme]||item.theme)+'</p>'
   +'<div class="client-detail-actions"><button class="btn btn-primary" type="button" data-action="add" data-id="'+esc(item.id)+'">'+icon("plus","btn-icon")+T("add")+'</button>'
   +'<button class="btn btn-light" type="button" data-action="favorite" data-id="'+esc(item.id)+'" aria-pressed="'+favorite+'">'+icon("heart","btn-icon")+esc(fr?(favorite?"Retirer des favoris":"Ajouter aux favoris"):(favorite?"Remove favorite":"Add to favorites"))+'</button></div>'
   +'</div></div></section>';
}
function renderLibrary(){
 const results=searchCatalog(samples,state.search,state.theme,state.sort,state.language)
   .filter(item=>!state.showFavorites||state.favorites.includes(item.id));
 const fr=state.language==="fr";
 const quickThemes=["all","hygiene","ecole","autonomie","loisirs"];
 const recent=state.recentlyViewed.map(id=>samples.find(x=>x.id===id)).filter(Boolean);
 return '<div class="page-intro library-intro"><div><h1>'+T("greeting")+'</h1><p>'+T("libraryIntro")+'</p></div><span class="count-badge">'+samples.length+' '+T("selection")+'</span></div>'
 +'<button type="button" class="btn btn-light request-shortcut" data-action="request-open">'+icon("plus","btn-icon")+esc(fr?"Demander un pictogramme":"Request a pictogram")+'</button>'
 +'<section class="toolbar library-toolbar" aria-label="'+esc(fr?"Recherche et filtres":"Search and filters")+'"><div class="control search-field"><label for="search">'+T("searchLabel")+'</label><div class="search-input-wrap">'+icon("search")+'<input id="search" data-input="search" type="search" autocomplete="off" value="'+esc(state.search)+'" placeholder="'+esc(fr?"Nom ou mot-clé":"Name or keyword")+'"></div></div>'
 +'<div class="control filter-field"><label for="theme">'+T("theme")+'</label><select id="theme" data-field="theme">'+THEMES.map(key=>'<option value="'+key+'"'+(state.theme===key?" selected":"")+'>'+esc(key==="all"?(fr?"Tous":"All"):themeNames[state.language][key])+'</option>').join("")+'</select></div>'
 +'<div class="control filter-field"><label for="sort">'+T("sort")+'</label><select id="sort" data-field="sort"><option value="recent"'+(state.sort==="recent"?" selected":"")+'>'+T("recent")+'</option><option value="az"'+(state.sort==="az"?" selected":"")+'>'+T("alphabetical")+'</option></select></div></section>'
 +'<div class="library-quick-filters"><div class="library-filter-chips" role="group" aria-label="'+esc(fr?"Catégories rapides":"Quick categories")+'">'
 +quickThemes.map(key=>'<button type="button" class="library-chip'+(state.theme===key?' active':'')+'" data-action="quick-theme" data-theme="'+key+'" aria-pressed="'+(state.theme===key)+'">'+esc(themeNames[state.language][key])+'</button>').join("")
 +'</div><div class="library-view-tabs" role="group" aria-label="'+esc(fr?"Bibliothèque ou favoris":"Library or favorites")+'">'
 +'<button class="library-view-tab'+(!state.showFavorites?' active':'')+'" data-action="view-favorites" data-view="all" aria-pressed="'+(!state.showFavorites)+'">'+T("library")+'</button>'
 +'<button class="library-view-tab'+(state.showFavorites?' active':'')+'" data-action="view-favorites" data-view="favorites" aria-pressed="'+state.showFavorites+'">'+icon("heart")+esc(fr?"Favoris":"Favorites")+' <span>'+state.favorites.length+'</span></button></div></div>'
 +'<section class="hero library-hero"><div><div class="hero-label">'+T("heroTag")+'</div><h2>'+T("heroTitle")+'</h2><p>'+T("heroCopy")+'</p><button type="button" class="btn btn-primary" data-action="nav" data-page="routines">'+T("createRoutine")+icon("arrow","btn-icon")+'</button></div>'
 +'<div class="hero-display"><div class="hero-icon">'+samples[3].image+'</div></div></section>'
 +(recent.length?'<section class="client-recent" aria-label="'+esc(fr?"Pictogrammes récemment consultés":"Recently viewed pictograms")+'"><div class="section-heading"><h2>'+esc(fr?"Consultés récemment":"Recently viewed")+'</h2><span class="muted">'+esc(fr?"Sur cet appareil":"On this device")+'</span></div>'
   +'<div class="client-recent-list">'+recent.slice(0,5).map(item=>'<button type="button" data-action="view-picto" data-id="'+esc(item.id)+'">'+customPicto(item,state.currentPreset,5,true)+'<span>'+esc(labelFor(item,state.language))+'</span></button>').join("")+'</div></section>':"")
 +renderDemoPictoDetail()
 +'<div class="section-heading library-result-heading"><h2>'+esc(state.showFavorites?(fr?"Mes favoris":"My favorites"):T("selection"))+'</h2><span class="muted">'+results.length+' '+T("results")+'</span></div>'
 +(results.length?'<div class="picto-grid">'+results.map(renderCard).join("")+'</div>':'<div class="empty"><div class="empty-icon">'+icon(state.showFavorites?"heart":"search")+'</div><h2>'+esc(state.showFavorites?(fr?"Aucun favori pour le moment":"No favorites yet"):T("noResults"))+'</h2><p>'+esc(state.showFavorites?(fr?"Touchez le cœur d’un pictogramme pour le retrouver ici. Ces favoris restent sur cet appareil.":"Tap the heart on a pictogram to find it here. These favorites stay on this device."):T("noResultsCopy"))+'</p><button class="btn btn-light" data-action="clear">'+T("clean")+'</button></div>')
 +renderCustomerRequestCenter()
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
  +'<p class="tablet-note">'+(state.language==="fr"?"Pour un PDF, choisissez « Enregistrer au format PDF » dans la boîte d’impression du navigateur.":"To make a PDF, choose Save as PDF in your browser print dialog.")+'</p>'
  +'<div class="control full-span" style="margin-top:13px"><label for="routine-pdf-title">'+esc(state.language==="fr"?"Nom du PDF à conserver":"Name for the saved PDF")+'</label><input id="routine-pdf-title" type="text" maxlength="120" data-input="routine-pdf-title" value="'+esc(state.routinePdfTitle)+'"></div>'
  +'<button type="button" class="btn btn-primary files-auto-archive" data-action="archive-generated-routine"'+(disabled||!authStatus.user||pdfExportBusy||pendingGeneratedPdf?.uid===authStatus.user.id?' disabled':'')+'>'+icon("save","btn-icon")+esc(pdfExportBusy?(state.language==="fr"?"Création et archivage…":"Creating and archiving…"):(state.language==="fr"?"Créer et archiver le PDF":"Create and archive PDF"))+'</button>'
  +'<p class="tablet-note">'+esc(state.language==="fr"?"Préversion PDF 300 ppp : vérifiez la taille réelle avant impression. Connectez-vous pour archiver.":"300 dpi preview PDF: check actual printed size. Sign in to archive.")+'</p>'
  +'<button type="button" class="btn btn-light files-after-print" data-action="nav" data-page="files">'+icon("database","btn-icon")+esc(state.language==="fr"?"Archiver le PDF dans Mes fichiers":"Archive PDF in My files")+'</button></section></div>'+printStage;
}
function boardGrid(items,printLayout=false){
  const cm=state.boardWidthCm,dimensions=scaleMetrics(state.currentPreset,cm);
  const displayCols=printLayout?state.boardCols:Math.min(state.boardCols,Math.max(1,items.length));
  return '<div class="board-demo-grid" style="--board-cols:'+displayCols+';--board-width:'+fmtRaw(dimensions.widthCm)+'cm;--board-height:'+fmtRaw(dimensions.heightCm)+'cm">'
    +items.map(item=>'<div class="board-demo-cell">'+customPicto(item,state.currentPreset,cm,false)+'</div>').join("")+'</div>';
}
function renderBoard(){
  const fr=state.language==="fr",items=boardItems(),fits=demoBoardFitsWidth(state.boardCols,state.boardWidthCm,state.paper);
  const title=(state.boardTitle||"").trim()||(fr?"Mon tableau":"My board");
  const help=fr?"Cette préversion utilise seulement les 12 pictogrammes fictifs de la maquette. La grille, les nombres et les dimensions ne sont pas encore les normes officielles.":
    "This preview uses only 12 fictional sample pictograms. Grid layout, quantity and dimensions are not finalized standards.";
  const stage=items.length?'<div class="board-preview-stage">'+boardGrid(items)+'</div>':
    '<div class="empty"><div class="empty-icon">'+icon("library")+'</div><h2>'+esc(fr?"Un tableau commence avec une image":"Start a board with one picture")+'</h2><p>'+esc(fr?"Ajoutez des pictogrammes d’essai ci-dessous.":"Add sample pictograms below.")+'</p></div>';
  const lines=items.map((item,index)=>
    '<div class="routine-line"><span class="routine-number">'+(index+1)+'</span><span class="routine-name">'+esc(labelFor(item,state.language))+'</span>'
    +'<button type="button" class="mini-btn" data-action="board-move" data-index="'+index+'" data-direction="-1" aria-label="'+esc(fr?"Déplacer vers le début":"Move earlier")+'"'+(!index?" disabled":"")+'>'+icon("up")+'</button>'
    +'<button type="button" class="mini-btn" data-action="board-move" data-index="'+index+'" data-direction="1" aria-label="'+esc(fr?"Déplacer vers la fin":"Move later")+'"'+(index===items.length-1?" disabled":"")+'>'+icon("down")+'</button>'
    +'<button type="button" class="mini-btn" data-action="board-remove" data-index="'+index+'" aria-label="'+esc(fr?"Retirer":"Remove")+' '+esc(labelFor(item,state.language))+'">'+icon("trash")+'</button></div>'
  ).join("");
  const palette=samples.map(item=>
    '<button class="board-palette-item" type="button" data-action="board-add" data-id="'+esc(item.id)+'"'
    +(items.length>=DEMO_BOARD_CAP?' disabled':'')+'><span class="board-palette-art">'+item.image+'</span>'
    +'<span>'+esc(labelFor(item,state.language))+'</span>'+icon("plus","btn-icon")+'</button>'
  ).join("");
  const printStage=items.length?
    '<section class="print-sheet board-print-sheet" aria-label="'+esc(fr?"Tableau de communication à imprimer":"Printable communication board")+'">'
    +'<h1 class="board-print-title">'+esc(title)+'</h1>'+boardGrid(items,true)+'</section>':"";
  return '<div class="board-workspace"><div class="page-intro"><div><h1>'+esc(fr?"Mon tableau de communication":"My communication board")+'</h1><p>'
    +esc(fr?"Composer, organiser et imprimer un tableau avec des pictogrammes d’essai.":"Build, arrange and print a board using sample pictograms.")+'</p></div>'
    +'<span class="count-badge">'+items.length+' / '+DEMO_BOARD_CAP+'</span></div>'
    +'<div class="notice blue">'+icon("info","btn-icon")+' '+esc(help)+'</div>'
    +'<div class="page-two-col board-columns"><section class="panel"><div class="section-heading"><h2>'+esc(fr?"Aperçu du tableau":"Board preview")+'</h2></div>'
    +'<h3 id="board-current-title" class="board-preview-title">'+esc(title)+'</h3>'+stage
    +(items.length?'<h3 class="board-section-title">'+esc(fr?"Ordre des cases":"Cell order")+'</h3><div class="routine-items">'+lines+'</div>':"")
    +'</section><section class="panel"><h2 class="panel-title">'+esc(fr?"Réglages de démonstration":"Demo settings")+'</h2>'
    +'<div class="settings-grid"><div class="control full-span"><label for="board-title">'+esc(fr?"Titre du tableau":"Board title")+'</label>'
    +'<input id="board-title" type="text" data-input="board-title" maxlength="80" placeholder="'+esc(fr?"Mon tableau":"My board")+'" value="'+esc(state.boardTitle)+'"></div>'
    +'<div class="control"><label for="board-cols">'+esc(fr?"Colonnes":"Columns")+'</label>'
    +'<select id="board-cols" data-field="board-cols">'+[2,3,4].map(n=>'<option value="'+n+'"'+(state.boardCols===n?' selected':'')+'>'+n+'</option>').join("")+'</select></div>'
    +'<div class="control"><label for="board-size">'+esc(fr?"Largeur des cases (cm)":"Cell width (cm)")+'</label>'
    +'<input id="board-size" type="number" min="2" max="10" step=".5" data-field="board-size" value="'+state.boardWidthCm+'"></div>'
    +'<div class="control full-span"><label for="board-paper">'+esc(fr?"Feuille":"Paper")+'</label><select id="board-paper" data-field="board-paper"><option value="letter"'+(state.paper==="letter"?' selected':'')+'>Lettre / Letter</option><option value="a4"'+(state.paper==="a4"?' selected':'')+'>A4</option></select></div></div>'
    +(!fits&&items.length?'<div class="notice" role="alert">'+esc(fr?"Le tableau est trop large pour la feuille de démonstration. Réduisez la largeur ou le nombre de colonnes.":"This board is too wide for the demo paper. Reduce cell size or columns.")+'</div>':"")
    +'<button type="button" class="btn btn-primary board-print-button" data-action="board-print"'+(!items.length||!fits?' disabled':'')+'>'+icon("print","btn-icon")+esc(fr?"Imprimer le tableau":"Print board")+'</button>'
    +'<p class="tablet-note">'+esc(fr?"Pour créer un PDF, choisissez « Enregistrer en PDF » dans la boîte d’impression. Mise en page provisoire.":"To create a PDF, select Save as PDF in your browser print dialog. Layout is provisional.")+'</p>'
    +'<button type="button" class="btn btn-primary files-auto-archive" data-action="archive-generated-board"'+(!items.length||!fits||!authStatus.user||pdfExportBusy||pendingGeneratedPdf?.uid===authStatus.user.id?' disabled':'')+'>'+icon("save","btn-icon")+esc(pdfExportBusy?(fr?"Création et archivage…":"Creating and archiving…"):(fr?"Créer et archiver le PDF du tableau":"Create and archive board PDF"))+'</button>'
    +'<p class="tablet-note">'+esc(fr?"Préversion PDF 300 ppp; taille réelle à valider. Connectez-vous pour archiver.":"300 dpi preview PDF; actual size to validate. Sign in to archive.")+'</p>'
    +'<button type="button" class="btn btn-light files-after-print" data-action="nav" data-page="files">'+icon("database","btn-icon")+esc(fr?"Archiver le PDF dans Mes fichiers":"Archive PDF in My files")+'</button></section></div>'
    +'<section class="panel board-palette-panel"><div class="section-heading"><h2>'+esc(fr?"Ajouter une image":"Add a picture")+'</h2><span class="muted">'+esc(fr?"Dessins d'essai seulement":"Sample artwork only")+'</span></div>'
    +'<div class="board-palette">'+palette+'</div></section></div>'+printStage;
}
function adminPreview(){
  const item=samples.find(x=>x.id===state.adminItem)||samples[0],p=state.currentPreset;
  const size=5;
  const content=customPicto(item,p,size,false);
  const fixed=content.replace(/(class="picto"[^>]*style=")/,'$1width:5cm;height:'+(p.shape==="portrait"?'6.75':'5')+'cm;');
  return '<div class="picto-wrapper"><div class="color-shell'+(p.colored?"":" no-color")+'" style="--bordercolor:'+p.color+';--colorwidth:2mm">'+fixed+'</div></div>';
}
function renderAdminTemplate(){
  const p=state.currentPreset;
  return '<div class="page-intro"><div><div class="admin-title"><h1>'+T("adminTitle")+'</h1><span class="label-tag">'+T("demo")+'</span></div><p>'+T("adminCopy")+'</p></div></div>'
  +'<div class="page-two-col"><section class="panel"><h2 class="panel-title">'+T("adminPreview")+'</h2><div id="admin-stage" class="admin-stage">'+adminPreview()+'</div><p class="admin-preview-caption">'+T("example")+' · 5 cm · '+T("changes")+'</p>'
  +'<div id="admin-art-feedback" class="notice admin-art-feedback" role="alert" hidden></div>'
  +'<div class="notice blue" style="margin-top:20px">'+T("adminNote")+'</div></section>'
  +'<section class="panel"><h2 class="panel-title">'+T("preset")+'</h2><p class="panel-copy">'+T("adminCopy")+'</p><div class="settings-grid">'
  +'<div class="control full-span"><label for="admin-item">'+T("example")+'</label><select id="admin-item" data-field="adminItem">'+samples.map(x=>'<option value="'+x.id+'"'+(state.adminItem===x.id?" selected":"")+'>'+esc(labelFor(x,state.language))+'</option>').join("")+'</select></div>'
  +'<div class="control"><label for="admin-shape">'+T("format")+'</label><select id="admin-shape" data-field="adminShape"><option value="square"'+(p.shape==="square"?" selected":"")+'>'+T("square")+'</option><option value="portrait"'+(p.shape==="portrait"?" selected":"")+'>'+T("portrait")+'</option></select></div>'
  +'<div class="control"><label for="admin-color">'+T("color")+'</label><div class="color-select"><input id="admin-color" type="color" data-field="adminColor" value="'+p.color+'"><small>'+esc(p.color.toUpperCase())+'</small></div></div>'
  +adminRange("artPercent",T("artPercent"),p.artPercent,30,95,1,"%")
  +(p.shape==="square"?'<div class="control full-span"><label for="admin-square-art-center">'+T("squareArtCenter")+'</label>'
    +'<select id="admin-square-art-center" data-field="adminSquareArtCenter">'
    +'<option value="'+CENTER_UPPER+'"'+(p.squareCenterMode===CENTER_UPPER?' selected':'')+'>'+T("artUpper")+'</option>'
    +'<option value="'+CENTER_WHOLE+'"'+(p.squareCenterMode===CENTER_WHOLE?' selected':'')+'>'+T("artWhole")+'</option></select></div>':"")
  +adminRange("bandMm",T("labelBand"),p.bandMm,6,30,.5,"mm")
  +adminRange("strokeMm",T("blackStroke"),p.strokeMm,.4,4,.2,"mm")
  +adminRange("fontPt",T("fontSize"),p.fontPt,7,26,1,"pt")
  +'<div class="control full-span"><label for="admin-font-color">'+T("textColor")+'</label><div class="color-select"><input id="admin-font-color" type="color" data-field="adminFontColor" value="'+(p.fontColor||"#111111")+'"><small>'+esc((p.fontColor||"#111111").toUpperCase())+'</small></div></div>'
  +adminRange("separatorMm",T("separator"),p.separatorMm,.5,4,.1,"mm")
  +'<label class="toggle-row full-span"><input type="checkbox" data-field="adminColored" '+(p.colored?"checked":"")+'>'+T("colored")+'</label></div>'
  +'<div class="admin-actions" style="margin-top:22px"><button class="btn btn-primary" data-action="save">'+icon("check","btn-icon")+T("save")+'</button><button class="btn btn-quiet" data-action="restore">'+T("restore")+'</button></div>'
  +'</section></div>';
}
function renderAdmin(){
  const fr=state.language==="fr";
  const sectionNames=fr?{
    overview:"Vue d'ensemble",bank:"Banque",requests:"Demandes",tools:"Outils",templates:"Gabarits",
    heading:"Espace de gestion",description:"Un endroit simple pour organiser les pictogrammes et préparer les supports visuels.",
    status:"ACCÈS ADMIN VÉRIFIÉ",sample:"Illustrations de démonstration",samples:"Images de test",privateBank:"Banque privée Supabase",
    privateInfo:"Aperçus d’images privées et propositions de corrections locales. La sauvegarde Supabase attend une politique de sécurité approuvée. Aucune publication.",
    bankTitle:"Votre banque de pictogrammes",bankSub:"Classez les pictogrammes par thème et vérifiez les importations avant publication.",
    sampleTitle:"Exemples de pictogrammes",toolsTitle:"Vos outils",toolsSub:"Des outils pratiques pour préparer des pictogrammes.",
    toolChrome:"Extension Chrome — importer et rogner",toolChromeSub:"Détectez des images sur une page Web, rognez-les et importez-les comme brouillons dans la banque privée avec votre compte super admin.",
    openExtension:"Voir l'extension",toolLibrary:"Importer un PNG",toolLibrarySub:"Ajouter un PNG comme brouillon dans la banque privée. Aucune publication automatique.",
    toolGabarit:"Personnaliser les gabarits",toolGabaritSub:"Ajustez la bande de texte, les bordures et les proportions des cases.",
    edit:"Ouvrir les gabarits",soon:"À connecter",noReal:"Aucun actif réel n'est chargé dans cette maquette",
    mustBePrivate:"L'accès à la banque réelle sera réservé aux comptes super admin authentifiés."
  }:{
    overview:"Overview",bank:"Library",requests:"Requests",tools:"Tools",templates:"Templates",
    heading:"Management workspace",description:"A simple place to organize pictograms and prepare visual materials.",
    status:"VERIFIED ADMIN ACCESS",sample:"Sample illustrations",samples:"Sample images",privateBank:"Private Supabase bank",
    privateInfo:"Private image previews and local correction proposals. Supabase saving awaits approval of a security policy. No publishing.",
    bankTitle:"Your pictogram library",bankSub:"Organize pictograms and review imports before publishing.",
    sampleTitle:"Sample pictograms",toolsTitle:"Your tools",toolsSub:"Helpful tools for preparing pictograms.",
    toolChrome:"Chrome extension — import and crop",toolChromeSub:"Detect and crop images from websites and import them as private drafts with your super admin account.",
    openExtension:"View extension",toolLibrary:"Import a PNG",toolLibrarySub:"Add a PNG as a private bank draft. No automatic publishing.",
    toolGabarit:"Customize templates",toolGabaritSub:"Adjust label bands, borders and cell proportions.",
    edit:"Open templates",soon:"Not connected yet",noReal:"No actual imported assets are loaded in this mockup",
    mustBePrivate:"The real library will only be available to authenticated super admins."
  };
  const tab=(name,title,ico)=>'<button class="admin-tab'+(state.adminTab===name?' active':'')+'" type="button" data-action="admin-tab" data-tab="'+name+'" aria-pressed="'+(state.adminTab===name)+'">'+icon(ico)+esc(title)+'</button>';
  const preview=samples.slice(0,6).map(pic=>'<div class="admin-bank-card">'+customPicto(pic,state.currentPreset,5,true)+'<strong>'+esc(labelFor(pic,state.language))+'</strong><small>'+esc(fr?"Exemple · Non publié":"Sample · Not published")+'</small></div>').join("");
  const info='<div class="admin-surface-note">'+icon("info","btn-icon")+' '+esc(sectionNames.privateInfo)+'</div>';
  const visibleAssets=privateBank.items;
  // Le choix des thèmes ne doit pas dépendre d'une seule page de résultats.
  const bankThemes=[...new Set(["autres","hygiene","autonomie","alimentation","ecole","loisirs","socialisation","consignes","etapes","transport","sensoriel","objets","lieux",bankFilters.theme,...privateBank.items.map(asset=>asset.theme),...themeUI.items.filter(x=>!x.merged_into).map(x=>x.code)].filter(v=>typeof v==="string"&&v&&v!=="all"&&!themeUI.items.some(t=>t.code===v&&t.merged_into)))].sort((a,b)=>a.localeCompare(b,"fr-CA"));
  const filters='<div class="admin-bank-controls" role="search">'
    +'<div class="control admin-bank-query"><label for="admin-bank-search">'+esc(fr?"Rechercher dans toute la banque":"Search the full bank")+'</label>'
    +'<input id="admin-bank-search" data-input="admin-bank-search" type="search" value="'+esc(bankFilters.query)+'" placeholder="'+esc(fr?"Nom administratif ou FR/EN, thème":"Admin or FR/EN name, theme")+'" autocomplete="off"></div>'
    +'<div class="control"><label for="admin-bank-status">'+esc(fr?"Statut":"Status")+'</label><select id="admin-bank-status" data-field="admin-bank-status">'
    +[['all',fr?"Tous":"All"],['draft',fr?"Brouillons":"Drafts"],['published',fr?"Publiés":"Published"]].map(([key,label])=>'<option value="'+key+'"'+(bankFilters.status===key?' selected':'')+'>'+esc(label)+'</option>').join("")+'</select></div>'
    +'<div class="control"><label for="admin-bank-theme">'+esc(fr?"Thème":"Theme")+'</label><select id="admin-bank-theme" data-field="admin-bank-theme">'
    +'<option value="all">'+esc(fr?"Tous les thèmes":"All themes")+'</option>'+bankThemes.map(theme=>'<option value="'+esc(theme)+'"'+(bankFilters.theme===theme?' selected':'')+'>'+esc(themeLabel(theme))+'</option>').join("")+'</select></div>'
    +'<div class="control"><label for="admin-bank-sort">'+esc(fr?"Ordre":"Sort by")+'</label><select id="admin-bank-sort" data-field="admin-bank-sort">'
    +'<option value="recent"'+(bankFilters.sort==="recent"?' selected':'')+'>'+esc(fr?"Importation récente":"Recent imports")+'</option>'
    +'<option value="oldest"'+(bankFilters.sort==="oldest"?' selected':'')+'>'+esc(fr?"Importation ancienne":"Oldest imports")+'</option>'
    +'<option value="name"'+(bankFilters.sort==="name"?' selected':'')+'>'+esc(fr?"Nom affiché A–Z":"Displayed name A–Z")+'</option>'
    +'<option value="name_desc"'+(bankFilters.sort==="name_desc"?' selected':'')+'>'+esc(fr?"Nom affiché Z–A":"Displayed name Z–A")+'</option></select></div></div>';
  const bankViewControls='<div class="admin-bank-view-controls" role="group" aria-label="'+esc(fr?"Affichage des actifs":"Asset display mode")+'">'
    +[["list",fr?"Liste":"List"],["small",fr?"Petites miniatures":"Small thumbnails"],["medium",fr?"Images moyennes":"Medium images"]]
      .map(([value,label])=>'<button type="button" data-action="admin-bank-view" data-view="'+value+'" class="btn btn-light btn-small'+(bankView===value?' is-active':'')+'" aria-pressed="'+(bankView===value)+'">'+esc(label)+'</button>').join("")
    +'</div>';
  const bankSummary='<p class="admin-bank-summary" role="status">'
    +esc(fr?privateBank.total+" résultat(s) dans la banque pour ces critères (recherche serveur, "+ADMIN_BANK_PAGE_SIZE+" fiches par page)."
      :privateBank.total+" result(s) in the bank for these filters (server-side search, "+ADMIN_BANK_PAGE_SIZE+" records per page).")
    +'</p>';
  const firstItem=privateBank.total?privateBank.page*ADMIN_BANK_PAGE_SIZE+1:0;
  const lastItem=privateBank.total?Math.min(privateBank.total,(privateBank.page+1)*ADMIN_BANK_PAGE_SIZE):0;
  const lastPage=Math.max(0,Math.ceil(privateBank.total/ADMIN_BANK_PAGE_SIZE)-1);
  const pagination='<nav class="admin-bank-pagination" aria-label="'+esc(fr?"Pages de la banque":"Bank pages")+'">'
    +'<button type="button" class="btn btn-light btn-small" data-action="admin-bank-page" data-direction="previous"'+(privateBank.page<=0||privateBank.loading?' disabled':'')+'>'+esc(fr?"Précédent":"Previous")+'</button>'
    +'<span role="status">'+esc(fr?("Fiches "+firstItem+"–"+lastItem+" sur "+privateBank.total+" · page "+(privateBank.page+1)+"/"+(lastPage+1))
      :("Records "+firstItem+"–"+lastItem+" of "+privateBank.total+" · page "+(privateBank.page+1)+"/"+(lastPage+1)))+'</span>'
    +'<button type="button" class="btn btn-light btn-small" data-action="admin-bank-page" data-direction="next"'+(privateBank.page>=lastPage||privateBank.loading?' disabled':'')+'>'+esc(fr?"Suivant":"Next")+'</button></nav>';
  const realAssets=visibleAssets.map(asset=>{
    const label=state.language==="en"?(asset.title_en||asset.title_fr):asset.title_fr;
    const adminName=asset.admin_name||asset.title_fr||"—";
    const assignedThemes=themeUI.links[asset.id]||[asset.theme];
    const date=asset.created_at&&Number.isFinite(Date.parse(asset.created_at))
      ?new Date(asset.created_at).toLocaleDateString(state.language==="fr"?"fr-CA":"en-CA"):"—";
    return '<article class="admin-bank-card admin-bank-item">'
      +renderBankThumb(asset)
      +'<div class="admin-bank-item-meta"><strong title="'+esc(adminName)+'">'+esc(adminName)+'</strong>'
      +(adminName!==label?'<span class="admin-bank-secondary">'+esc(label||"—")+'</span>':"")
      +'<small>'+assignedThemes.map(t=>esc(themeLabel(t))).join(" · ")+' · '+esc(asset.status||"draft")+'</small>'
      +'<small>'+esc(fr?"Importé : ":"Imported: ")+esc(date)+'</small></div>'
      +'<div class="admin-bank-item-actions"><button type="button" class="btn btn-light btn-small admin-preview-button" data-action="admin-preview" data-id="'+esc(asset.id)+'"'
      +(privatePreview.loading?' disabled':'')+'>'+icon("search","btn-icon")+esc(fr?"Aperçu privé":"Private preview")+'</button>'
      +'<button type="button" class="btn btn-light btn-small" data-action="admin-rename" data-id="'+esc(asset.id)+'">'+esc(fr?"Renommer":"Rename")+'</button>'
      +'<button type="button" class="btn btn-light btn-small" data-action="admin-theme-asset" data-id="'+esc(asset.id)+'">'+esc(fr?"Thèmes":"Themes")+'</button>'
      +(asset.status==="draft"&&asset.created_by===authStatus.user?.id?'<button type="button" class="btn btn-light btn-small" data-action="admin-edit-draft" data-id="'+esc(asset.id)+'">'+icon("check","btn-icon")+esc(fr?"Préparer la fiche":"Review draft")+'</button>':"")
      +'</div></article>';
  }).join("");
  const realBankBody=privateBank.loading
    ? '<p role="status">'+esc(fr?"Chargement de la banque…":"Loading bank…")+'</p>'
    : realAssets||'<p role="status">'+esc(privateBank.total?(fr?"Cette page ne contient plus de fiches. Revenez à la page précédente.":"This page has no records; go to the previous page."):(fr?"Aucune fiche ne correspond à votre recherche.":"No records match your search."))+'</p>';
  const chosen=privateBank.items.find(item=>item.id===privatePreview.id);
  const chosenLabel=chosen?(state.language==="en"?(chosen.title_en||chosen.title_fr):chosen.title_fr):"";
  const review=privatePreview.asset&&privatePreview.technical
    ?assessDraftQuality(privatePreview.asset,privatePreview.technical):null;
  const reviewHtml=!review?"":'<div class="admin-quality-review"><h4>'+esc(fr?"Précontrôle de la fiche":"Draft preliminary checks")+'</h4>'
    +'<div class="admin-quality-checks">'+review.checks.map(check=>
      '<div class="admin-quality-check"><span class="admin-quality-state '+(check.status==="ok"?"is-ok":"is-warning")+'">'+
      esc(check.status==="ok"?(fr?"Présent":"Present"):(fr?"À corriger":"Needs work"))+'</span>'
      +'<span>'+esc(fr?check.fr:check.en)+'</span></div>'
    ).join("")+'</div>'
    +'<h4>'+esc(fr?"Points obligatoires à vérifier manuellement":"Mandatory manual review")+'</h4>'
    +'<ul>'+review.manual.map(check=>'<li>'+esc(fr?check.fr:check.en)+'</li>').join("")+'</ul>'
    +'<p class="admin-quality-warning">'+esc(fr?
      "Précontrôle indicatif uniquement. Publication impossible sans composition conforme et approbation humaine.":
      "Preliminary guidance only. Publishing requires a compliant composition and human approval.")+'</p></div>';
  const privateInkCard=!privatePreview.inkUrl||!privatePreview.asset?"":(()=>{
    const asset=privatePreview.asset;
    const picture={fr:asset.title_fr,en:asset.title_en||asset.title_fr,
      image:'<img data-pictau-ink src="'+esc(privatePreview.inkUrl)+'" alt="" loading="eager" decoding="async">'};
    const p=state.currentPreset;
    const geom=scaleMetrics(p,5);
    return '<div class="admin-png-template"><h4>'+esc(fr?"Essai de centrage du dessin dans le gabarit":"Artwork centering trial in template")+'</h4>'
      +'<div class="admin-png-stage"><div class="color-shell'+(p.colored?"":" no-color")+'" style="--bordercolor:'+p.color+';--colorwidth:2mm">'
      +'<div class="admin-png-cell" style="width:5cm;height:'+fmtRaw(geom.heightCm)+'cm">'+customPicto(picture,p,5,false)+'</div></div></div>'
      +'<p>'+esc(fr?"Le rognage ignore les marges claires ou transparentes. Copie temporaire dans ce navigateur : source originale intacte, aucune publication.":"Cropping ignores light or transparent margins. Temporary browser copy only: original unchanged and never published.")+'</p>'
      +'</div>';
  })();
  const privatePreviewBody=!chosen?"":'<section class="admin-private-preview" role="region" aria-label="'+esc(fr?"Aperçu du pictogramme privé":"Private pictogram preview")+'">'
    +'<div class="admin-preview-heading"><div><h3>'+esc(chosenLabel||"—")+'</h3><p>'+esc(fr?"Source privée; non publiée par cet aperçu.":"Private source; viewing it does not publish it.")+'</p></div>'
    +'<button type="button" class="btn btn-quiet btn-small" data-action="close-admin-preview">'+icon("close","btn-icon")+esc(fr?"Fermer":"Close")+'</button></div>'
    +(privatePreview.loading?'<p role="status">'+esc(fr?"Chargement sécurisé de l’image…":"Loading private image…")+'</p>':"")
    +(privatePreview.error?'<p role="alert" class="admin-import-alert">'+esc(privatePreview.error)+'</p>':"")
    +(privatePreview.url?'<img class="admin-preview-image" src="'+esc(privatePreview.url)+'" alt="'+esc(chosenLabel||"—")+'"><div class="admin-preview-download"><button type="button" class="btn btn-light btn-small" data-action="download-admin-preview">'+esc(fr?"Télécharger le PNG privé":"Download private PNG")+'</button></div>':"")
    +(privatePreview.technical?'<p class="admin-preview-technical">'+esc(
      privatePreview.technical.width+" × "+privatePreview.technical.height+" px · PNG · "+
      privatePreview.technical.bitDepth+" bits · "+
      ({0:fr?"Gris":"Gray",2:"RGB",3:fr?"Palette":"Palette",4:fr?"Gris + alpha":"Gray + alpha",6:"RGBA"}[privatePreview.technical.colorType]||"PNG")+
      (privatePreview.technical.interlaced?" · "+(fr?"entrelacé":"interlaced"):"")
    )+'</p><p class="admin-preview-advisory">'+esc(fr?
    "Informations techniques seulement : qualité graphique et publication à valider manuellement.":
    "Technical information only: artwork quality and publishing still require human review.")+'</p>':"")
    +(privatePreview.inkError?'<p class="admin-import-alert" role="status">'+esc(fr?"Aperçu d'encre indisponible : ":"Ink preview unavailable: ")+esc(privatePreview.inkError)+'</p>':"")
    +privateInkCard+reviewHtml
    +(publishedCatalog.publishError?'<p role="alert" class="admin-import-alert">'+esc(publishedCatalog.publishError)+'</p>':'')
    +(publishedCatalog.publishMessage?'<p role="status" class="admin-import-success">'+esc(publishedCatalog.publishMessage)+'</p>':'')
    +(privatePreview.asset&&privatePreview.technical&&chosen.status==="draft"
       ?'<form data-form="catalog-publish" data-id="'+esc(chosen.id)+'" class="admin-publish-control">'
        +'<h4>'+esc(fr?'Publication dans la bibliothèque client':'Publish to client library')+'</h4>'
        +'<p>'+esc(fr?'L’original reste privé. Seule une copie PNG expressément approuvée sera visible par les clients connectés.':'The source stays private. Only an explicitly approved PNG copy becomes visible to signed-in clients.')+'</p>'
        +'<label><input type="checkbox" name="confirmed" required>'+esc(fr?'J’ai vérifié le dessin, son cadrage, les droits et le libellé.':'I reviewed the artwork, framing, rights and caption.')+'</label>'
        +'<button type="submit" class="btn btn-primary"'+(publishedCatalog.publishing?' disabled':'')+'>'+icon("check","btn-icon")+esc(publishedCatalog.publishing?(fr?'Publication…':'Publishing…'):(fr?'Approuver et publier':'Approve and publish'))+'</button></form>'
       :chosen.status==="published"
       ?'<div class="admin-publish-control"><p>'+esc(fr?'Ce pictogramme est publié dans le catalogue client.':'This pictogram is published in the client catalogue.')+'</p>'
        +'<button type="button" class="btn btn-light" data-action="catalog-unpublish" data-id="'+esc(chosen.id)+'"'+(publishedCatalog.publishing?' disabled':'')+'>'+esc(fr?'Retirer de la bibliothèque client':'Remove from client library')+'</button></div>'
       :"")+'</section>';

  const themes=[["autres",fr?"Autres":"Other"],["hygiene",fr?"Hygiène":"Hygiene"],["autonomie",fr?"Autonomie":"Independence"],["alimentation",fr?"Alimentation":"Food"],["ecole",fr?"École":"School"],["loisirs",fr?"Loisirs":"Leisure"],["socialisation",fr?"Socialisation":"Socializing"],["consignes",fr?"Consignes":"Instructions"],["etapes",fr?"Étapes":"Steps"],["transport",fr?"Transport":"Transport"],["sensoriel",fr?"Sensoriel":"Sensory"],["objets",fr?"Objets significatifs":"Meaningful objects"],["lieux",fr?"Lieux":"Places"]]
     .map(([code,label])=>[code,themeUI.items.find(t=>t.code===code)?.[fr?"label_fr":"label_en"]||label])
     .concat(themeUI.items.filter(t=>!t.merged_into&&!["autres","hygiene","autonomie","alimentation","ecole","loisirs","socialisation","consignes","etapes","transport","sensoriel","objets","lieux"].includes(t.code))
       .map(t=>[t.code,fr?t.label_fr:t.label_en]))
     .filter(([code])=>!themeUI.items.some(t=>t.code===code&&t.merged_into));
  const importForm='<section class="admin-surface admin-import-panel"><div class="admin-surface-head"><div><h2>'+esc(fr?"Importer un pictogramme PNG":"Import a PNG pictogram")+'</h2><p>'
   +esc(fr?"Image privée, fiche brouillon. Ce formulaire ne publie rien.":"Private image, draft record. This form cannot publish.")+'</p></div>'
   +'<span class="admin-chip">'+esc(fr?"Brouillon seulement":"Draft only")+'</span></div>'
   +'<form data-form="admin-import" class="admin-import-form">'
   +'<div class="control"><label for="draft-title-fr">'+esc(fr?"Nom français *":"French label *")+'</label><input id="draft-title-fr" name="titleFr" type="text" maxlength="100" required autocomplete="off" value="'+esc(privateImport.draft.titleFr)+'" placeholder="'+esc(fr?"ex. se laver les mains":"e.g. se laver les mains")+'"></div>'
   +'<div class="control"><label for="draft-title-en">'+esc(fr?"Nom anglais (facultatif)":"English label (optional)")+'</label><input id="draft-title-en" name="titleEn" type="text" maxlength="100" autocomplete="off" value="'+esc(privateImport.draft.titleEn)+'" placeholder="e.g. wash hands"></div>'
   +'<div class="control"><label for="draft-theme">'+esc(fr?"Thème":"Theme")+'</label><select id="draft-theme" name="theme">'
   +themes.map(([v,label])=>'<option value="'+v+'"'+(v===privateImport.draft.theme?' selected':'')+'>'+esc(label)+'</option>').join("")+'</select></div>'
   +'<div class="control"><label for="draft-file">'+esc(fr?"Image PNG * (max. 6 Mo)":"PNG image * (max. 6 MB)")+'</label><input id="draft-file" data-field="admin-import-file" type="file" accept=".png,image/png" aria-describedby="draft-file-status"><small id="draft-file-status" role="status">'
   +esc(privateImport.file?(privateImport.file.name+" · "+Math.ceil(privateImport.file.size/1024)+" Ko"):(fr?"Aucun fichier sélectionné":"No file selected"))+'</small></div>'
   +'<div class="admin-import-actions"><button class="btn btn-primary" type="submit"'+(privateImport.loading?' disabled':'')+'>'+icon("upload","btn-icon")+esc(privateImport.loading?(fr?"Importation…":"Importing…"):(fr?"Importer comme brouillon":"Import as draft"))+'</button>'
   +'<small>'+esc(fr?"PNG seulement; aucune publication automatique.":"PNG only; never auto-published.")+'</small></div></form>'
   +(privateImport.error?'<p class="admin-import-alert" role="alert">'+esc(privateImport.error)+'</p>':"")
   +(privateImport.message?'<p class="admin-import-success" role="status">'+esc(privateImport.message)+'</p>':"")
   +'</section>';
  const activeThemes=themeUI.items.filter(t=>!t.merged_into);
  const selectedThemeAsset=privateBank.items.find(a=>a.id===themeUI.assetId);
  const selectedThemeCodes=selectedThemeAsset?(themeUI.links[selectedThemeAsset.id]||[selectedThemeAsset.theme]):[];
  const themeSelect=items=>items.map(t=>'<option value="'+esc(t.code)+'">'+esc(fr?t.label_fr:t.label_en)+'</option>').join("");
  const themeAssetPanel=!selectedThemeAsset?"":'<section class="admin-private-preview admin-theme-assign" aria-label="'+esc(fr?"Classer un pictogramme":"Classify pictogram")+'">'
    +'<div class="admin-preview-heading"><h3>'+esc(fr?"Thèmes de : ":"Themes for: ")+esc(selectedThemeAsset.admin_name||selectedThemeAsset.title_fr)+'</h3>'
    +'<button type="button" class="btn btn-light btn-small" data-action="admin-theme-close">'+esc(fr?"Fermer":"Close")+'</button></div>'
    +'<div class="admin-theme-chips">'+selectedThemeCodes.map(code=>
       '<span class="admin-theme-chip">'+esc(themeLabel(code))+
       '<button type="button" data-action="admin-theme-remove" data-code="'+esc(code)+'" aria-label="'+esc(fr?"Retirer le thème":"Remove theme")+' '+esc(themeLabel(code))+'"'+(selectedThemeCodes.length<=1||themeUI.busy?' disabled':'')+'>×</button></span>'
      ).join("")+'</div>'
    +'<form data-form="admin-theme-add" class="admin-theme-inline"><label for="admin-theme-add-code">'+esc(fr?"Ajouter un thème":"Add theme")+'</label>'
    +'<select id="admin-theme-add-code" name="code" required>'+themeSelect(activeThemes.filter(t=>!selectedThemeCodes.includes(t.code)))+'</select>'
    +'<button class="btn btn-primary btn-small" type="submit"'+(themeUI.busy||selectedThemeCodes.length>=MAX_THEMES_PER_ASSET||activeThemes.every(t=>selectedThemeCodes.includes(t.code))?' disabled':'')+'>'+esc(fr?"Ajouter":"Add")+'</button></form>'
    +'<p class="request-help">'+esc(fr?"La source PNG et les libellés ne changent pas. Plusieurs thèmes sont possibles.":"The PNG and labels remain unchanged. Multiple themes are supported.")+'</p></section>';
  const editTheme=themeUI.items.find(t=>t.code===themeUI.editCode&&!t.merged_into);
  const themeManagement='<section class="admin-surface admin-theme-manager"><div class="admin-surface-head"><div><h2>'+esc(fr?"Gestion des thèmes":"Theme management")+'</h2>'
    +'<p>'+esc(fr?"Codes stables; libellés bilingues. Fusion sans supprimer les pictogrammes.":"Stable codes, bilingual labels and merging without deleting pictograms.")+'</p></div></div>'
    +(themeUI.error?'<p class="request-error" role="alert">'+esc(themeUI.error)+'</p>':"")
    +(themeUI.message?'<p class="request-success" role="status">'+esc(themeUI.message)+'</p>':"")
    +'<details class="admin-theme-details"><summary>'+esc(fr?"Créer un thème":"Create a theme")+'</summary>'
    +'<form data-form="admin-theme-create" class="admin-theme-form">'
    +'<div class="control"><label for="theme-create-code">'+esc(fr?"Code stable (sans accent)":"Stable code (no accents)")+'</label><input id="theme-create-code" name="code" required maxlength="60" pattern="[a-z][a-z0-9_-]*" placeholder="ex: jardin"></div>'
    +'<div class="control"><label for="theme-create-fr">'+esc(fr?"Nom français":"French name")+'</label><input id="theme-create-fr" name="fr" required maxlength="80"></div>'
    +'<div class="control"><label for="theme-create-en">'+esc(fr?"Nom anglais":"English name")+'</label><input id="theme-create-en" name="en" required maxlength="80"></div>'
    +'<button class="btn btn-primary" type="submit"'+(themeUI.busy?' disabled':'')+'>'+esc(fr?"Créer":"Create")+'</button></form></details>'
    +'<details class="admin-theme-details"'+(themeUI.editCode?' open':'')+'><summary>'+esc(fr?"Modifier les noms des thèmes":"Edit theme labels")+'</summary>'
    +'<div class="admin-theme-picker">'+activeThemes.map(t=>'<button type="button" class="btn btn-light btn-small" data-action="admin-theme-edit-open" data-code="'+esc(t.code)+'">'+esc(fr?t.label_fr:t.label_en)+'</button>').join("")+'</div>'
    +(editTheme?'<form data-form="admin-theme-edit" class="admin-theme-form">'
      +'<h3>'+esc(editTheme.code)+'</h3>'
      +'<div class="control"><label for="theme-edit-fr">Français</label><input id="theme-edit-fr" name="fr" required maxlength="80" value="'+esc(editTheme.label_fr)+'"></div>'
      +'<div class="control"><label for="theme-edit-en">English</label><input id="theme-edit-en" name="en" required maxlength="80" value="'+esc(editTheme.label_en)+'"></div>'
      +'<button class="btn btn-primary" type="submit"'+(themeUI.busy?' disabled':'')+'>'+esc(fr?"Enregistrer":"Save")+'</button></form>':"")+'</details>'
    +'<details class="admin-theme-details"><summary>'+esc(fr?"Fusionner deux thèmes":"Merge two themes")+'</summary>'
    +'<form data-form="admin-theme-merge" class="admin-theme-form">'
    +'<div class="control"><label for="theme-merge-source">'+esc(fr?"Thème à fusionner":"Theme to merge")+'</label><select id="theme-merge-source" name="source" required>'+themeSelect(activeThemes)+'</select></div>'
    +'<div class="control"><label for="theme-merge-target">'+esc(fr?"Thème de destination":"Destination theme")+'</label><select id="theme-merge-target" name="target" required>'+themeSelect(activeThemes)+'</select></div>'
    +'<label class="admin-theme-confirm"><input type="checkbox" name="confirmed" required> '+esc(fr?"Je confirme le transfert de toutes les associations. Le thème d’origine sera conservé comme alias, sans supprimer les images.":"I confirm transferring all associations. The original theme remains an alias; no images are deleted.")+'</label>'
    +'<button class="btn btn-primary" type="submit"'+(themeUI.busy?' disabled':'')+'>'+esc(fr?"Fusionner":"Merge")+'</button></form></details>'
    +'</section>';
  const renaming=privateBank.items.find(item=>item.id===bankRename.id);
  const renameForm=renaming?'<section class="admin-private-preview admin-bank-rename" role="region" aria-label="'+esc(fr?"Renommer un actif":"Rename asset")+'">'
    +'<h3>'+esc(fr?"Nom administratif de l’image":"Administrative image name")+'</h3>'
    +'<p>'+esc(fr?"Ce nom sert uniquement à classer l’image dans la banque. Le libellé FR/EN, le fichier PNG et le statut publié ne changent pas.":
      "This name organizes the private bank only. FR/EN labels, PNG file and published status remain unchanged.")+'</p>'
    +'<form data-form="admin-bank-rename"><label for="admin-bank-rename-input">'+esc(fr?"Nom de l’actif":"Asset name")+'</label>'
    +'<input id="admin-bank-rename-input" name="adminName" type="text" maxlength="120" value="'+esc(bankRename.value)+'" autocomplete="off" aria-describedby="admin-bank-rename-help">'
    +'<small id="admin-bank-rename-help">'+esc(fr?"Laissez vide pour afficher le nom français par défaut.":"Leave blank to show the default French label.")+'</small>'
    +'<div class="admin-import-actions"><button class="btn btn-primary" type="submit"'+(bankRename.busy?' disabled':'')+'>'+esc(bankRename.busy?(fr?"Enregistrement…":"Saving…"):(fr?"Enregistrer le nom":"Save name"))+'</button>'
    +'<button class="btn btn-light" type="button" data-action="admin-rename-cancel"'+(bankRename.busy?' disabled':'')+'>'+esc(fr?"Annuler":"Cancel")+'</button></div></form>'
    +(bankRename.error?'<p role="alert" class="admin-import-alert">'+esc(bankRename.error)+'</p>':"")+'</section>':"";
  const editing=privateBank.items.find(item=>item.id===draftEditor.id);
  let draftEditBody="";
  if(editing&&editing.status==="draft"&&editing.created_by===authStatus.user?.id){
    const proposal=draftEditor.form;
    const isUpper=value=>typeof value==="string"&&/^[\p{Lu}]/u.test(value.trim());
    const warning=isUpper(proposal.titleFr)||isUpper(proposal.titleEn)
      ?(fr?"Les libellés publiés doivent commencer par une minuscule.":"Published labels must start with a lowercase letter."):"";
    const options=[...new Set([...themes.map(([v])=>v),proposal.theme])];
    draftEditBody='<section class="admin-private-preview admin-draft-editor" role="region" aria-label="'+esc(fr?"Révision de brouillon":"Draft review")+'">'
      +'<div class="admin-preview-heading"><div><h3>'+esc(fr?"Préparer les corrections":"Prepare corrections")+'</h3><p>'
      +esc(fr?"Proposition locale. Aucune modification Supabase, aucune publication.":"Local proposal. No Supabase changes or publication.")+'</p></div>'
      +'<button type="button" class="btn btn-quiet btn-small" data-action="close-admin-edit">'+icon("close","btn-icon")+esc(fr?"Fermer":"Close")+'</button></div>'
      +'<form data-form="admin-edit-draft" class="admin-import-form">'
      +'<div class="control"><label for="edit-draft-fr">'+esc(fr?"Nom français *":"French label *")+'</label><input id="edit-draft-fr" name="titleFr" type="text" maxlength="100" required autocomplete="off" value="'+esc(proposal.titleFr)+'"></div>'
      +'<div class="control"><label for="edit-draft-en">'+esc(fr?"Nom anglais (facultatif)":"English label (optional)")+'</label><input id="edit-draft-en" name="titleEn" type="text" maxlength="100" autocomplete="off" value="'+esc(proposal.titleEn)+'"></div>'
      +'<div class="control"><label for="edit-draft-theme">'+esc(fr?"Thème":"Theme")+'</label><select id="edit-draft-theme" name="theme">'
      +options.map(value=>'<option value="'+esc(value)+'"'+(value===proposal.theme?' selected':'')+'>'+esc(themes.find(([v])=>v===value)?.[1]||value)+'</option>').join("")+'</select></div>'
      +'<div class="control"><label>'+esc(fr?"Proposition":"Proposed label")+'</label><output id="edit-draft-preview" class="admin-draft-preview-label">'+esc(proposal.titleFr||"—")+'</output></div>'
      +'<div class="admin-import-actions"><button type="button" class="btn btn-light" data-action="export-admin-proposal">'+icon("upload","btn-icon")+esc(fr?"Exporter la proposition JSON":"Export JSON proposal")+'</button>'
      +'<button type="submit" class="btn btn-primary"'+(!DRAFT_METADATA_WRITES_ENABLED||draftEditor.saving?' disabled':'')+'>'+icon("check","btn-icon")+esc(fr?"Enregistrer dans Supabase":"Save to Supabase")+'</button></div></form>'
      +(warning?'<p class="admin-import-alert" role="status">'+esc(warning)+'</p>':"")
      +(!DRAFT_METADATA_WRITES_ENABLED?'<p class="admin-draft-disabled" role="status">'+esc(fr?
      "Sauvegarde désactivée : la politique sécurisée UPDATE doit être examinée et approuvée avant activation.":
      "Saving disabled: the secured UPDATE policy must be reviewed and approved before activation.")+'</p>':"")
      +(draftEditor.error?'<p class="admin-import-alert" role="alert">'+esc(draftEditor.error)+'</p>':"")
      +(draftEditor.message?'<p class="admin-import-success" role="status">'+esc(draftEditor.message)+'</p>':"")
      +'</section>';
  }
  let body="";
  if(state.adminTab==="overview"){
    body='<div class="admin-overview-grid"><article class="admin-stat"><span>'+esc(sectionNames.samples)+'</span><strong>'+samples.length+'</strong><small>'+esc(sectionNames.sample)+'</small></article>'
      +'<article class="admin-stat"><span>'+esc(sectionNames.privateBank)+'</span><strong>'+privateBank.total+'</strong><small>'+esc(fr?"Résultats des critères actuels":"Results for current filters")+'</small></article>'
      +'<article class="admin-stat"><span>'+esc(sectionNames.tools)+'</span><strong>'+icon("settings","admin-big-icon")+'</strong><small>'+esc(sectionNames.toolChrome)+'</small></article></div>'
      +'<div class="admin-dual-panels"><section class="admin-surface"><div class="admin-surface-head"><h2>'+esc(sectionNames.sampleTitle)+'</h2><button class="admin-action-link" data-action="admin-tab" data-tab="bank">'+esc(sectionNames.bankTitle)+' →</button></div><div class="admin-bank-grid">'+preview+'</div></section>'
      +'<section class="admin-surface"><h2>'+esc(sectionNames.toolsTitle)+'</h2><p>'+esc(sectionNames.toolsSub)+'</p>'
      +'<button class="admin-feature-action" data-action="admin-tab" data-tab="tools">'+icon("upload")+esc(sectionNames.toolChrome)+' '+icon("arrow","btn-icon")+'</button>'
      +'<button class="admin-feature-action" data-action="admin-tab" data-tab="templates">'+icon("settings")+esc(sectionNames.toolGabarit)+' '+icon("arrow","btn-icon")+'</button></section></div>'+info;
  }else if(state.adminTab==="bank"){
    body=importForm+'<section class="admin-surface"><div class="admin-surface-head"><div><h2>'+esc(sectionNames.bankTitle)+'</h2><p>'+esc(sectionNames.bankSub)+'</p></div><button type="button" class="btn btn-light" data-action="refresh-admin-bank"'+(privateBank.loading?" disabled":"")+'>'+esc(fr?"Actualiser":"Refresh")+'</button></div>'
      +(privateBank.error?'<p role="alert">'+esc(fr?"Impossible de lire la banque privée.":"Unable to load private bank.")+'</p>':"")
      +filters+bankViewControls+(!privateBank.loading&&!privateBank.error?bankSummary:"")
      +'<div class="admin-bank-grid admin-bank-view-'+bankView+'">'+realBankBody+'</div>'
      +(!privateBank.loading&&!privateBank.error?pagination:"")+renameForm+themeAssetPanel+privatePreviewBody+draftEditBody+'</section>'+themeManagement+info;
  }else if(state.adminTab==="requests"){
    body=renderAdminRequestDesk({fr,requests:adminRequests,labels:REQUEST_LABELS,escape:esc,dateLabel:requestDate});
  }else if(state.adminTab==="tools"){
    body='<section class="admin-surface"><h2>'+esc(sectionNames.toolsTitle)+'</h2><p>'+esc(sectionNames.toolsSub)+'</p><div class="admin-tool-grid">'
      +'<article class="admin-tool"><span class="admin-tool-icon">'+icon("upload")+'</span><h3>'+esc(sectionNames.toolChrome)+'</h3><p>'+esc(sectionNames.toolChromeSub)+'</p>'
      +'<a class="btn btn-primary" href="https://github.com/fredvolks/pictogram/tree/setup/prompt-maitre-projet-picto/chrome-extension" target="_blank" rel="noopener noreferrer">'+esc(sectionNames.openExtension)+' ↗</a></article>'
      +'<article class="admin-tool"><span class="admin-tool-icon">'+icon("upload")+'</span><h3>'+esc(sectionNames.toolLibrary)+'</h3><p>'+esc(sectionNames.toolLibrarySub)+'</p><button type="button" class="btn btn-light" data-action="admin-tab" data-tab="bank">'+esc(fr?"Ouvrir la banque":"Open bank")+'</button></article>'
      +'<article class="admin-tool"><span class="admin-tool-icon">'+icon("settings")+'</span><h3>'+esc(sectionNames.toolGabarit)+'</h3><p>'+esc(sectionNames.toolGabaritSub)+'</p><button class="btn btn-light" data-action="admin-tab" data-tab="templates">'+esc(sectionNames.edit)+'</button></article></div></section>'+info;
  }else body=renderAdminTemplate();
  return '<div class="admin-ui"><div class="admin-ui-title"><div><div class="eyebrow">'+esc(sectionNames.status)+'</div><h1>'+esc(sectionNames.heading)+'</h1><p>'+esc(sectionNames.description)+'</p></div></div>'
    +'<nav class="admin-tabs" aria-label="'+esc(fr?"Sections administrateur":"Admin sections")+'">'+tab("overview",sectionNames.overview,"home")+tab("bank",sectionNames.bank,"library")+tab("requests",sectionNames.requests,"library")+tab("tools",sectionNames.tools,"settings")+tab("templates",sectionNames.templates,"routine")+'</nav>'
    +body+'</div>';
}

function adminRange(key,label,value,min,max,step,unit){
  return '<div class="control full-span"><div class="range-header"><label for="admin-'+key+'">'+label+'</label><output id="out-'+key+'">'+fmt(value)+' '+unit+'</output></div><input id="admin-'+key+'" data-input="admin-range" data-key="'+key+'" type="range" min="'+min+'" max="'+max+'" step="'+step+'" value="'+value+'"></div>';
}

function renderRoleChecking(){
  const fr=state.language==="fr";
  return '<section class="hosted-access" aria-label="'+esc(fr?'Vérification des accès':'Access verification')+'">'
    +'<div class="hosted-access-main"><div class="hosted-access-panel"><span class="hosted-access-eyebrow">PICT-AU</span>'
    +'<h1>'+esc(fr?'Vérification des accès':'Checking access')+'</h1>'
    +'<p role="status">'+esc(authStatus.roleError|| (fr?'Vérification sécurisée de votre rôle…':'Securely checking your role…'))+'</p>'
    +(authStatus.roleError?'<button type="button" class="btn btn-primary" data-action="role-retry">'+esc(fr?'Réessayer':'Try again')+'</button>':'')
    +'<div class="hosted-access-action">'+googleButton()+'</div></div></div></section>';
}
function renderAdminHome(){
  const fr=state.language==="fr";
  const links=[
    ["bank",fr?"Banque d’images":"Image bank",fr?"Importer et classer les brouillons privés":"Import and organize private drafts","library"],
    ["requests",fr?"Demandes":"Requests",fr?"Suivre et traiter les demandes reçues":"Review incoming requests","file-text"],
    ["tools",fr?"Outils":"Tools",fr?"Outils d’importation et de travail":"Import and work tools","upload"],
    ["templates",fr?"Gabarits":"Templates",fr?"Préparer les normes des pictogrammes":"Prepare pictogram standards","settings"]
  ];
  return '<section class="admin-dashboard" aria-labelledby="admin-dashboard-title">'
    +'<span class="admin-dashboard-kicker">'+esc(fr?'TABLEAU DE BORD ADMINISTRATEUR':'ADMINISTRATOR DASHBOARD')+'</span>'
    +'<h1 id="admin-dashboard-title">'+esc(fr?'Accueil Super Admin':'Super Admin home')+'</h1>'
    +'<p>'+esc(fr?'Gérez vos pictogrammes, vos demandes et vos gabarits en un seul endroit.':'Manage your pictograms, requests, and templates in one place.')+'</p>'
    +'<div class="admin-dashboard-summary"><div><span>'+esc(fr?'Fiches dans la banque privée':'Private bank records')+'</span><strong>'+privateBank.total+'</strong></div>'
    +'<div><span>'+esc(fr?'Statut':'Status')+'</span><strong>'+esc(fr?'Accès administrateur vérifié':'Administrator verified')+'</strong></div></div>'
    +'<div class="admin-dashboard-grid">'+links.map(([tab,title,copy,ico])=>
      '<button type="button" class="admin-dashboard-card" data-action="admin-tab" data-tab="'+tab+'">'
      +icon(ico)+ '<strong>'+esc(title)+'</strong><span>'+esc(copy)+'</span>'+icon("arrow")+'</button>').join("")+'</div>'
    +'</section>';
}
function renderAdminCaptionSettings(){
  const fr=state.language==="fr",f=captionFeature;
  return '<section class="admin-surface pa-feature-settings" aria-labelledby="pa-caption-settings-title">'
    +'<span class="pa-client-overline">'+esc(fr?"PARAMÈTRES DE L'APPLICATION":"APPLICATION SETTINGS")+'</span>'
    +'<h1 id="pa-caption-settings-title">'+esc(fr?"Personnalisation des pictogrammes":"Pictogram customization")+'</h1>'
    +'<p>'+esc(fr?"Ce réglage s'applique aux nouvelles modifications de texte des clients. Il ne change jamais leurs PDF déjà archivés.":"This setting controls new customer caption edits. It never changes archived PDFs.")+'</p>'
    +(f.loading?'<p role="status">'+esc(fr?"Lecture du réglage serveur…":"Loading server setting…")+'</p>':'')
    +(f.error?'<p role="alert">'+esc(f.error)+'</p>':'')
    +'<div class="pa-feature-switch-row"><div><strong>'+esc(fr?"Autoriser les clients à modifier le texte sous les pictogrammes":"Allow customers to edit pictogram captions")+'</strong>'
    +'<small>'+esc(fr?"Activé : texte personnalisable. Désactivé : libellés officiels pour les nouvelles impressions.":"On: editable captions. Off: official labels on new prints.")+'</small></div>'
    +'<button type="button" class="pa-feature-switch" role="switch" aria-checked="'+(f.loaded&&f.enabled)
    +'" data-action="caption-toggle"'+(!f.loaded||f.loading||f.saving?' disabled':'')+'>'
    +esc(f.loaded&&f.enabled?(fr?"Activé":"On"):(fr?"Désactivé":"Off"))+'</button></div>'
    +'<button type="button" class="btn btn-light" data-action="caption-refresh"'+(f.loading||f.saving?' disabled':'')+'>'
    +esc(fr?"Actualiser le réglage":"Refresh setting")+'</button>'
    +(f.message?'<p role="status">'+esc(f.message)+'</p>':'')
    +'<p class="pa-client-context">'+esc(fr?"Les anciens textes des brouillons sont conservés même lorsque la modification est désactivée.":"Old captions stay saved in drafts even when editing is disabled.")+'</p>'
    +'</section>';
}
function renderAdminWorkspace(){
  if(!canOpenAdmin())return renderRoleChecking();
  const fr=state.language==="fr";
  const tabs=[
    ["overview",fr?"Accueil":"Home","home"],
    ["bank",fr?"Banque":"Image bank","library"],
    ["requests",fr?"Demandes":"Requests","file-text"],
    ["tools",fr?"Outils":"Tools","upload"],
    ["templates",fr?"Gabarits":"Templates","settings"],
    ["settings",fr?"Paramètres":"Settings","settings"]
  ];
  const button=([tab,label,ico],compact=false)=>
    '<button type="button" class="'+(compact?'admin-mobile-link':'admin-side-link')+(state.adminTab===tab?' active':'')
    +'" data-action="admin-tab" data-tab="'+tab+'" '+(state.adminTab===tab?'aria-current="page"':'')+'>'
    +icon(ico)+'<span>'+esc(label)+'</span></button>';
  return '<div class="admin-workspace'+(state.adminMenuOpen?' menu-open':'')+'">'
    +'<a href="#admin-main" class="skip">'+esc(fr?'Aller au contenu':'Skip to content')+'</a>'
    +'<button class="admin-drawer-scrim" type="button" tabindex="-1" data-action="admin-menu-close" aria-label="'+esc(fr?'Fermer le menu d’administration':'Close administration menu')+'"></button>'
    +'<aside id="pictau-admin-drawer" class="admin-sidebar'+(state.adminMenuOpen?' is-open':'')+'" aria-label="'+esc(fr?'Navigation Super Admin':'Super Admin navigation')+'">'
    +'<div class="admin-mobile-drawer-head"><strong>PICT-AU · ADMIN</strong>'
    +'<button type="button" class="admin-drawer-close" data-action="admin-menu-close" aria-label="'+esc(fr?'Fermer le menu':'Close menu')+'">'+icon("close")+'</button></div>'
    +'<button type="button" class="admin-brand" data-action="admin-tab" data-tab="overview"><span class="admin-brand-mark">P</span><span class="admin-brand-identity"><strong>Pict-<span class="admin-brand-hand">a</span>u</strong><small>SUPER ADMIN</small></span></button>'
    +'<div class="admin-sidebar-caption">'+esc(fr?'ADMINISTRATION':'ADMINISTRATION')+'</div>'
    +'<nav class="admin-side-nav">'+tabs.map(tab=>button(tab)).join('')+'</nav>'
    +'<div class="admin-sidebar-status">'+esc(fr?'Espace administrateur sécurisé':'Secure administrator workspace')+'</div></aside>'
    +'<div class="admin-area"><header class="admin-topbar">'
    +'<button type="button" id="admin-menu-toggle" class="admin-menu-trigger" data-action="admin-menu-toggle" aria-controls="pictau-admin-drawer" aria-expanded="'+(state.adminMenuOpen?'true':'false')+'" aria-label="'+esc(fr?'Ouvrir le menu administrateur':'Open administrator menu')+'">'+icon("menu")+'<span>'+esc(fr?'Menu':'Menu')+'</span></button>'
    +'<div class="admin-topbar-intro"><span>'+esc(fr?'PICT-AU · GESTION':'PICT-AU · MANAGEMENT')+'</span>'
    +'<strong>'+esc(tabs.find(t=>t[0]===state.adminTab)?.[1]||tabs[0][1])+'</strong></div>'
    +'<div class="admin-topbar-actions"><div class="lang-switch" role="group" aria-label="Language">'
    +'<button type="button" class="lang-btn'+(fr?' active':'')+'" data-action="lang" data-lang="fr" aria-pressed="'+fr+'">FR</button>'
    +'<button type="button" class="lang-btn'+(!fr?' active':'')+'" data-action="lang" data-lang="en" aria-pressed="'+!fr+'">EN</button></div>'
    +googleButton()+'</div></header>'
    +'<main id="admin-main" class="admin-main">'+(state.adminTab==="overview"?renderAdminHome():state.adminTab==="settings"?renderAdminCaptionSettings():renderAdmin())+'</main></div>'
    +'</div>';
}
// BOUTIQUE CLIENT : structure premium noire et blanche, contenus uniquement du vrai compte.
const CLIENT_CATEGORIES=[
  ["alimentation","Alimentation","Food"],["hygiene","Hygiène","Hygiene"],
  ["autonomie","Autonomie","Independence"],["ecole","École","School"],
  ["loisirs","Loisirs","Leisure"],["socialisation","Socialisation","Socialization"],
  ["actions","Actions","Actions"],["consignes","Consignes","Instructions"],
  ["emotions","Émotions","Emotions"],["sensoriel","Sensoriel","Sensory"],
  ["lieux","Lieux","Places"],["transport","Transport","Transport"]
];
function clientNavItems(){
  const fr=state.language==="fr";
  return [
    ["home",fr?"Accueil":"Home","home"],
    ["library",fr?"Bibliothèque":"Library","library"],
    ["files",fr?"Mes créations":"My creations","file-text"],
    ["boards",fr?"Tableaux de communication":"Communication boards","routine"],
    ["search",fr?"Rechercher":"Search","search"],
    ["account",fr?"Mon compte":"My account","settings"]
  ];
}
function renderClientWorkspace(content){
  const fr=state.language==="fr";
  const items=clientNavItems();
  const action=(entry,cls)=>{
    const [page,title,ico]=entry,active=page==="search"?(cls==="pa-client-mobile-link"&&state.page==="library"):(page==="create"?["create","routines","boards"].includes(state.page):state.page===page);
    return '<button type="button" class="'+cls+(active?' active':'')+'" data-action="'+(page==="search"?"client-search":"nav")+'"'
      +(page==="search"?'':' data-page="'+page+'"')+(active?' aria-current="page"':'')
      +'>'+icon(ico)+'<span>'+esc(title)+'</span></button>';
  };
  return '<div class="pa-client-workspace">'
    +'<a class="skip" href="#pa-client-main">'+esc(fr?'Aller au contenu':'Skip to content')+'</a>'
    +'<header class="pa-client-header"><button class="pa-client-brand" type="button" data-action="nav" data-page="home" aria-label="Pict-au, '+esc(fr?'accueil':'home')+'">Pict-<span>a</span>u</button>'
    +'<nav class="pa-client-desktop-nav" aria-label="'+esc(fr?'Navigation de mon espace':'My space navigation')+'">'
    +items.map(x=>action(x,"pa-client-nav-link")).join("")+'</nav>'
    +'<div class="pa-client-tools"><button class="pa-client-header-search" type="button" data-action="client-search" aria-label="'+esc(fr?'Rechercher un pictogramme':'Search pictograms')+'">'+icon("search")+'</button><div class="lang-switch" role="group" aria-label="Language">'
    +'<button class="lang-btn'+(fr?' active':'')+'" data-action="lang" data-lang="fr" aria-pressed="'+fr+'">FR</button>'
    +'<button class="lang-btn'+(!fr?' active':'')+'" data-action="lang" data-lang="en" aria-pressed="'+!fr+'">EN</button></div>'
    +'</div></header>'
    +'<main class="pa-client-main" id="pa-client-main">'
    +((pendingGeneratedPdf&&!["routines","boards"].includes(state.page))?renderPdfRecovery({
      pending:pendingGeneratedPdf,uid:authStatus.user?.id,
      busy:officialComposer.busy||clientFiles.busy,retrying:pdfRecoveryBusy,error:pdfRecoveryError,
      language:state.language,escape:esc,icon}):"")
    +content+'</main>'
    +'<nav class="pa-client-mobile-nav" aria-label="'+esc(fr?'Navigation mobile client':'Client mobile navigation')+'">'
    +[items[0],["search",fr?"Recherche":"Search","search"],["create",fr?"Créer":"Create","plus"],items[2],items[5]].map(x=>action(x,"pa-client-mobile-link")).join("")+'</nav>'
    +(state.toast?'<div class="toast" role="status">'+esc(state.toast)+'</div>':'')+'</div>';
}
function renderClientHome(){
  const fr=state.language==="fr",hasFiles=clientFiles.items.length>0;
  return '<div class="pa-client-home">'
    +'<section class="pa-client-hero" aria-labelledby="client-home-title"><div class="pa-client-hero-copy">'
    +'<span class="pa-client-overline">PICT-AU · '+esc(fr?'VOTRE ESPACE':'YOUR SPACE')+'</span>'
    +'<h1 id="client-home-title">'+esc(fr?'Vos repères visuels, à votre façon.':'Visual support, made for you.')+'</h1>'
    +'<p>'+esc(fr?'Retrouvez vos créations et explorez les catégories de pictogrammes. Un espace clair pour préparer vos supports.':'Find your creations and explore pictogram categories. A simple space for your visual supports.')+'</p>'
    +'<button type="button" class="pa-client-home-search" data-action="client-search">'+icon("search")+'<span>'+esc(fr?'Rechercher un pictogramme':'Search pictograms')+'</span>'+icon("arrow")+'</button>'
    +'<div class="pa-client-hero-actions"><button type="button" class="btn btn-primary" data-action="nav" data-page="create">'+esc(fr?'Créer un support':'Create a visual support')+icon("arrow")+'</button>'
    +'<button type="button" class="btn btn-light" data-action="nav" data-page="library">'+esc(fr?'Explorer les pictogrammes':'Explore pictograms')+'</button>'
    +'<button type="button" class="btn btn-light" data-action="nav" data-page="used">'+esc(fr?'Déjà utilisés':'Previously used')+'</button></div></div>'
    +'<div class="pa-client-hero-aside"><span class="pa-client-hero-icon">'+icon("library")+'</span><strong>'+esc(fr?'Des supports qui vous ressemblent.':'Supports that fit your needs.')+'</strong>'
    +'<span>'+esc(fr?'Dessins et textes alignés, prêts à être imprimés après publication.':'Clear images and captions, once artwork is published.')+'</span></div></section>'
    +'<section class="pa-client-section" aria-labelledby="pa-creations-title"><div class="pa-client-section-head"><div><span class="pa-client-overline">'+esc(fr?'PRIVÉ ET ENREGISTRÉ':'PRIVATE AND SAVED')+'</span>'
    +'<h2 id="pa-creations-title">'+esc(fr?'Mes créations':'My creations')+'</h2></div>'
    +'<button class="pa-client-text-link" type="button" data-action="nav" data-page="files">'+esc(fr?'Tout retrouver':'View all')+icon("arrow")+'</button></div>'
    +(clientFiles.error?'<p role="alert" class="pa-client-context">'+esc(clientFiles.error)+'</p>':'')
    +(clientFiles.message?'<p role="status" class="pa-client-context">'+esc(clientFiles.message)+'</p>':'')
    +renderVerifiedPdfRetry({retry:clientFiles.reprintRetry,uid:authStatus.user?.id,language:state.language,escape:esc})
    +(clientFiles.loading?'<p role="status" class="pa-client-empty-text">'+esc(fr?'Chargement de vos fichiers…':'Loading your files…')+'</p>':
       hasFiles?'<div class="pa-client-creation-list">'+clientFiles.items.slice(0,3).map(doc=>
        '<article class="pa-client-creation">'
        +icon("file-text")+'<div class="pa-client-creation-info"><strong>'+esc(doc.title||"PDF")+'</strong>'
        +'<small>'+esc(fr?'PDF original enregistré dans votre compte':'Original PDF saved in your account')+'</small></div>'
        +'<div class="pa-client-creation-actions"><button type="button" data-action="files-preview" data-id="'+esc(doc.id)+'"'
        +(clientFiles.busy?' disabled':'')+'>'+icon("search")+esc(fr?'Aperçu':'Preview')+'</button>'
        +'<button type="button" class="pa-client-creation-reprint" data-action="files-reprint" data-id="'+esc(doc.id)+'"'
        +(clientFiles.busy?' disabled':'')+'>'+icon("print")+esc(fr?'Réimprimer':'Reprint')+'</button>'
        +(doc.source_draft_id?'<button type="button" data-action="files-edit-source" data-id="'+esc(doc.id)+'"'
          +(clientFiles.busy?' disabled':'')+'>'+icon("edit")+esc(fr?'Modifier la source':'Edit source')+'</button>':'')
        +'</div></article>'
        ).join("")+'</div>':
        '<div class="pa-client-empty"><div>'+icon("file-text")+'<h3>'+esc(fr?'Aucune création enregistrée':'No saved creations yet')+'</h3><p>'+esc(fr?'Vos PDF apparaîtront ici dès leur enregistrement dans votre compte.':'Your PDFs will appear here when saved to your account.')+'</p></div>'
        +'<button class="btn btn-light" type="button" data-action="nav" data-page="files">'+esc(fr?'Ouvrir Mes créations':'Open My creations')+'</button></div>')
    +'</section>'
    +'<section class="pa-client-section" aria-labelledby="pa-categories-title"><div class="pa-client-section-head"><div><span class="pa-client-overline">'+esc(fr?'PARCOURIR':'BROWSE')+'</span>'
    +'<h2 id="pa-categories-title">'+esc(fr?'Catégories':'Categories')+'</h2></div><span class="pa-client-section-meta">'+esc(fr?'Pictogrammes en préparation':'Artwork in preparation')+'</span></div>'
    +'<div class="pa-client-categories">'+CLIENT_CATEGORIES.map(([key,frName,enName])=>
       '<button type="button" class="pa-client-category" data-action="client-category" data-category="'+esc(key)+'">'
       +'<span>'+esc(fr?frName:enName)+'</span>'+icon("arrow")+'</button>').join("")+'</div>'
    +'<p class="pa-client-context">'+esc(fr?'Aucune illustration fictive : les vrais pictogrammes apparaîtront ici après leur approbation.':'No placeholder illustrations: approved artwork will appear here once published.')+'</p>'
    +'</section></div>';
}
function renderClientLibrary(){
  const fr=state.language==="fr",f=publishedCatalog,c=CLIENT_CATEGORIES.find(x=>x[0]===state.clientCategory);
  const first=f.total?f.page*CATALOG_PAGE_SIZE+1:0;
  const last=Math.min(f.total,(f.page+1)*CATALOG_PAGE_SIZE);
  const pages=Math.max(1,Math.ceil(f.total/CATALOG_PAGE_SIZE));
  const cards=f.items.map(item=>{
    const name=fr?item.title_fr:(item.title_en||item.title_fr);
    const url=f.imageUrls.get(item.id);
    return '<article class="pa-catalog-card"><div class="pa-catalog-art">'
      +'<div class="pa-catalog-art-body"><img data-catalog-id="'+esc(item.id)+'"'
      +(url?' src="'+esc(url)+'"':'')+' alt="" loading="lazy" decoding="async"></div>'
      +'<div class="pa-catalog-art-caption">'+esc(name)+'</div></div>'
      +'<p class="pa-catalog-card-label">'+esc(name)+'</p><span class="pa-catalog-card-category">'+esc(
        CLIENT_CATEGORIES.find(x=>x[0]===item.theme)?.[fr?1:2]||item.theme
      )+'</span><div class="pa-catalog-add">'
      +'<button type="button" data-action="approved-add" data-kind="routine" data-id="'+esc(item.id)+'"'+(singleApprovedAdd.busy||officialComposer.routine.length>=10?' disabled':'')+'>'+icon("plus")+esc(fr?'Routine':'Routine')+'</button>'
      +'<button type="button" data-action="approved-add" data-kind="board" data-id="'+esc(item.id)+'"'+(singleApprovedAdd.busy||officialComposer.board.length>=16?' disabled':'')+'>'+icon("plus")+esc(fr?'Tableau':'Board')+'</button></div></article>';
  }).join("");
  const feedback=f.loading?'<p class="pa-catalog-notice" role="status">'+esc(fr?'Chargement de la bibliothèque officielle…':'Loading official library…')+'</p>':
    f.error?'<div class="pa-catalog-notice" role="alert"><p>'+esc(fr?'La bibliothèque est momentanément indisponible.':'The library is temporarily unavailable.')+'</p>'
      +'<button class="btn btn-light" data-action="catalog-refresh">'+esc(fr?'Réessayer':'Retry')+'</button></div>':
    !f.items.length?'<div class="pa-client-empty pa-client-catalog-empty">'+icon("library")+'<div><h2>'
      +esc(fr?'Aucun pictogramme approuvé pour ces critères':'No approved pictograms for this selection')+'</h2>'
      +'<p>'+esc(fr?'Seules les images réellement validées par le Super Admin apparaissent ici. Aucun brouillon ni dessin d’essai.':'Only artwork reviewed by the Super Admin appears here. No drafts or sample illustrations.')+'</p>'
      +(c?'<p>'+esc(fr?'Catégorie : ':'Category: ')+esc(fr?c[1]:c[2])+'</p>':'')+'</div></div>':
    '<div class="pa-catalog-grid">'+cards+'</div>'
      +(pages>1?'<nav class="pa-catalog-pages" aria-label="'+esc(fr?'Pages des pictogrammes':'Pictogram pages')+'">'
        +'<button type="button" class="btn btn-light" data-action="catalog-page" data-direction="-1"'+(f.page===0?' disabled':'')+'>'+esc(fr?'Précédent':'Previous')+'</button>'
        +'<span>'+first+'–'+last+' / '+f.total+'</span>'
        +'<button type="button" class="btn btn-light" data-action="catalog-page" data-direction="1"'+(f.page>=pages-1?' disabled':'')+'>'+esc(fr?'Suivant':'Next')+'</button></nav>':'');
  return '<section class="pa-client-catalog" aria-labelledby="pa-catalog-title">'
    +'<div class="pa-client-section-head"><div><span class="pa-client-overline">'+esc(fr?'BIBLIOTHÈQUE':'LIBRARY')+'</span>'
    +'<h1 id="pa-catalog-title">'+esc(fr?'Explorer les pictogrammes':'Explore pictograms')+'</h1></div>'
    +(f.loaded?'<span class="pa-client-section-meta">'+f.total+' '+esc(fr?'résultats approuvés':'approved results')+'</span>':'')+'</div>'
    +'<div class="pa-client-discovery-actions">'
    +'<button type="button" class="btn btn-light pa-used-discovery" data-action="nav" data-page="used">'+esc(fr?"Mes pictogrammes utilisés":"My used pictograms")+'</button>'
    +'<button type="button" class="btn btn-light pa-request-discovery" data-action="request-open" aria-expanded="'+(customerRequests.view!=="closed")+'" aria-label="'+esc(fr?"Ouvrir une demande de pictogramme":"Open pictogram request")+'">'+icon("plus","btn-icon")+esc(fr?"Demander un pictogramme":"Request a pictogram")+'</button></div>'
    +'<form data-form="catalog-filter" class="pa-client-search-wrap" role="search">'
    +'<label for="pa-client-search">'+esc(fr?'Rechercher un pictogramme':'Search pictograms')+'</label>'
    +'<div class="pa-client-search-field">'+icon("search")+'<input type="search" id="pa-client-search" data-input="client-search" maxlength="80"'
    +' value="'+esc(state.search)+'" placeholder="'+esc(fr?'Ex. : toilette, manger, école…':'E.g. bathroom, eat, school…')+'">'
    +'<button class="pa-catalog-search-button" type="submit">'+esc(fr?'Rechercher':'Search')+'</button></div></form>'
    +(officialComposer.routine.length||officialComposer.board.length?
       '<div class="pa-composer-toolbar"><strong>'+esc(fr?'Votre sélection':'Your selection')+'</strong>'
       +'<button data-action="nav" data-page="routines" type="button">'+esc(fr?'Routine':'Routine')+' · '+officialComposer.routine.length+'</button>'
       +'<button data-action="nav" data-page="boards" type="button">'+esc(fr?'Tableau':'Board')+' · '+officialComposer.board.length+'</button></div>':'')
     +renderSingleApprovedAddFeedback("library")
    +'<div class="pa-client-category-filters" role="group" aria-label="'+esc(fr?'Filtrer par catégorie':'Filter by category')+'">'
    +'<button type="button" class="'+(!state.clientCategory?'active':'')+'" data-action="client-category" data-category="" aria-pressed="'+(!state.clientCategory)+'">'+esc(fr?'Toutes':'All')+'</button>'
    +CLIENT_CATEGORIES.map(([key,frName,enName])=>'<button type="button" class="'+(state.clientCategory===key?'active':'')+'" data-action="client-category" data-category="'+esc(key)+'" aria-pressed="'+(state.clientCategory===key)+'">'
      +esc(fr?frName:enName)+'</button>').join("")+'</div>'+feedback+'</section>'
    +(customerRequests.view!=="closed"?renderCustomerRequestCenter():"");
}
function renderClientUsed(){
  const fr=state.language==="fr",u=usedPictos;
  const selectedChoices=selectedUsedChoices(u.selected);
  const selectedReview=selectedChoices.length?
    '<section class="pa-used-selection-review" aria-labelledby="pa-used-selection-title">'
      +'<div class="pa-used-selection-heading"><h2 id="pa-used-selection-title">'
      +esc(fr?'Ma sélection':'My selection')+'</h2><span aria-live="polite">'
      +selectedChoices.length+' / 16</span></div>'
      +'<p class="pa-client-context">'+esc(fr?
        "Vos choix restent visibles même après une recherche ou un changement de page. Retirez une image sans effacer les autres.":
        "Your choices remain visible after filtering or changing pages. Remove one without clearing the others.")+'</p>'
      +'<ul class="pa-used-selection-list">'+selectedChoices.map(item=>{
        const name=fr?item.title_fr:(item.title_en||item.title_fr);
        return '<li><button type="button" data-action="used-remove-choice" data-id="'+esc(item.id)+'"'
          +' aria-label="'+esc(fr?'Retirer '+name+' de ma sélection':'Remove '+name+' from my selection')+'">'
          +'<span>'+esc(name)+'</span>'+icon("x")+'</button></li>';
      }).join("")+'</ul></section>':"";
  const pages=Math.max(1,Math.ceil(u.total/USED_PAGE_SIZE));
  const usedCards=u.items.map(entry=>{
    const item=approvedFromUsage(entry);
    if(!item)return '<article class="pa-catalog-card pa-used-unavailable">'
      +'<div class="pa-client-empty">'+icon("info")+'<p>'+esc(fr?"Pictogramme retiré du catalogue":"Pictogram removed from catalogue")+'</p></div>'
      +'<p>'+esc(fr?"Ancienne utilisation conservée; nouvelle impression indisponible.":"Previous use saved; new printing unavailable.")+'</p></article>';
    const title=fr?item.title_fr:(item.title_en||item.title_fr),url=publishedCatalog.imageUrls.get(item.id);
    const picked=u.selected.has(item.id);
    return '<article class="pa-catalog-card'+(picked?' pa-used-picked':'')+'"><div class="pa-catalog-art"><div class="pa-catalog-art-body">'
      +'<img data-catalog-id="'+esc(item.id)+'"'+(url?' src="'+esc(url)+'"':'')+' alt="" loading="lazy" decoding="async"></div>'
      +'<div class="pa-catalog-art-caption">'+esc(title)+'</div></div>'
      +'<p class="pa-catalog-card-label">'+esc(title)+'</p><span class="pa-catalog-card-category">'+esc(
        CLIENT_CATEGORIES.find(x=>x[0]===item.theme)?.[fr?1:2]||item.theme
      )+'</span><button type="button" class="pa-used-choice" data-action="used-toggle" data-id="'+esc(item.id)+'"'
      +(u.adding||singleApprovedAdd.busy?' disabled':'')+' aria-pressed="'+(picked?'true':'false')+'" aria-label="'+esc(
        picked?(fr?'Retirer '+title+' de la sélection':'Remove '+title+' from selection'):
          (fr?'Sélectionner '+title:'Select '+title))+'">'
      +icon(picked?'check':'plus')+esc(picked?(fr?'Sélectionné':'Selected'):(fr?'Sélectionner':'Select'))+'</button><div class="pa-catalog-add">'
      +'<button type="button" data-action="approved-add" data-kind="routine" data-id="'+esc(item.id)+'"'
      +(singleApprovedAdd.busy||u.adding||officialComposer.routine.length>=10?' disabled':'')+'>'+icon("plus")+esc(fr?"Routine":"Routine")+'</button>'
      +'<button type="button" data-action="approved-add" data-kind="board" data-id="'+esc(item.id)+'"'
      +(singleApprovedAdd.busy||u.adding||officialComposer.board.length>=16?' disabled':'')+'>'+icon("plus")+esc(fr?"Tableau":"Board")+'</button></div></article>';
  }).join("");
  return '<section class="pa-client-catalog pa-used-pictos" aria-labelledby="pa-used-title">'
    +'<span class="pa-client-overline">'+esc(fr?"VOTRE BIBLIOTHÈQUE PERSONNELLE":"YOUR PERSONAL LIBRARY")+'</span>'
    +'<h1 id="pa-used-title">'+esc(fr?"Mes pictogrammes utilisés":"My used pictograms")+'</h1>'
    +'<p class="pa-client-context">'+esc(fr?
      "Retrouvez les images de vos routines et tableaux enregistrés. Choisissez-en plusieurs pour composer une nouvelle impression, sans retrouver un ancien PDF.":
      "Reuse images from saved routines and boards to create a new printable document without reopening an old PDF.")+'</p>'
    +'<form data-form="used-filter" class="pa-used-filters">'
    +'<div class="control"><label for="pa-used-search">'+esc(fr?"Rechercher":"Search")+'</label>'
    +'<input id="pa-used-search" name="query" maxlength="80" value="'+esc(u.query)+'" placeholder="'+esc(fr?"Nom du pictogramme":"Pictogram name")+'"></div>'
    +'<div class="control"><label for="pa-used-sort">'+esc(fr?"Trier par":"Sort by")+'</label>'
    +'<select id="pa-used-sort" name="sort"><option value="recent"'+(u.sort==="recent"?' selected':'')+'>'+esc(fr?"Récemment utilisés":"Recently used")+'</option>'
    +'<option value="name"'+(u.sort==="name"?' selected':'')+'>'+esc(fr?"Nom A à Z":"Name A to Z")+'</option></select></div>'
    +'<div class="control"><label for="pa-used-theme">'+esc(fr?"Catégorie":"Category")+'</label>'
    +'<select id="pa-used-theme" name="theme"><option value="all">'+esc(fr?"Toutes":"All")+'</option>'
    +CLIENT_CATEGORIES.map(([key,frName,enName])=>'<option value="'+esc(key)+'"'+(u.theme===key?' selected':'')+'>'+esc(fr?frName:enName)+'</option>').join("")+'</select></div>'
    +'<button type="submit" class="btn btn-primary"'+(u.loading?' disabled':'')+'>'+esc(fr?"Filtrer":"Filter")+'</button></form>'
    +selectedReview
    +renderSingleApprovedAddFeedback("used")
    +(!u.loading&&!u.error&&(u.selected.size||u.items.some(row=>approvedFromUsage(row)))?
      '<div class="pa-composer-toolbar pa-used-bulk-toolbar"><strong aria-live="polite">'+esc(u.selected.size?
        (fr?u.selected.size+(u.selected.size===1?' pictogramme sélectionné':' pictogrammes sélectionnés'):
          u.selected.size+(u.selected.size===1?' pictogram selected':' pictograms selected')):
        (fr?'Ajouter les images affichées':'Add visible pictograms'))+'</strong>'
      +'<button type="button" data-action="used-add-page" data-kind="routine"'
      +(u.adding||singleApprovedAdd.busy||officialComposer.routine.length>=10||officialComposer.busy||editableDrafts.deletingKind||editableDrafts.copyKind?' disabled':'')
      +'>'+icon("plus")+esc(fr?(u.selected.size?"Ajouter mes choix à la routine":"À ma routine (max. 10)"):
        (u.selected.size?"Add my picks to routine":"To my routine (max 10)"))+'</button>'
      +'<button type="button" data-action="used-add-page" data-kind="board"'
      +(u.adding||singleApprovedAdd.busy||officialComposer.board.length>=16||officialComposer.busy||editableDrafts.deletingKind||editableDrafts.copyKind?' disabled':'')
      +'>'+icon("plus")+esc(fr?(u.selected.size?"Ajouter mes choix au tableau":"À mon tableau (max. 16)"):
        (u.selected.size?"Add my picks to board":"To my board (max 16)"))+'</button>'
      +(u.selected.size?'<button type="button" data-action="used-clear"'+(u.adding?' disabled':'')+'>'+esc(fr?'Effacer la sélection':'Clear selection')+'</button>':'')
      +'</div>':'')
    +(u.notice?'<p role="status" aria-live="polite" class="pa-catalog-notice">'+esc(u.notice)+'</p>':'')
    +(officialComposer.routine.length||officialComposer.board.length?
      '<div class="pa-composer-toolbar"><strong>'+esc(fr?"Votre sélection":"Your selection")+'</strong>'
      +'<button type="button" data-action="nav" data-page="routines">'+esc(fr?"Routine":"Routine")+' · '+officialComposer.routine.length+'</button>'
      +'<button type="button" data-action="nav" data-page="boards">'+esc(fr?"Tableau":"Board")+' · '+officialComposer.board.length+'</button></div>':'')
    +(u.loading?'<p role="status" class="pa-catalog-notice">'+esc(fr?"Chargement de vos pictogrammes…":"Loading used pictograms…")+'</p>':
      u.error?'<div role="alert" class="pa-catalog-notice"><p>'+esc(u.error)+'</p>'
         +'<button type="button" class="btn btn-light" data-action="used-refresh">'+esc(fr?"Réessayer":"Retry")+'</button></div>':
      !u.items.length?'<div class="pa-client-empty"><p>'+esc(fr?
        "Aucun pictogramme utilisé enregistré pour ces critères. Enregistrez une routine ou un tableau pour commencer. Les anciens PDF seuls ne permettent pas de retrouver automatiquement leurs images.":
        "No saved pictogram uses match. Save a routine or board to start. Old PDFs alone cannot restore their image list.")+'</p></div>':
      '<div class="pa-catalog-grid">'+usedCards+'</div>'
      +(pages>1?'<nav class="pa-catalog-pages" aria-label="'+esc(fr?"Pages":"Pages")+'">'
        +'<button type="button" data-action="used-page" data-direction="-1"'+(!u.page?' disabled':'')+'>'+esc(fr?"Précédent":"Previous")+'</button>'
        +'<span role="status" aria-live="polite">'+(u.page*USED_PAGE_SIZE+1)+'–'+Math.min(u.total,(u.page+1)*USED_PAGE_SIZE)+' / '+u.total+'</span>'
        +'<button type="button" data-action="used-page" data-direction="1"'+(u.page>=pages-1?' disabled':'')+'>'+esc(fr?"Suivant":"Next")+'</button></nav>':''))
    +'</section>';
}
function renderClientCreate(){
  const fr=state.language==="fr";
  const items=[
    ["routines",fr?"Routine visuelle":"Visual routine",fr?"Séquence d’étapes à imprimer":"Printable step-by-step sequence"],
    ["boards",fr?"Tableau de communication":"Communication board",fr?"Cases organisées pour communiquer":"Organized communication cells"]
  ];
  return '<section class="pa-client-catalog pa-client-create"><span class="pa-client-overline">'+esc(fr?'CRÉATION':'CREATE')+'</span>'
   +'<h1>'+esc(fr?'Quel support souhaitez-vous préparer ?':'What would you like to create?')+'</h1>'
   +'<p class="pa-client-context">'+esc(fr?'Choisissez un format. Les étapes utilisant des images nécessitent des pictogrammes officiels publiés.':'Choose a format. Image-based steps require published official pictograms.')+'</p>'
   +'<div class="pa-client-create-grid">'+items.map(([page,title,copy])=>'<button type="button" data-action="nav" data-page="'+page+'" class="pa-client-create-card">'
   +icon(page==="routines"?"routine":"library")+'<strong>'+esc(title)+'</strong><span>'+esc(copy)+'</span>'+icon("arrow")+'</button>').join("")+'</div>'
   +'<p class="pa-client-context">'+esc(fr?'Vous possédez déjà un PDF ? Enregistrez-le dans Mes créations pour le retrouver et le réimprimer.':'Already have a PDF? Save it in My creations to find and reprint it later.')+'</p>'
   +'<button type="button" class="btn btn-light" data-action="nav" data-page="files">'+esc(fr?'Ouvrir Mes créations':'Open My creations')+'</button>'
   +'<section class="pa-editable-drafts" aria-labelledby="pa-editable-drafts-title">'
   +'<div class="pa-client-section-head"><div><span class="pa-client-overline">'+esc(fr?'ENREGISTRÉS DANS VOTRE COMPTE':'SAVED TO YOUR ACCOUNT')+'</span>'
   +'<h2 id="pa-editable-drafts-title">'+esc(fr?'Mes brouillons':'My drafts')+'</h2></div>'
   +'<button type="button" class="btn btn-light" data-action="draft-refresh"'+(editableDrafts.loading||editableDrafts.busy?' disabled':'')+'>'+esc(fr?'Actualiser':'Refresh')+'</button></div>'
   +(editableDrafts.loading?'<p role="status">'+esc(fr?'Chargement des brouillons…':'Loading drafts…')+'</p>':
     editableDrafts.error?'<p role="alert">'+esc(editableDrafts.error)+'</p>':
     !editableDrafts.items.length?'<p class="pa-client-context">'+esc(fr?'Aucun brouillon sauvegardé. Créez une routine ou un tableau, puis choisissez « Enregistrer le brouillon ».':'No drafts saved. Create a routine or board, then choose Save editable draft.')+'</p>':
     '<ul class="pa-drafts-list">'+editableDrafts.items.map(doc=>'<li class="pa-drafts-row"><div><strong>'+esc(doc.title)+'</strong>'
       +'<small>'+esc(doc.kind==="routine"?(fr?'Routine':'Routine'):(fr?'Tableau':'Board'))+' · '+esc(fr?'Version ':'Version ')+doc.revision+'</small></div>'
       +'<div class="pa-drafts-actions"><button type="button" data-action="draft-open" data-id="'+esc(doc.id)+'"'+(editableDrafts.busy?' disabled':'')+'>'+esc(fr?'Modifier':'Edit')+'</button>'
       +'<button type="button" data-action="draft-delete" data-id="'+esc(doc.id)+'"'+(editableDrafts.busy?' disabled':'')+'>'+esc(fr?'Supprimer':'Delete')+'</button></div></li>').join("")+'</ul>')
   +(editableDrafts.loaded&&editableDrafts.total>MAX_EDITABLE_DRAFTS?'<nav class="pa-drafts-pages" aria-label="'+esc(fr?'Pages de Mes brouillons':'My drafts pages')+'">'
     +'<button class="btn btn-light" type="button" data-action="draft-page" data-direction="-1"'+(editableDrafts.page===0||editableDrafts.loading||editableDrafts.busy?' disabled':'')+'>'+esc(fr?'Précédent':'Previous')+'</button>'
     +'<span role="status">'+esc(fr?'Page ':'Page ')+(editableDrafts.page+1)+' / '+Math.ceil(editableDrafts.total/MAX_EDITABLE_DRAFTS)+' · '+editableDrafts.total+' '+esc(fr?'brouillons':'drafts')+'</span>'
     +'<button class="btn btn-light" type="button" data-action="draft-page" data-direction="1"'+(editableDrafts.page>=Math.ceil(editableDrafts.total/MAX_EDITABLE_DRAFTS)-1||editableDrafts.loading||editableDrafts.busy?' disabled':'')+'>'+esc(fr?'Suivant':'Next')+'</button></nav>':'')
   +(editableDrafts.message?'<p role="status">'+esc(editableDrafts.message)+'</p>':'')
   +'</section></section>';
}
function renderClientAccount(){
  const fr=state.language==="fr";
  return '<section class="pa-client-account" aria-labelledby="pa-account-title"><span class="pa-client-overline">'+esc(fr?'MON COMPTE':'MY ACCOUNT')+'</span>'
   +'<h1 id="pa-account-title">'+esc(fr?'Informations du compte':'Account information')+'</h1>'
   +'<div class="pa-client-account-card"><span>'+esc(fr?'Courriel de connexion':'Account email')+'</span>'
   +'<strong>'+esc(authStatus.user?.email||"—")+'</strong>'
   +'<button type="button" class="btn btn-primary" data-action="google-logout">'+esc(fr?'Se déconnecter':'Sign out')+'</button></div>'
   +'<p class="pa-client-context">'+esc(fr?'Vos créations enregistrées sont associées à votre compte et non à cet appareil.':'Saved creations are tied to your account, not this device.')+'</p>'
   +'</section>';
}
function renderNewPassword(){
  const fr=state.language==="fr";
  return '<section class="hosted-access"><div class="hosted-access-main"><div class="hosted-access-panel">'
   +'<span class="hosted-access-eyebrow">PICT-AU · '+esc(fr?'SÉCURITÉ':'SECURITY')+'</span>'
   +'<h1>'+esc(fr?'Choisir un nouveau mot de passe':'Choose a new password')+'</h1>'
   +'<p>'+esc(fr?'Votre lien de récupération a été reconnu. Choisissez un nouveau mot de passe.':'Your recovery link was recognized. Choose a new password.')+'</p>'
   +'<form data-form="email-update-password"><label for="new-password">'+esc(fr?'Nouveau mot de passe':'New password')+'</label>'
   +'<input id="new-password" type="password" name="password" autocomplete="new-password" required minlength="8" maxlength="128">'
   +'<button class="btn btn-primary" type="submit"'+(authStatus.emailBusy?' disabled':'')+'>'+esc(fr?'Enregistrer mon mot de passe':'Save my password')+'</button></form>'
   +(authStatus.emailError?'<p role="alert" class="hosted-access-error">'+esc(authStatus.emailError)+'</p>':'')
   +'</div></div></section>';
}
function renderHostedAccess(){
  const fr=state.language==="fr";
  const wait=!authStatus.ready;
  return '<section class="hosted-access" aria-labelledby="hosted-access-title">'
   +'<header class="hosted-access-header"><a class="hosted-access-brand" href="../index.html">'+brand()+'</a>'
   +'<div class="lang-switch" role="group" aria-label="Language">'
   +'<button type="button" class="lang-btn'+(fr?' active':'')+'" data-action="lang" data-lang="fr" aria-pressed="'+fr+'">FR</button>'
   +'<button type="button" class="lang-btn'+(!fr?' active':'')+'" data-action="lang" data-lang="en" aria-pressed="'+!fr+'">EN</button></div></header>'
   +'<main class="hosted-access-main"><div class="hosted-access-panel">'
   +'<span class="hosted-access-eyebrow">'+esc(fr?'ESPACE PICT-AU':'YOUR PICT-AU SPACE')+'</span>'
   +'<h1 id="hosted-access-title">'+esc(fr?'Accéder à mon espace':'Access my space')+'</h1>'
   +'<p>'+esc(fr?'Connectez-vous pour retrouver vos fichiers et vos demandes. Aucune démonstration n’est ajoutée à votre compte.':'Sign in to access your files and requests. No sample content is added to your account.')+'</p>'
   +(wait?'<p class="hosted-access-status" role="status">'+esc(fr?'Vérification de la session…':'Checking your session…')+'</p>':'')
   +'<div class="hosted-access-action">'+googleButton()+'</div>'
   +(authStatus.error?'<p role="alert" class="hosted-access-error">'+esc(authStatus.error)+'</p>':'')
   +'<a href="../index.html" class="hosted-access-back">'+esc(fr?'← Retour à l’accueil Pict-au':'← Back to Pict-au home')+'</a>'
   +'</div></main></section>';
}
function renderHostedEmpty(){
  const fr=state.language==="fr";
  const library=state.page==="library";
  const title=library?(fr?'Aucun pictogramme publié pour le moment':'No published pictograms yet')
    :(state.page==="routines"?(fr?'Mes routines':'My routines'):(fr?'Mes tableaux':'My boards'));
  const message=library?
    (fr?'La bibliothèque de votre compte sera alimentée uniquement avec les vrais pictogrammes approuvés. Les images d’essai ne sont pas des pictogrammes publiés.':'Only approved pictograms will appear in your library. Test illustrations are not published pictograms.'):
    (fr?'Aucun support n’est préchargé dans votre compte. La composition sera disponible lorsque les pictogrammes officiels seront publiés. Vos documents déjà sauvegardés restent accessibles dans Mes fichiers.':'Your account has no preloaded materials. You can create supports once official pictograms are published. Previously saved documents remain available in My files.');
  return '<section class="hosted-library-empty" aria-labelledby="hosted-library-title">'
    +'<span class="hosted-access-eyebrow">'+esc(fr?'MON ESPACE PICT-AU':'MY PICT-AU SPACE')+'</span>'
    +'<h1 id="hosted-library-title">'+esc(title)+'</h1><p>'+esc(message)+'</p>'
    +'<button type="button" class="btn btn-primary" data-action="nav" data-page="files">'+icon("file-text","btn-icon")+esc(fr?'Ouvrir Mes fichiers':'Open My files')+'</button>'
    +'</section>'+(library?renderCustomerRequestCenter():'');
}
function render(){
  if(!canOpenAdmin() && state.page==="admin")state.page="library";
  document.documentElement.lang=state.language;
  const clientTitles={used:["Mes pictogrammes utilisés","My used pictograms"],
    create:["Créer un support","Create a visual support"],account:["Mon compte","My account"]};
  const clientTitle=clientTitles[state.page];
  document.title="Pict-au — "+(state.page==="home"?(state.language==="fr"?"Accueil":"Home"):
    clientTitle?clientTitle[state.language==="fr"?0:1]:
    T(state.page==="library"?"library":state.page==="routines"?"routines":state.page==="boards"?"boards":state.page==="files"?"files":"admin"));
  root.innerHTML=SITE_EMBEDDED?(authStatus.recovery&&authStatus.user?renderNewPassword():!authStatus.user?renderHostedAccess():!authStatus.roleReady?renderRoleChecking():canOpenAdmin()?renderAdminWorkspace():renderClientWorkspace(state.page==="files"?renderClientFiles({language:state.language,logged:true,files:clientFiles,uid:authStatus.user?.id,
    pendingPdf:Boolean(authStatus.user&&pendingGeneratedPdf?.uid===authStatus.user.id),escape:esc,icon}):state.page==="library"?renderClientLibrary():state.page==="create"?renderClientCreate():state.page==="used"?renderClientUsed():state.page==="account"?renderClientAccount():state.page==="routines"||state.page==="boards"?renderOfficialComposer({
     kind:state.page==="routines"?"routine":"board",
     items:officialComposer[state.page==="routines"?"routine":"board"],
     language:state.language,imageUrls:publishedCatalog.imageUrls,
     settings:officialComposer.settings[state.page==="routines"?"routine":"board"],
     busy:officialComposer.busy||editableDrafts.deletingKind===(state.page==="routines"?"routine":"board")||editableDrafts.copyKind===(state.page==="routines"?"routine":"board"),error:officialComposer.error,
     draftBusy:editableDrafts.busy,draftDirty:editableDrafts.dirty[state.page==="routines"?"routine":"board"],
     draftSaved:Boolean(editableDrafts.current[state.page==="routines"?"routine":"board"]),
     draftConflict:draftAutosave.status(state.page==="routines"?"routine":"board").conflict,
     draftStatus:draftAutosaveLabel(state.page==="routines"?"routine":"board",
       draftAutosave.status(state.page==="routines"?"routine":"board")),
     allowCaptionEdit:captionFeature.loaded&&captionFeature.enabled,
     pending:renderPdfRecovery({pending:pendingGeneratedPdf,uid:authStatus.user.id,busy:officialComposer.busy||clientFiles.busy,
        retrying:pdfRecoveryBusy,error:pdfRecoveryError,language:state.language,escape:esc,icon}),
     escape:esc,icon
    }):renderClientHome())):state.page==="home"?renderLanding({lang:state.language,samples,icon,escape:esc,authHtml:googleButton()}):shell(state.page==="routines"?renderRoutine():state.page==="boards"?renderBoard():state.page==="files"?renderClientFiles({language:state.language,logged:Boolean(authStatus.user),files:clientFiles,uid:authStatus.user?.id,
    pendingPdf:Boolean(authStatus.user&&pendingGeneratedPdf?.uid===authStatus.user.id),escape:esc,icon}):state.page==="admin"?renderAdmin():renderLibrary());
  layoutArtwork(root);
  updateArtFeedback();
  observeBankThumbnails();
  observePublishedArtwork();
}
// La fermeture ne garantit jamais l'achèvement d'une requête réseau.
window.addEventListener("beforeunload",event=>{
  if(!SITE_EMBEDDED||!authStatus.user||canOpenAdmin()||
     !(editableDrafts.dirty.routine||editableDrafts.dirty.board))return;
  event.preventDefault();
  event.returnValue="";
});
document.addEventListener("visibilitychange",()=>{
  if(!document.hidden||!SITE_EMBEDDED||!authStatus.user||canOpenAdmin()||officialComposer.busy)return;
  for(const kind of ["routine","board"]){
    const status=draftAutosave.status(kind);
    if(status.dirty&&!status.blocked&&!status.busy)void draftAutosave.flush(kind);
  }
});
let artworkResizeFrame=0;
window.addEventListener("resize",()=>{
  if(artworkResizeFrame)cancelAnimationFrame(artworkResizeFrame);
  artworkResizeFrame=requestAnimationFrame(()=>{
    artworkResizeFrame=0;layoutArtwork(root);updateArtFeedback();
  });
});
window.addEventListener("pagehide",clearPdfReprintRetry);
window.addEventListener("beforeprint",()=>{layoutArtwork(root);updateArtFeedback();});
window.addEventListener("afterprint",()=>{layoutArtwork(root);updateArtFeedback();});
function syncRoutine(){store("pictau-routine",state.routine);}
function notify(message){state.toast=message;render();}
function safeFocusSearch(){
  const el=document.querySelector("#search");if(el){el.focus();const length=el.value.length;el.setSelectionRange(length,length);}
}
function safeFocusAdminSearch(){
  const el=document.querySelector("#admin-bank-search");
  if(el){el.focus();const pos=el.value.length;el.setSelectionRange(pos,pos);}
}
function updateArtFeedback(){
  const out=document.querySelector("#admin-art-feedback");
  if(!out)return;
  const picto=document.querySelector("#admin-stage .picto");
  const bad=picto?.dataset.artCollision==="true";
  out.hidden=!bad;
  out.textContent=bad?(state.language==="fr"
    ?"Attention : le dessin entre dans la bande de texte avec ce centrage. La composition ne doit pas être publiée ou imprimée ainsi."
    :"Warning: artwork enters the label band with this centering. Do not publish or print this composition."):"";
}
function adminLive(){
  const stage=document.querySelector("#admin-stage");
  if(stage){stage.innerHTML=adminPreview();layoutArtwork(stage);updateArtFeedback();}
}
function routineLive(){
  const stage=document.querySelector("#routine-stage");
  if(stage&&state.routine.length){stage.innerHTML=routineStrip(selectedItems());layoutArtwork(stage);}
  const output=document.querySelector("#size-value");
  if(output)output.textContent=fmt(state.widthCm)+" cm";
}
// Une image Blob doit terminer son décodage avant la mesure géométrique.
root.addEventListener("load",function(event){
  if(event.target?.matches?.("img[data-pictau-ink]")){
    layoutArtwork(root);updateArtFeedback();
  }
},true);
// Fenêtre modale d'aperçu : Escape ferme et Tab reste dans le dialogue.
root.addEventListener("keydown",function(event){
  if(event.key==="Escape"&&state.adminMenuOpen&&SITE_EMBEDDED){
    event.preventDefault();state.adminMenuOpen=false;render();root.querySelector("#admin-menu-toggle")?.focus();return;
  }
  if(!clientFiles.preview||state.page!=="files")return;
  const dialog=root.querySelector(".files-preview-modal");
  if(!dialog)return;
  if(event.key==="Escape"){
    event.preventDefault();
    const id=clientFiles.preview.id;clearClientPreview();render();
    root.querySelector('[data-action="files-preview"][data-id="'+id+'"]')?.focus();
    return;
  }
  if((event.key==="ArrowRight"||event.key==="ArrowLeft")&&clientFiles.preview.pages?.length>1){
    const direction=event.key==="ArrowRight"?1:-1;
    if(selectClientPreviewPage(clientFiles.preview.pageIndex+direction)){
      event.preventDefault();
      const pageButton=event.key==="ArrowRight"?"files-preview-next":"files-preview-previous";
      render();
      root.querySelector('[data-action="'+pageButton+'"]')?.focus();
    }
    return;
  }
  if(event.key!=="Tab")return;
  const controls=[...dialog.querySelectorAll('button:not([disabled]),a[href],input:not([disabled])')];
  if(!controls.length)return;
  const first=controls[0],last=controls.at(-1);
  if(event.shiftKey&&document.activeElement===first){
    event.preventDefault();last.focus();
  }else if(!event.shiftKey&&document.activeElement===last){
    event.preventDefault();first.focus();
  }
});
// Fallback robuste pour clavier virtuel iOS/Android même sans :has() CSS.
root.addEventListener("focusin",function(event){
  if(event.target?.id==="pa-client-search")
    root.querySelector(".pa-client-workspace")?.classList.add("pa-keyboard-open");
});
root.addEventListener("focusout",function(event){
  if(event.target?.id==="pa-client-search")
    root.querySelector(".pa-client-workspace")?.classList.remove("pa-keyboard-open");
});
root.addEventListener("click",function(event){
  const el=event.target.closest("[data-action]");
  if(!el)return;
  if(el.tagName==="A")event.preventDefault();
  const a=el.dataset.action;
  if(a==="admin-menu-toggle"){
    if(!SITE_EMBEDDED||!canOpenAdmin())return;
    state.adminMenuOpen=!state.adminMenuOpen;render();
    if(state.adminMenuOpen)root.querySelector(".admin-drawer-close")?.focus();
    else root.querySelector("#admin-menu-toggle")?.focus();
    return;
  }
  if(a==="admin-menu-close"){
    if(!SITE_EMBEDDED||!canOpenAdmin())return;
    state.adminMenuOpen=false;render();root.querySelector("#admin-menu-toggle")?.focus();return;
  }
  if(a==="nav"){if(SITE_EMBEDDED&&(editableDrafts.deletingKind||editableDrafts.copyKind))return;if(SITE_EMBEDDED&&canOpenAdmin())return;if(el.dataset.page==="admin" && !canOpenAdmin())return;clientNavigationEpoch++;resetSingleApprovedAdd();if(!["home","files"].includes(el.dataset.page))clearPdfReprintRetry();if(el.dataset.page!=="files")clearClientPreview();if(el.dataset.page!=="admin"){clearAdminPreview();clearDraftEditor();clearBankRename();clearBankThumbs();}state.page=el.dataset.page;state.toast="";render();window.scrollTo({top:0,behavior:"instant"});if(state.page==="files"&&authStatus.user)refreshFilesForCurrentUser();if(state.page==="home"&&SITE_EMBEDDED&&authStatus.user){clientFiles.page=0;clientFiles.query="";clientFiles.type="all";clientFiles.sort="recent";refreshFilesForCurrentUser();}if(state.page==="library"&&SITE_EMBEDDED&&authStatus.user)void fetchPublishedCatalog();if(state.page==="create"&&SITE_EMBEDDED&&authStatus.user)void fetchEditableDrafts();if(state.page==="used"&&SITE_EMBEDDED&&authStatus.user)void fetchUsedPictos();}
  if(a==="draft-page"&&SITE_EMBEDDED&&authStatus.user&&!canOpenAdmin()&&!editableDrafts.loading&&!editableDrafts.busy){
    const direction=Number(el.dataset.direction),next=editableDrafts.page+direction;
    if(![-1,1].includes(direction)||!Number.isSafeInteger(next)||next<0||
      next>=Math.ceil(editableDrafts.total/MAX_EDITABLE_DRAFTS))return;
    editableDrafts.page=next;
    void fetchEditableDrafts();return;
  }
  if(a==="draft-refresh"&&SITE_EMBEDDED&&authStatus.user&&!canOpenAdmin()&&!editableDrafts.busy){
    void fetchEditableDrafts();return;
  }
  if(a==="draft-save"&&SITE_EMBEDDED&&authStatus.user&&!canOpenAdmin()&&!editableDrafts.busy&&!officialComposer.busy){
    const kind=el.dataset.kind;
    if(!["routine","board"].includes(kind))return;
    const fields=root.querySelector('form[data-form="approved-export"][data-kind="'+kind+'"]');
    if(fields&&!fields.reportValidity())return;
    // Un conflit de révision ne peut être résolu par un second UPDATE du même brouillon.
    if(draftAutosave.status(kind).conflict){
      notify(state.language==="fr"?
        "Ce brouillon a été modifié sur un autre appareil. Choisissez « Enregistrer une copie » pour conserver vos changements.":
        "This draft changed on another device. Choose Save as a new copy to keep your edits.");
      return;
    }
    if(!draftAutosave.status(kind).dirty)draftAutosave.change(kind);
    void draftAutosave.flush(kind,{force:true});return;
  }
  if(a==="draft-save-copy"&&SITE_EMBEDDED&&authStatus.user&&!canOpenAdmin()&&
     !officialComposer.busy&&!editableDrafts.busy&&!editableDrafts.copyKind&&!editableDrafts.deletingKind&&!pendingGeneratedPdf){
    const kind=el.dataset.kind;
    if(!["routine","board"].includes(kind))return;
    const status=draftAutosave.status(kind);
    if(!status.blocked||!status.conflict||!status.dirty||status.busy||status.paused)return;
    const source=composerSource(kind);
    try{normalizeEditableDraft(source);}
    catch(error){officialComposer.error=String(error?.message||error);render();return;}
    const uid=authStatus.user.id,session=editableDrafts.sessionEpoch,
      opening=editableDrafts.openEpoch[kind],version=status.version;
    draftAutosave.pause(kind);
    const pauseId=draftAutosave.status(kind).pauseId;
    editableDrafts.copyKind=kind;
    officialComposer.error="";render();
    const valid=()=>authStatus.user?.id===uid&&editableDrafts.sessionEpoch===session&&
      editableDrafts.openEpoch[kind]===opening&&editableDrafts.copyKind===kind&&
      draftAutosave.status(kind).paused&&draftAutosave.status(kind).pauseId===pauseId&&
      draftAutosave.status(kind).version===version&&!canOpenAdmin();
    void(async()=>{
      try{
        const client=await supabaseClient();
        // La copie reste soumise aux permissions de texte en vigueur.
        await readCaptionPermission(client,uid);
        if(!valid())return;
        const saved=await saveEditableDraft(client,uid,source,{});
        if(!valid())return;
        editableDrafts.openEpoch[kind]++;
        editableDrafts.current[kind]={id:saved.id,revision:saved.revision};
        draftAutosave.discard(kind,{confirmed:true});
        editableDrafts.loaded=false;
        editableDrafts.message=state.language==="fr"?
          "Nouvelle copie enregistrée. L'autre version demeure intacte.":
          "New copy saved. The other version is unchanged.";
      }catch(error){
        if(valid())officialComposer.error=String(error?.message||error);
      }finally{
        if(authStatus.user?.id===uid&&editableDrafts.sessionEpoch===session&&
          editableDrafts.copyKind===kind){
          editableDrafts.copyKind=null;
          if(draftAutosave.status(kind).paused&&draftAutosave.status(kind).pauseId===pauseId)
            draftAutosave.resume(kind);
          render();
        }
      }
    })();return;
  }
  if(a==="files-edit-source"&&SITE_EMBEDDED&&authStatus.user&&!canOpenAdmin()&&!clientFiles.busy&&!officialComposer.busy&&!editableDrafts.busy){
    const file=clientFiles.items.find(row=>row.id===el.dataset.id);
    if(!file?.source_draft_id||!["routine","board"].includes(file.document_type))return;
    const opening=beginDraftReplacement(draftAutosave,file.document_type,{
      confirmDiscard:()=>window.confirm(state.language==="fr"?
        "Les modifications non enregistrées de cette composition seront perdues. Ouvrir la source du PDF ?":
        "Unsaved edits to this composition will be lost. Open the PDF source?"),
      onBusy:()=>notify(state.language==="fr"?
        "Enregistrement en cours. Réessayez une fois le brouillon sauvegardé.":
        "A draft is being saved. Try again after the save is complete.")
    });
    if(!opening)return;
    const uid=authStatus.user.id,epoch=++clientFiles.request,
      originPage=state.page,navigation=clientNavigationEpoch;
    // Invalider les anciennes lectures qui sont déjà en cours; leur callback
    // ne doit pas réécrire l'écran pendant le chargement de la source.
    clientFiles.busy=true;clientFiles.loading=false;clientFiles.error="";render();
    void(async()=>{
      try{
        const client=await supabaseClient();
        const draft=await loadEditableDraft(client,uid,file.source_draft_id);
        // Une navigation vers un autre écran annule l'intention d'ouverture.
        // Ne jamais faire quitter un écran choisi pendant une réponse réseau.
        if(authStatus.user?.id!==uid||epoch!==clientFiles.request||
          state.page!==originPage||clientNavigationEpoch!==navigation)return;
        if(draft.kind!==file.document_type)throw Error("La source de ce PDF ne correspond pas au type de document.");
        if(!opening.complete())throw Error("Cette composition a changé pendant son chargement. Réessayez.");
        officialComposer[draft.kind]=draft.content.items.map(item=>({...item}));
        officialComposer.settings[draft.kind]={...draft.content.settings};
        editableDrafts.openEpoch[draft.kind]++;
        editableDrafts.current[draft.kind]={id:draft.id,revision:draft.revision};
        editableDrafts.dirty[draft.kind]=false;
        officialComposer.error="";
        clearClientPreview();
        state.page=draft.kind==="routine"?"routines":"boards";
        state.toast=state.language==="fr"?
          "Source modifiable ouverte. Le PDF original archivé reste inchangé.":
          "Editable source opened. Your archived original PDF stays unchanged.";
      }catch(error){
        if(authStatus.user?.id===uid&&epoch===clientFiles.request){
          clientFiles.error=String(error?.message||error);
        }
      }finally{
        opening.cancel();
        if(authStatus.user?.id===uid&&epoch===clientFiles.request){
          clientFiles.busy=false;render();
        }
      }
    })();return;
  }
  if(a==="draft-open"&&SITE_EMBEDDED&&authStatus.user&&!canOpenAdmin()&&!editableDrafts.busy){
    const id=el.dataset.id,row=editableDrafts.items.find(x=>x.id===id);
    if(!row)return;
    const opening=beginDraftReplacement(draftAutosave,row.kind,{
      confirmDiscard:()=>window.confirm(state.language==="fr"?
        "Les modifications non enregistrées de cette composition seront perdues. Ouvrir ce brouillon ?":
        "Unsaved edits to this composition will be lost. Open this draft?"),
      onBusy:()=>notify(state.language==="fr"?
        "Enregistrement en cours. Réessayez une fois le brouillon sauvegardé.":
        "A draft is being saved. Try again after the save is complete.")
    });
    if(!opening)return;
    const uid=authStatus.user.id,request=++editableDrafts.request,
      originPage=state.page,navigation=clientNavigationEpoch;
    editableDrafts.busy=true;editableDrafts.error="";render();
    void(async()=>{
      let stale=false;
      try{
        const client=await supabaseClient(),doc=await loadEditableDraft(client,uid,id);
        // Ne pas rouvrir une routine après navigation vers l'accueil,
        // ni après un aller-retour à Mes brouillons pendant la requête.
        if(authStatus.user?.id!==uid||request!==editableDrafts.request||
          state.page!==originPage||clientNavigationEpoch!==navigation)return;
        if(doc.kind!==row.kind){
          const error=Error("Le type de brouillon a changé. Rechargez la liste.");
          error.code="DRAFT_ROW_CHANGED";throw error;
        }
        if(!opening.complete())throw Error("Cette composition a changé pendant son chargement. Réessayez.");
        officialComposer[doc.kind]=doc.content.items.map(item=>({...item}));
        officialComposer.settings[doc.kind]={...doc.content.settings};
        editableDrafts.openEpoch[doc.kind]++;
        editableDrafts.current[doc.kind]={id:doc.id,revision:doc.revision};
        editableDrafts.dirty[doc.kind]=false;officialComposer.error="";
        state.page=doc.kind==="routine"?"routines":"boards";
      }catch(error){
        if(authStatus.user?.id===uid&&request===editableDrafts.request){
          stale=["DRAFT_NOT_FOUND","DRAFT_ROW_CHANGED"].includes(error?.code);
          if(stale){
            editableDrafts.error="";
            editableDrafts.message=state.language==="fr"?
              "Ce brouillon a changé ou a été retiré sur un autre appareil. Liste actualisée; votre éditeur est préservé.":
              "This draft changed or was removed on another device. List refreshed; your editor is preserved.";
          }else editableDrafts.error=String(error?.message||error);
        }
      }finally{
        opening.cancel();
        if(authStatus.user?.id===uid&&request===editableDrafts.request){
          editableDrafts.busy=false;render();
          if(stale)void fetchEditableDrafts();
        }
      }
    })();return;
  }
  if(a==="draft-delete"&&SITE_EMBEDDED&&authStatus.user&&!canOpenAdmin()&&!editableDrafts.busy){
    const doc=editableDrafts.items.find(x=>x.id===el.dataset.id);
    if(!doc)return;
    const active=editableDrafts.current[doc.kind]?.id===doc.id;
    const deletion=beginDraftDeletion(draftAutosave,doc.kind,{
      isOpen:active,
      confirmDelete:dirty=>window.confirm(state.language==="fr"?
        "Supprimer le brouillon « "+doc.title+" » ? "+(dirty?"Ses modifications non enregistrées seront perdues. ":"")+
          (active?"L'éditeur sera vidé. ":"")+"Les PDF originaux resteront intacts.":
        "Delete draft “"+doc.title+"”? "+(dirty?"Unsaved edits will be lost. ":"")+
          (active?"The editor will be cleared. ":"")+"Original PDFs will remain unchanged."),
      onBusy:()=>notify(state.language==="fr"?
        "Sauvegarde en cours. Réessayez après sa confirmation avant de supprimer ce brouillon.":
        "Saving in progress. Try deleting this draft after the save is confirmed.")
    });
    if(!deletion)return;
    const uid=authStatus.user.id,request=++editableDrafts.request;
    const revision=active?editableDrafts.current[doc.kind].revision:doc.revision;
    if(active)editableDrafts.deletingKind=doc.kind;
    editableDrafts.busy=true;editableDrafts.error="";render();
    void(async()=>{
      let deleted=false,stale=false;
      try{
        const client=await supabaseClient();
        await deleteEditableDraft(client,uid,doc.id,revision);
        if(authStatus.user?.id!==uid||request!==editableDrafts.request)return;
        editableDrafts.items=editableDrafts.items.filter(item=>item.id!==doc.id);
        editableDrafts.total=Math.max(0,editableDrafts.total-1);
        deleted=true;
        if(active&&editableDrafts.current[doc.kind]?.id===doc.id){
          const unchanged=deletion.complete();
          editableDrafts.openEpoch[doc.kind]++;
          editableDrafts.current[doc.kind]=null;
          if(unchanged){
            // La suppression ne doit jamais recréer automatiquement le même brouillon.
            officialComposer[doc.kind]=[];
            officialComposer.settings[doc.kind]=emptyComposerSettings()[doc.kind];
            draftAutosave.discard(doc.kind);
            editableDrafts.dirty[doc.kind]=false;
          }else{
            // Une nouvelle saisie imprévue n'est pas perdue : elle devient une
            // nouvelle composition sans lien vers le brouillon supprimé.
            deletion.cancel();
            draftAutosave.discard(doc.kind);
            if(officialComposer[doc.kind].length)markDraftChanged(doc.kind);
          }
        }
        editableDrafts.message=state.language==="fr"?
          "Brouillon supprimé. Les PDF originaux sont préservés.":
          "Draft deleted. Original PDFs remain unchanged.";
      }catch(error){
        if(authStatus.user?.id===uid&&request===editableDrafts.request){
          stale=error?.code==="DRAFT_REVISION_CONFLICT";
          if(stale){
            editableDrafts.error="";
            editableDrafts.message=state.language==="fr"?
              "Ce brouillon a changé sur un autre appareil. Liste actualisée; ouvrez la version actuelle avant de la supprimer. Vos modifications locales et les PDF restent intacts.":
              "This draft changed on another device. List refreshed; open the latest version before deleting it. Your local edits and PDFs remain unchanged.";
          }else editableDrafts.error=String(error?.message||error);
        }
      }finally{
        deletion.cancel();
        if(authStatus.user?.id===uid&&request===editableDrafts.request){
          editableDrafts.deletingKind=null;
          editableDrafts.busy=false;render();
          if(deleted||stale)void fetchEditableDrafts();
        }
      }
    })();return;
  }
  if(a==="client-search"){
    if(SITE_EMBEDDED&&!canOpenAdmin()){state.page="library";render();if(!publishedCatalog.loaded&&!publishedCatalog.loading)void fetchPublishedCatalog();requestAnimationFrame(()=>root.querySelector("#pa-client-search")?.focus());}
    return;
  }
  if(a==="client-category"){
    if(SITE_EMBEDDED&&!canOpenAdmin()){
      const value=el.dataset.category||"";
      state.clientCategory=CLIENT_CATEGORIES.some(x=>x[0]===value)?value:"";
      state.page="library";publishedCatalog.page=0;render();void fetchPublishedCatalog();window.scrollTo({top:0,behavior:"instant"});
    }
    return;
  }
  if(a==="approved-add"&&SITE_EMBEDDED&&authStatus.user&&!canOpenAdmin()&&
      !singleApprovedAdd.busy&&!usedPictos.adding&&!officialComposer.busy&&
      !editableDrafts.deletingKind&&!editableDrafts.copyKind){
    const kind=el.dataset.kind,page=state.page,id=el.dataset.id;
    if(!["routine","board"].includes(kind)||!["library","used"].includes(page))return;
    const row=page==="library"?publishedCatalog.items.find(x=>x.id===id):
      usedPictos.items.map(approvedFromUsage).filter(Boolean).find(x=>x.id===id);
    if(!row)return;
    const uid=authStatus.user.id,session=editableDrafts.sessionEpoch,
      before=officialComposer[kind],catalogTicket=publishedCatalog.request,
      usedTicket=usedPictos.request,token=++singleApprovedAdd.request;
    const stillCurrent=()=>authStatus.user?.id===uid&&
      editableDrafts.sessionEpoch===session&&singleApprovedAdd.request===token&&
      singleApprovedAdd.page===page&&state.page===page&&
      publishedCatalog.request===catalogTicket&&usedPictos.request===usedTicket&&
      officialComposer[kind]===before&&!officialComposer.busy&&!canOpenAdmin();
    singleApprovedAdd.page=page;singleApprovedAdd.busy=true;singleApprovedAdd.error="";
    singleApprovedAdd.message=state.language==="fr"?
      "Vérification de l’approbation du pictogramme…":"Checking pictogram approval…";
    render();
    void(async()=>{
      try{
        // Un pictogramme présent dans l'interface n'est PAS une autorisation
        // persistante. Même contrôle Auth/RLS que l'export officiel du PDF.
        const [fresh]=await loadApprovedSelection(await supabaseClient(),uid,[id]);
        if(!stillCurrent())return;
        officialComposer[kind]=selectApprovedItem(before,fresh,kind);
        markDraftChanged(kind);officialComposer.error="";
        singleApprovedAdd.message=state.language==="fr"?
          (kind==="routine"?"Pictogramme ajouté à votre routine.":"Pictogramme ajouté à votre tableau.") :
          (kind==="routine"?"Pictogram added to your routine.":"Pictogram added to your board.");
      }catch(error){
        if(stillCurrent()){
          singleApprovedAdd.error=String(error?.message||error);
          singleApprovedAdd.message="";
        }
      }finally{
        if(authStatus.user?.id===uid&&singleApprovedAdd.request===token){
          singleApprovedAdd.busy=false;render();
        }
      }
    })();return;
  }
  if((a==="approved-remove"||a==="approved-move")&&SITE_EMBEDDED&&authStatus.user&&!canOpenAdmin()&&!officialComposer.busy&&!editableDrafts.deletingKind&&!editableDrafts.copyKind){
     const kind=el.dataset.kind,index=Number(el.dataset.index);
     if(!["routine","board"].includes(kind))return;
     officialComposer[kind]=a==="approved-remove"?removeApprovedItem(officialComposer[kind],index):
       changeApprovedOrder(officialComposer[kind],index,Number(el.dataset.direction));
     markDraftChanged(kind);render();return;
   }
   if(a==="used-remove-choice"&&SITE_EMBEDDED&&authStatus.user&&!canOpenAdmin()&&!usedPictos.adding&&
      !officialComposer.busy&&!editableDrafts.deletingKind&&!editableDrafts.copyKind){
     try{
       usedPictos.selected=removeUsedChoice(usedPictos.selected,el.dataset.id);
       usedPictos.notice="";
     }catch(error){usedPictos.notice=String(error?.message||error);}
     render();
     requestAnimationFrame(()=>(root.querySelector('[data-action="used-remove-choice"]')||
       root.querySelector("#pa-used-search"))?.focus());
     return;
   }
   if(a==="used-toggle"&&SITE_EMBEDDED&&authStatus.user&&!canOpenAdmin()&&
      !usedPictos.loading&&!usedPictos.error&&!usedPictos.adding&&!singleApprovedAdd.busy&&!officialComposer.busy){
     try{
       usedPictos.selected=toggleUsedChoice(usedPictos.selected,el.dataset.id,usedPictos.items);
       usedPictos.notice="";
     }catch(error){usedPictos.notice=String(error?.message||error);}
     render();return;
   }
   if(a==="used-clear"&&SITE_EMBEDDED&&authStatus.user&&!canOpenAdmin()&&!usedPictos.adding){
     usedPictos.selected=new Map();usedPictos.notice="";render();return;
   }
   if(a==="used-add-page"&&SITE_EMBEDDED&&authStatus.user&&!canOpenAdmin()&&
       !usedPictos.loading&&!usedPictos.error&&!usedPictos.adding&&!singleApprovedAdd.busy&&!officialComposer.busy&&
       !editableDrafts.deletingKind&&!editableDrafts.copyKind){
     const kind=el.dataset.kind;
     if(!["routine","board"].includes(kind))return;
     const uid=authStatus.user.id,request=++usedPictos.addRequest,
       historyTicket=usedPictos.request,session=editableDrafts.sessionEpoch,
       selection=usedPictos.selected,before=officialComposer[kind];
     const current=()=>authStatus.user?.id===uid&&usedPictos.addRequest===request&&
       usedPictos.request===historyTicket&&editableDrafts.sessionEpoch===session&&
       usedPictos.selected===selection&&officialComposer[kind]===before&&
       state.page==="used"&&!canOpenAdmin()&&!officialComposer.busy;
     usedPictos.adding=true;
     usedPictos.notice=state.language==="fr"?
       "Vérification des pictogrammes encore approuvés…":"Checking currently approved pictograms…";
     render();
     void(async()=>{
       try{
         const plan=planUsedBatchApproval(selection,usedPictos.items,before,kind);
         // L'historique ne prouve pas la publication courante : relecture
         // du catalogue officiel authentifié avant toute mutation.
         const rows=plan.ids.length?await loadApprovedSelection(await supabaseClient(),uid,plan.ids):[];
         if(!current())return;
         const result=addApprovedPage(before,rows,kind);
         if(result.added){
           officialComposer[kind]=result.items;
           markDraftChanged(kind);officialComposer.error="";
         }
         const fr=state.language==="fr",full=plan.capacityReached||result.capacityReached;
         usedPictos.notice=result.added?
           (fr?result.added+(result.added===1?" pictogramme ajouté.":" pictogrammes ajoutés.")+
             (full?" Limite du support atteinte.":""):
             result.added+(result.added===1?" pictogram added.":" pictograms added.")+
             (full?" Support limit reached.":"")):
           (fr?"Aucune nouvelle image ajoutée : déjà choisie ou support complet.":"No new images added: already selected or support full.");
       }catch(error){if(current())usedPictos.notice=String(error?.message||error);}
       finally{
         if(authStatus.user?.id===uid&&usedPictos.addRequest===request){
           usedPictos.adding=false;render();
         }
       }
     })();return;
   }
   if(a==="used-page"&&SITE_EMBEDDED&&authStatus.user&&!canOpenAdmin()&&!usedPictos.loading&&!usedPictos.adding){
    const target=usedPictos.page+Number(el.dataset.direction);
    if(Number.isSafeInteger(target)&&target>=0&&target<Math.ceil(usedPictos.total/USED_PAGE_SIZE)){
      usedPictos.page=target;void fetchUsedPictos();
    }
    return;
  }
  if(a==="used-refresh"&&SITE_EMBEDDED&&authStatus.user&&!canOpenAdmin()&&!usedPictos.loading&&!usedPictos.adding){
    void fetchUsedPictos();return;
  }
  if(a==="catalog-refresh"&&SITE_EMBEDDED&&!canOpenAdmin()){void fetchPublishedCatalog();return;}
  if(a==="catalog-page"&&SITE_EMBEDDED&&!canOpenAdmin()&&!publishedCatalog.loading){
    const target=publishedCatalog.page+Number(el.dataset.direction);
    if(!Number.isSafeInteger(target)||target<0||target>=Math.ceil(publishedCatalog.total/CATALOG_PAGE_SIZE))return;
    publishedCatalog.page=target;void fetchPublishedCatalog();window.scrollTo({top:0,behavior:"instant"});return;
  }
  if(a==="files-preview-close"){
    const docId=clientFiles.preview?.id;
    clearClientPreview();render();
    if(docId)root.querySelector('[data-action="files-preview"][data-id="'+docId+'"]')?.focus();
    return;
  }
  if((a==="files-preview-previous"||a==="files-preview-next")&&authStatus.user&&!clientFiles.busy){
    const p=clientFiles.preview;
    if(!p)return;
    const delta=a==="files-preview-next"?1:-1;
    if(selectClientPreviewPage(p.pageIndex+delta)){
      render();
      const selector=a==="files-preview-next"&&clientFiles.preview.pageIndex===clientFiles.preview.pages.length-1?
        '[data-action="files-preview-previous"]':
        a==="files-preview-previous"&&clientFiles.preview.pageIndex===0?
        '[data-action="files-preview-next"]':'[data-action="'+a+'"]';
      root.querySelector(selector)?.focus();
    }
    return;
  }
  if(a==="files-preview"&&authStatus.user&&!clientFiles.busy){
    const doc=clientFiles.items.find(item=>item.id===el.dataset.id);
    if(!doc)return;
    // L'aperçu peut partir de l'accueil client sans détour par la liste.
    if(SITE_EMBEDDED&&state.page==="home")state.page="files";
    const uid=authStatus.user.id,epoch=++clientFiles.request;
    clearClientPreview();clientFiles.busy=true;clientFiles.error="";render();
    void(async()=>{
      try{
        const client=await supabaseClient();
        const result=await downloadMyDocument(client,uid,doc.id);
        if(epoch!==clientFiles.request||authStatus.user?.id!==uid||state.page!=="files")return;
        const extracted=await previewPagesFromOriginalPdf(result.blob);
        if(epoch!==clientFiles.request||authStatus.user?.id!==uid||state.page!=="files")return;
        // Si un nombre de pages a été certifié à l'archivage, ne jamais
        // présenter un aperçu qui en diffère.
        const pages=extracted?.length&&
          (!result.document.page_count||result.document.page_count===extracted.length)?
          extracted:[];
        const url=pages.length?URL.createObjectURL(pages[0].blob):null;
        clientFiles.preview={id:doc.id,title:result.document.title,url,pages,pageIndex:0};
      }catch(error){
        if(epoch===clientFiles.request&&authStatus.user?.id===uid)
          clientFiles.error=String(error?.message||error);
      }finally{
        if(authStatus.user?.id===uid){clientFiles.busy=false;render();
          if(clientFiles.preview?.id===doc.id)
            root.querySelector('[data-action="files-preview-close"]')?.focus();}
      }
    })();return;
  }
  if(a==="files-refresh"){
    if(authStatus.user&&!clientFiles.busy)refreshFilesForCurrentUser();return;
  }
  if(a==="files-page"&&authStatus.user&&!clientFiles.loading&&!clientFiles.busy){
    const next=clientFiles.page+Number(el.dataset.direction);
    const last=Math.max(0,Math.ceil(clientFiles.total/DOCUMENTS_PAGE_SIZE)-1);
    if(!Number.isInteger(next)||next<0||next>last)return;
    clientFiles.page=next;clientFiles.renameId=null;refreshFilesForCurrentUser();return;
  }
  if(a==="files-rename-open"){
    if(!authStatus.user||!clientFiles.items.some(doc=>doc.id===el.dataset.id))return;
    clientFiles.renameId=el.dataset.id;clientFiles.error="";render();return;
  }
  if(a==="files-rename-cancel"){clientFiles.renameId=null;render();return;}
  if(["files-reprint","files-download"].includes(a)&&authStatus.user&&!clientFiles.busy){
    const doc=clientFiles.items.find(item=>item.id===el.dataset.id);if(!doc)return;
    const uid=authStatus.user.id,epoch=++clientFiles.request;
    clearPdfReprintRetry();
    const isReprint=a==="files-reprint";
    // Une fenêtre ne peut être ouverte de façon fiable qu'au clic de l'utilisateur.
    const tab=isReprint?window.open("about:blank","_blank"):null;
    if(tab){try{tab.opener=null;tab.document.title="Pict-au — PDF";tab.document.body.textContent=state.language==="fr"?"Chargement du PDF original…":"Loading original PDF…";}catch{}}
    clientFiles.busy=true;clientFiles.error="";render();
    void(async()=>{
      try{
        const client=await supabaseClient();
        const result=await downloadMyDocument(client,uid,doc.id);
        if(authStatus.user?.id!==uid||epoch!==clientFiles.request){tab?.close();return;}
        const url=URL.createObjectURL(result.blob);
        let readerOpened=false;
        if(isReprint&&tab){
          try{tab.location.replace(url);readerOpened=true;}
          catch{try{tab.close();}catch{/* Le téléchargement reste possible. */}}
        }
        if(readerOpened){
          setTimeout(()=>URL.revokeObjectURL(url),5*60*1000);
          clientFiles.message=state.language==="fr"?"PDF original ouvert : utilisez Imprimer dans le lecteur PDF.":"Original PDF opened: use Print in the PDF viewer.";
        }else{
          // Si iOS/Android ou un bloqueur refuse la fenêtre, conserver l'action
          // Réimprimer : proposer le PDF ORIGINAL vérifié en téléchargement.
          // Ne jamais prétendre que le fichier a été imprimé ou téléchargé.
          const filename=(doc.title||"pictau").replace(/[^\p{L}\p{N} _-]/gu,"").slice(0,80)||"pictau";
          const anchor=document.createElement("a");anchor.href=url;anchor.download=filename+".pdf";
          let clickRejected=false;
          try{document.body.appendChild(anchor);anchor.click();}
          catch{clickRejected=true;}
          finally{anchor.remove();}
          // Si le navigateur refuse le clic (ou l'ignore sans exception), le
          // même original SHA-vérifié reste accessible par un GESTE direct.
          // Ce lien est conservé pour « Réimprimer » ET « Télécharger PDF ».
          clientFiles.reprintRetry={uid,id:doc.id,url,filename:filename+".pdf"};
          clientFiles.message=clickRejected?(state.language==="fr"?
            "Téléchargement automatique refusé. Utilisez le lien « Télécharger le PDF original » ci-dessous.":
            "Automatic download was blocked. Use the Download original PDF link below."):
            isReprint?(state.language==="fr"?
              "Ouverture du lecteur PDF bloquée. Téléchargement du PDF original demandé : ouvrez-le pour l’imprimer à 100 %.":
              "PDF viewer was blocked. Original PDF download requested: open it to print at 100%."):
              (state.language==="fr"?
                "Téléchargement du PDF original demandé. Si rien ne se passe, utilisez le lien ci-dessous.":
                "Original PDF download requested. If nothing happens, use the link below.");
        }
      }catch(error){
        tab?.close();
        if(authStatus.user?.id===uid&&epoch===clientFiles.request)clientFiles.error=String(error?.message||error);
      }finally{
        if(authStatus.user?.id===uid&&epoch===clientFiles.request){clientFiles.busy=false;render();}
      }
    })();return;
  }
  if(a==="role-retry"){if(!authStatus.user)return;authStatus.roleError="";void supabaseClient().then(c=>refreshPrivateBank(c,authStatus.user.id));return;}
  if(a==="email-link"||a==="email-reset"){
    const input=root.querySelector('#auth-email');
    if(!input||!input.reportValidity()||authStatus.emailBusy)return;
    authStatus.email=input.value.trim();authStatus.emailError="";authStatus.emailMessage="";authStatus.emailBusy=true;render();
    void (a==="email-link"?sendEmailSignInLink(authStatus.email,window.location.href):sendPasswordReset(authStatus.email,window.location.href))
      .then(()=>{authStatus.emailMessage=state.language==="fr"?"Si le compte existe et que l’envoi est autorisé, consultez votre boîte courriel.":"If the account exists and email delivery is enabled, check your inbox.";})
      .catch(()=>{authStatus.emailError=state.language==="fr"?"Envoi impossible. Vérifiez la configuration du courriel ou réessayez plus tard.":"Unable to send. Check email settings or try again later.";})
      .finally(()=>{authStatus.emailBusy=false;render();});
    return;
  }
  if(a==="google-login"){authStatus.working=true;render();void loginGoogle(window.location.href).catch(err=>{authStatus.working=false;authStatus.error=String(err.message||err);notify(state.language==="fr"?"Connexion Google impossible : "+authStatus.error:"Google sign-in failed: "+authStatus.error);});return;}
  if(a==="google-logout"){
    if(editableDrafts.busy||draftAutosave.status("routine").busy||draftAutosave.status("board").busy){
      notify(state.language==="fr"?"Une sauvegarde est en cours. Attendez sa confirmation avant de vous déconnecter.":"A draft save is in progress. Wait for confirmation before signing out.");
      return;
    }
    if((editableDrafts.dirty.routine||editableDrafts.dirty.board)&&!window.confirm(state.language==="fr"?
      "Des modifications ne sont pas encore sauvegardées sur le serveur. Se déconnecter quand même risque de les perdre.":
      "Changes have not yet been saved on the server. Signing out now may lose them."))return;
    authStatus.working=true;resetPrivateBank();render();
    void logoutGoogle().then(()=>{authStatus.user=null;authStatus.roleReady=false;authStatus.working=false;state.page="home";state.adminTab="overview";render();}).catch(err=>{authStatus.working=false;notify(String(err.message||err));});return;
  }
  if(a==="lang"){state.language=el.dataset.lang;store("pictau-language",state.language);state.toast="";render();}
  if(a==="view-picto"){
    if(!samples.some(item=>item.id===el.dataset.id))return;
    state.detailId=el.dataset.id;
    state.recentlyViewed=recordDemoRecent(state.recentlyViewed,el.dataset.id,samples.map(item=>item.id));
    store("pictau-demo-recent",state.recentlyViewed);
    render();
    document.querySelector(".client-picto-detail")?.scrollIntoView({block:"nearest"});
    return;
  }
  if(a==="close-picto"){state.detailId=null;render();return;}
  if(a==="favorite"){
    const id=el.dataset.id;
    if(!samples.some(item=>item.id===id))return;
    state.favorites=state.favorites.includes(id)?state.favorites.filter(value=>value!==id):[...state.favorites,id];
    store("pictau-demo-favorites",state.favorites);render();return;
  }
  if(a==="view-favorites"){state.showFavorites=el.dataset.view==="favorites";render();return;}
  if(a==="quick-theme"){
    if(!["all","hygiene","ecole","autonomie","loisirs"].includes(el.dataset.theme))return;
    state.theme=el.dataset.theme;render();return;
  }
  if(a==="add"){if(state.routine.length>=10){notify(T("full"));return;}state.routine=addToRoutine(state.routine,el.dataset.id);syncRoutine();notify(T("added"));}
  if(a==="remove"){state.routine.splice(Number(el.dataset.index),1);syncRoutine();render();}
  if(a==="move"){state.routine=moveRoutine(state.routine,Number(el.dataset.index),Number(el.dataset.direction));syncRoutine();render();}
  if(a==="add-board"||a==="board-add"){
    const previous=state.board;
    state.board=addDemoBoardItem(state.board,el.dataset.id,samples.map(item=>item.id));
    if(state.board.length===previous.length){
      notify(state.language==="fr"?"Ce tableau de démonstration contient déjà son maximum de cases.":"This demo board already contains its maximum number of cells.");
      return;
    }
    saveDemoBoard();
    if(a==="add-board")notify(state.language==="fr"?"Image ajoutée au tableau.":"Picture added to board.");
    else render();
    return;
  }
  if(a==="board-remove"){state.board=removeDemoBoardItem(state.board,Number(el.dataset.index));saveDemoBoard();render();return;}
  if(a==="board-move"){state.board=moveDemoBoardItem(state.board,Number(el.dataset.index),Number(el.dataset.direction));saveDemoBoard();render();return;}
  if(a==="archive-generated-routine"||a==="archive-generated-board"){
    if(!authStatus.user||pdfExportBusy||pendingGeneratedPdf?.uid===authStatus.user.id)return;
    const kind=a==="archive-generated-routine"?"routine":"board";
    const items=kind==="routine"?selectedItems():boardItems();
    if(kind==="routine"&&(items.length<2||!routineFitsPaper(state.routine,state.widthCm,state.paper)))return;
    if(kind==="board"&&(!items.length||!demoBoardFitsWidth(state.boardCols,state.boardWidthCm,state.paper)))return;
    layoutArtwork(root);
    if(root.querySelector(kind==="routine"?'.print-sheet:not(.board-print-sheet) [data-art-collision="true"]':'.board-print-sheet [data-art-collision="true"]')){
      notify(state.language==="fr"?"Le dessin empiète sur le libellé : corrigez le gabarit.":"Artwork overlaps the label: adjust the template.");return;
    }
    // Capturer la composition et le compte avant toute opération asynchrone.
    const options={kind,items:[...items],widthCm:kind==="routine"?state.widthCm:state.boardWidthCm,
      preset:{...state.currentPreset},paper:state.paper,language:state.language,
      separatorMode:state.separatorMode,columns:state.boardCols,
      title:kind==="routine"?state.routinePdfTitle:((state.boardTitle||"").trim()||(state.language==="fr"?"Mon tableau":"My board"))};
    const uid=authStatus.user.id,epoch=++clientFiles.request;
    pdfExportBusy=true;state.toast="";render();
    void (async()=>{
      try{
        const {blob,pageCount}=await createPreparedPdf(options);
        if(authStatus.user?.id!==uid||clientFiles.request!==epoch)return;
        // La copie demeure disponible si la connexion, l'envoi ou la confirmation échoue.
        pendingGeneratedPdf={blob,pageCount,uid,title:options.title,documentType:kind,
          documentId:crypto.randomUUID()};
        const client=await supabaseClient();
        await archivePdf(client,uid,blob,{title:options.title,documentType:kind,pageCount,
          documentId:pendingGeneratedPdf.documentId});
        // L'archivage peut être confirmé alors que la navigation a changé :
        // ne jamais annoncer à tort un document archivé comme « non archivé ».
        if(pendingGeneratedPdf?.uid===uid&&pendingGeneratedPdf.blob===blob)
          pendingGeneratedPdf=null;
        if(authStatus.user?.id!==uid||clientFiles.request!==epoch)return;
        state.page="files";clientFiles.page=0;clientFiles.query="";clientFiles.type="all";clientFiles.sort="recent";
        clientFiles.message=state.language==="fr"?"PDF créé et archivé. Réimprimez le même original depuis Mes fichiers.":"PDF created and archived. Reprint the unchanged original from My files.";
        await fetchClientFiles(client,uid);
      }catch(error){
        if(authStatus.user?.id===uid&&clientFiles.request===epoch)
          state.toast=(state.language==="fr"?"PDF non archivé : ":"PDF not archived: ")+String(error?.message||error)
            +(pendingGeneratedPdf?(state.language==="fr"?" — Téléchargez la copie temporaire ci-dessous.":" — Download the temporary copy below."):"");
      }finally{
        pdfExportBusy=false;render();
      }
    })();return;
  }
  if(a==="retry-unarchived-pdf"){
    const pending=pendingGeneratedPdf,uid=authStatus.user?.id;
    if(!SITE_EMBEDDED||!uid||canOpenAdmin()||!pending||pending.uid!==uid||
      pdfRecoveryBusy||pdfExportBusy||officialComposer.busy||clientFiles.busy)return;
    const token=++pdfRecoveryRequest;
    pdfRecoveryBusy=true;pdfRecoveryError="";state.toast="";render();
    void(async()=>{
      try{
        // Réutiliser STRICTEMENT le même Blob, le même titre et le même
        // identifiant de brouillon. Ne pas régénérer une composition modifiée.
        const client=await supabaseClient();
        await archivePdf(client,uid,pending.blob,{
          title:pending.title,documentType:pending.documentType,
          pageCount:pending.pageCount,sourceDraftId:pending.sourceDraftId||null,
          documentId:pending.documentId
        });
        if(authStatus.user?.id!==uid||token!==pdfRecoveryRequest||
          pendingGeneratedPdf!==pending)return;
        pendingGeneratedPdf=null;
        clientFiles.message=state.language==="fr"?
          "PDF original archivé après un nouvel essai. Retrouvez-le dans Mes créations.":
          "Original PDF archived after retry. Find it in My creations.";
        state.toast=clientFiles.message;
        if(state.page==="files")void fetchClientFiles(client,uid);
      }catch(error){
        if(authStatus.user?.id===uid&&token===pdfRecoveryRequest&&
          pendingGeneratedPdf===pending){
          pdfRecoveryError=String(error?.message||error);
        }
      }finally{
        if(authStatus.user?.id===uid&&token===pdfRecoveryRequest){
          pdfRecoveryBusy=false;render();
        }
      }
    })();return;
  }
  if(a==="discard-unarchived-pdf"){
    if(!pendingGeneratedPdf||pendingGeneratedPdf.uid!==authStatus.user?.id||pdfExportBusy||pdfRecoveryBusy||clientFiles.busy)return;
    const fr=state.language==="fr";
    if(window.confirm(fr
      ?"Cette copie n'est pas archivée. Avez-vous téléchargé le PDF ? L'écarter ici est irréversible."
      :"This copy is not archived. Have you downloaded the PDF? Discarding it here cannot be undone.")){
      pendingGeneratedPdf=null;pdfRecoveryError="";
      state.toast=fr?"Copie temporaire écartée. Aucun document serveur supprimé.":"Temporary copy discarded. No server document was deleted.";
      render();
    }
    return;
  }
  if(a==="download-unarchived-pdf"){
    const pending=pendingGeneratedPdf;
    if(!pending||pending.uid!==authStatus.user?.id||pdfExportBusy||pdfRecoveryBusy||clientFiles.busy)return;
    let url=null;
    try{
      url=URL.createObjectURL(pending.blob);
      const base=pending.title.normalize("NFD").replace(/[\u0300-\u036f]/g,"")
        .replace(/[^a-zA-Z0-9_-]+/g,"-").replace(/^-+|-+$/g,"").slice(0,70)||"pictau-document";
      const anchor=document.createElement("a");
      anchor.href=url;anchor.download=base+".pdf";document.body.appendChild(anchor);
      anchor.click();anchor.remove();
      const revokeUrl=url;setTimeout(()=>URL.revokeObjectURL(revokeUrl),60000);
      // Un téléchargement demandé n'est pas une sauvegarde confirmée, ni une impression.
      state.toast=state.language==="fr"?"Téléchargement demandé. Ce PDF reste non archivé.":"Download requested. This PDF is not archived.";
      render();
    }catch(error){
      if(url)URL.revokeObjectURL(url);
      notify((state.language==="fr"?"Téléchargement impossible : ":"Download unavailable: ")+String(error?.message||error));
    }
    return;
  }
  if(a==="board-print"){
    if(!state.board.length||!demoBoardFitsWidth(state.boardCols,state.boardWidthCm,state.paper))return;
    layoutArtwork(root);
    if(root.querySelector('.board-print-sheet [data-art-collision="true"]')){
      notify(state.language==="fr"?"Le dessin empiète sur le libellé : ajustez le gabarit avant impression.":"Artwork overlaps the label: adjust the template before printing.");return;
    }
    window.print();return;
  }
  if(a==="clear"){state.search="";state.theme="all";state.showFavorites=false;render();}
  if(a==="print"){
    if(state.routine.length<2||!routineFitsPaper(state.routine,state.widthCm,state.paper))return;
    layoutArtwork(root);
    if(root.querySelector('.print-sheet:not(.board-print-sheet) [data-art-collision="true"]')){
      notify(state.language==="fr"?"Le dessin empiète sur le libellé : ajustez le gabarit avant impression.":"Artwork overlaps the label: adjust the template before printing.");return;
    }
    window.print();return;
  }
  if(a==="caption-refresh"&&canOpenAdmin()&&!captionFeature.saving){
    void fetchCaptionFeature();return;
  }
  if(a==="caption-toggle"&&canOpenAdmin()&&captionFeature.loaded&&!captionFeature.saving){
    const uid=authStatus.user.id,ticket=++captionFeature.request,previous=captionFeature.enabled;
    captionFeature.saving=true;captionFeature.error="";captionFeature.message="";render();
    void(async()=>{
      try{
        const client=await supabaseClient();
        const p=await setCaptionPermission(client,uid,previous,!previous);
        if(authStatus.user?.id!==uid||ticket!==captionFeature.request)return;
        captionFeature.enabled=p.enabled;captionFeature.loaded=true;captionFeature.updated_at=p.updated_at;
        captionFeature.message=state.language==="fr"?"Réglage enregistré sur le serveur.":"Setting saved on server.";
      }catch(error){
        if(authStatus.user?.id===uid&&ticket===captionFeature.request){
          captionFeature.loaded=false;captionFeature.enabled=false;
          captionFeature.error=String(error?.message||error);
        }
      }finally{
        if(authStatus.user?.id===uid&&ticket===captionFeature.request){
          captionFeature.saving=false;render();
        }
      }
    })();return;
  }
  if(a==="admin-tab"){
    if(!canOpenAdmin())return;
    if(el.dataset.tab!=="bank"){clearAdminPreview();clearDraftEditor();clearBankRename();clearBankThumbs();}
    state.adminTab=el.dataset.tab;state.adminMenuOpen=false;state.toast="";render();
    if(state.adminTab==="settings"&&authStatus.user)void fetchCaptionFeature();
    if(state.adminTab==="requests"&&authStatus.user)
      void supabaseClient().then(c=>fetchAdminRequests(c,authStatus.user.id))
       .catch(error=>{adminRequests.error=String(error?.message||error);render();});
    return;
  }
  if(a==="request-open"){
    customerRequests.view="form";customerRequests.error="";customerRequests.message="";
    render();
    // Le bouton a été remplacé par render() : déplacer le focus vers le contenu
    // sans ouvrir automatiquement le clavier virtuel sur téléphone.
    root.querySelector("#pa-client-requests-title")?.focus({preventScroll:true});
    root.querySelector("#pa-client-request-center")?.scrollIntoView({
      behavior:window.matchMedia("(prefers-reduced-motion: reduce)").matches?"auto":"smooth",
      block:"start"
    });
    return;
  }
  if(a==="request-view"){
    const requested=el.dataset.view;
    if(!["mine","form"].includes(requested))return;
    customerRequests.view=customerRequests.view===requested?"closed":requested;
    customerRequests.error="";customerRequests.message="";render();
    if(customerRequests.view==="closed"){
      // Rendre le focus à l'action déclenchante après fermeture du panneau.
      root.querySelector('.pa-client-discovery-actions [data-action="request-open"]')?.focus({preventScroll:true});
    }else{
      root.querySelector('.request-center [data-action="request-view"][data-view="'+requested+'"]')?.focus({preventScroll:true});
    }
    if(customerRequests.view==="mine"&&authStatus.user)
      void supabaseClient().then(c=>fetchCustomerRequests(c,authStatus.user.id))
       .catch(error=>{customerRequests.error=String(error?.message||error);renderCustomerRequestsKeepingFocus();});
    return;
  }
  if(a==="request-refresh"&&authStatus.user){
    void supabaseClient().then(c=>fetchCustomerRequests(c,authStatus.user.id))
     .catch(error=>{customerRequests.error=String(error?.message||error);render();});return;
  }
  if(a==="request-page"&&authStatus.user&&!customerRequests.loading){
    const next=customerRequests.page+Number(el.dataset.direction);
    const last=Math.max(0,Math.ceil(customerRequests.total/REQUEST_PAGE_SIZE)-1);
    if(!Number.isInteger(next)||next<0||next>last)return;
    customerRequests.page=next;customerRequests.historyId=null;customerRequests.history=[];
    void supabaseClient().then(c=>fetchCustomerRequests(c,authStatus.user.id));return;
  }
  if(a==="request-history"&&authStatus.user){
    const id=el.dataset.id,uid=authStatus.user.id,epoch=++customerRequests.request;
    customerRequests.historyId=id;customerRequests.history=[];customerRequests.error="";render();
    void supabaseClient().then(c=>listPictogramRequestHistory(c,uid,id)).then(history=>{
      if(authStatus.user?.id!==uid||epoch!==customerRequests.request)return;
      customerRequests.history=history;render();
    }).catch(error=>{if(authStatus.user?.id===uid&&epoch===customerRequests.request){customerRequests.error=String(error?.message||error);render();}});
    return;
  }
  if(a==="admin-requests-refresh"&&canOpenAdmin()&&authStatus.user){
    void supabaseClient().then(c=>fetchAdminRequests(c,authStatus.user.id));return;
  }
  if(a==="admin-request-page"&&canOpenAdmin()&&authStatus.user&&!adminRequests.loading){
    const next=adminRequests.page+Number(el.dataset.direction);
    const last=Math.max(0,Math.ceil(adminRequests.total/REQUEST_PAGE_SIZE)-1);
    if(!Number.isInteger(next)||next<0||next>last)return;
    adminRequests.page=next;adminRequests.selectedId=null;
    void supabaseClient().then(c=>fetchAdminRequests(c,authStatus.user.id));return;
  }
  if(a==="admin-request-open"&&canOpenAdmin()){
    const found=adminRequests.items.find(x=>x.id===el.dataset.id);if(!found)return;
    adminRequests.selectedId=found.id;adminRequests.historyId=null;adminRequests.history=[];
    adminRequests.draft={status:found.status==="submitted"?"in_progress":found.status,adminNote:found.admin_note||"",linkedAssetId:found.linked_asset_id||""};
    adminRequests.saved="";render();return;
  }
  if(a==="admin-request-history"&&canOpenAdmin()&&authStatus.user){
    const uid=authStatus.user.id,id=adminRequests.selectedId,epoch=adminRequests.request;
    if(!id)return;
    adminRequests.historyId=id;adminRequests.history=[];render();
    void supabaseClient().then(c=>listPictogramRequestHistory(c,uid,id)).then(events=>{
      if(authStatus.user?.id!==uid||adminRequests.request!==epoch||adminRequests.selectedId!==id)return;
      adminRequests.history=events;render();
    }).catch(error=>{if(authStatus.user?.id===uid){adminRequests.error=String(error?.message||error);render();}});
    return;
  }
  if(a==="admin-request-close"){adminRequests.selectedId=null;adminRequests.historyId=null;adminRequests.history=[];render();return;}
  if(a==="admin-theme-asset"){
    if(!canOpenAdmin()||!privateBank.items.some(item=>item.id===el.dataset.id))return;
    themeUI.assetId=el.dataset.id;themeUI.error="";themeUI.message="";
    clearAdminPreview();clearDraftEditor();clearBankRename();render();return;
  }
  if(a==="admin-theme-close"){themeUI.assetId=null;render();return;}
  if(a==="admin-theme-edit-open"){
    if(!canOpenAdmin()||!themeUI.items.some(x=>x.code===el.dataset.code&&!x.merged_into))return;
    themeUI.editCode=el.dataset.code;themeUI.error="";render();return;
  }
  if(a==="admin-theme-remove"&&themeUI.assetId){
    const current=themeUI.links[themeUI.assetId]||[];
    const code=el.dataset.code,asset=themeUI.assetId;
    if(!current.includes(code)||current.length<=1||themeUI.busy)return;
    void performThemeMutation((client,uid)=>removeAssetTheme(client,uid,asset,code),
      state.language==="fr"?"Thème retiré de la fiche.":"Theme removed from asset.");
    return;
  }
  if(a==="admin-bank-view"){
    if(!canOpenAdmin()||!["list","small","medium"].includes(el.dataset.view))return;
    bankView=el.dataset.view;store("pictau-admin-bank-view",bankView);render();return;
  }
  if(a==="admin-rename"){openBankRename(el.dataset.id);return;}
  if(a==="admin-rename-cancel"){if(!bankRename.busy){clearBankRename();render();}return;}
  if(a==="catalog-unpublish"){
    if(!canOpenAdmin()||publishedCatalog.publishing)return;
    const asset=privateBank.items.find(x=>x.id===el.dataset.id);
    if(!asset||asset.status!=="published")return;
    if(!window.confirm(state.language==="fr"?"Retirer ce pictogramme de tous les catalogues clients ?":"Remove this pictogram from all client catalogues?"))return;
    publishedCatalog.publishing=true;publishedCatalog.publishError="";publishedCatalog.publishMessage="";render();
    const uid=authStatus.user.id;
    void (async()=>{
      try{
        const client=await supabaseClient();
        await unpublishReviewedPictogram(client,uid,asset.id);
        if(authStatus.user?.id!==uid)return;
        publishedCatalog.publishMessage=state.language==="fr"?"Pictogramme retiré. Le brouillon privé est conservé.":"Removed from client catalogue. Original draft remains private.";
        clearAdminPreview();await refreshPrivateBank(client,uid);
      }catch(error){publishedCatalog.publishError=String(error?.message||error);}
      finally{publishedCatalog.publishing=false;render();}
    })();return;
  }
  if(a==="admin-preview"){if(!canOpenAdmin())return;void openAdminPreview(el.dataset.id);return;}
  if(a==="close-admin-preview"){clearAdminPreview();render();return;}
  if(a==="download-admin-preview"){
    if(!canOpenAdmin()||!privatePreview.url||!privatePreview.asset)return;
    const file=document.createElement("a");
    const base=String(privatePreview.asset.title_fr||"picto").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9_-]+/g,"-").slice(0,65);
    file.href=privatePreview.url;file.download=(base||"pictau")+".png";
    document.body.appendChild(file);file.click();file.remove();return;
  }
  if(a==="admin-edit-draft"){openDraftEditor(el.dataset.id);return;}
  if(a==="close-admin-edit"){clearDraftEditor();render();return;}
  if(a==="export-admin-proposal"){exportDraftProposal();return;}
  if(a==="refresh-admin-bank"){
    if(!canOpenAdmin() || !authStatus.user)return;
    clearAdminPreview();clearDraftEditor();clearBankRename();queueAdminBankRefresh();return;
  }
  if(a==="admin-bank-page"){
    if(!canOpenAdmin()||privateBank.loading)return;
    const lastPage=Math.max(0,Math.ceil(privateBank.total/ADMIN_BANK_PAGE_SIZE)-1);
    const next=privateBank.page+(el.dataset.direction==="next"?1:el.dataset.direction==="previous"?-1:0);
    if(next===privateBank.page||next<0||next>lastPage)return;
    privateBank.page=next;clearAdminPreview();clearDraftEditor();clearBankRename();queueAdminBankRefresh();return;
  }
  if(a==="save"){if(!validatePreset(state.currentPreset)){notify(T("unavailable"));return;}state.savedPreset={...state.currentPreset};store("pictau-preset",serializeVersionedPreset(state.savedPreset,DEFAULT_PRESET,validatePreset));notify(T("saved"));}
  if(a==="restore"){state.currentPreset={...state.savedPreset};notify(T("restored"));}
});
root.addEventListener("input",function(event){
  if(recordComposerCaption(event.target))return;
  if(recordComposerFormValue(event.target))return;
  if(event.target.closest('form[data-form="admin-bank-rename"]')&&event.target.name==="adminName"){
    bankRename.value=event.target.value;bankRename.error="";return;
  }
  if(event.target.closest('form[data-form="customer-request"]')&&["subject","description"].includes(event.target.name)){
    customerRequests.form[event.target.name]=event.target.value;return;
  }
  if(event.target.closest('form[data-form="admin-edit-draft"]')&&["titleFr","titleEn"].includes(event.target.name)){
    if(!canOpenAdmin()||!draftEditor.id)return;
    draftEditor.form[event.target.name]=event.target.value;
    draftEditor.error="";draftEditor.message="";
    const previewLabel=document.querySelector("#edit-draft-preview");
    if(previewLabel&&event.target.name==="titleFr")previewLabel.textContent=event.target.value||"—";
    return;
  }
  if(event.target.closest('form[data-form="admin-import"]') && ["titleFr","titleEn"].includes(event.target.name)){
    privateImport.draft[event.target.name]=event.target.value;return;
  }
  const field=event.target.dataset.input;
  if(field==="routine-pdf-title"){state.routinePdfTitle=event.target.value;return;}
  if(field==="board-title"){
    state.boardTitle=event.target.value.slice(0,80);saveDemoBoard();
    const actual=(state.boardTitle||"").trim()||(state.language==="fr"?"Mon tableau":"My board");
    const heading=document.querySelector("#board-current-title");
    if(heading)heading.textContent=actual;
    const printHeading=document.querySelector(".board-print-title");
    if(printHeading)printHeading.textContent=actual;
    return;
  }
  if(field==="admin-bank-search" && canOpenAdmin()){
    bankFilters.query=event.target.value;privateBank.page=0;
    clearAdminPreview();clearDraftEditor();clearBankRename();
    try{normalizeAdminBankFilters({...bankFilters,page:0});queueAdminBankRefresh(300);}
    catch(error){
      clearTimeout(bankQueryTimer);bankQueryTimer=null;
      ++privateBank.request;privateBank.loading=false;privateBank.items=[];privateBank.total=0;
      privateBank.error=String(error?.message||error);render();
    }
    safeFocusAdminSearch();return;
  }
  if(field==="client-search"){const value=event.target.value;const pos=event.target.selectionStart;state.search=value;render();const next=root.querySelector("#pa-client-search");if(next){next.focus();next.setSelectionRange(pos,pos);}return;}
  if(field==="search"){state.search=event.target.value;render();safeFocusSearch();return;}
  if(field==="admin-range"){const k=event.target.dataset.key;state.currentPreset[k]=Number(event.target.value);const o=document.querySelector("#out-"+k);if(o)o.textContent=fmt(state.currentPreset[k])+" "+(k==="fontPt"?"pt":k==="artPercent"?"%":"mm");adminLive();return;}
  if(event.target.dataset.field==="size"){state.widthCm=clampWidth(event.target.value);routineLive();}
});
root.addEventListener("submit",function(event){
  if(event.target.matches('form[data-form="email-login"]')){
    event.preventDefault();
    if(authStatus.emailBusy||authStatus.user)return;
    const data=new FormData(event.target);
    const email=String(data.get("email")||"").trim(),password=String(data.get("password")||"");
    authStatus.email=email;authStatus.emailBusy=true;authStatus.emailError="";authStatus.emailMessage="";
    render();
    void loginWithEmail(email,password).catch(()=>{
      authStatus.emailError=state.language==="fr"?"Connexion impossible. Vérifiez votre courriel, votre mot de passe et l’activation du compte.":"Unable to sign in. Check your email, password and account status.";
    }).finally(()=>{authStatus.emailBusy=false;render();});
    return;
  }
  if(event.target.matches('form[data-form="email-update-password"]')){
    event.preventDefault();
    if(authStatus.emailBusy||!authStatus.user||!authStatus.recovery)return;
    const password=String(new FormData(event.target).get("password")||"");
    authStatus.emailBusy=true;authStatus.emailError="";render();
    void updateEmailPassword(password).then(()=>{
      authStatus.recovery=false;authStatus.emailMessage="";
    }).catch(()=>{authStatus.emailError=state.language==="fr"?"Impossible d’enregistrer le nouveau mot de passe.":"Unable to save the new password.";})
      .finally(()=>{authStatus.emailBusy=false;render();});
    return;
  }
  if(event.target.matches('form[data-form="catalog-filter"]')){
    event.preventDefault();if(!SITE_EMBEDDED||!authStatus.user||canOpenAdmin())return;
    const query=String(new FormData(event.target).get("query")||event.target.querySelector("#pa-client-search")?.value||"").slice(0,80);
    state.search=query;publishedCatalog.page=0;void fetchPublishedCatalog();return;
  }
  const publishForm=event.target.closest('form[data-form="catalog-publish"]');
  if(publishForm){
    event.preventDefault();
    if(!canOpenAdmin()||publishedCatalog.publishing||!publishForm.querySelector('[name="confirmed"]')?.checked)return;
    const asset=privateBank.items.find(x=>x.id===publishForm.dataset.id);
    if(!asset||asset.status!=="draft"||privatePreview.asset?.id!==asset.id||!privatePreview.technical)return;
    if(!window.confirm(state.language==="fr"?"Confirmer la publication de cette image approuvée dans le catalogue des clients ?":"Publish this reviewed picture to the client catalogue?"))return;
    publishedCatalog.publishing=true;publishedCatalog.publishError="";publishedCatalog.publishMessage="";
    const uid=authStatus.user.id;render();
    void (async()=>{
      try{
        const client=await supabaseClient();
        await publishReviewedPictogram(client,uid,asset.id);
        if(authStatus.user?.id!==uid)return;
        publishedCatalog.publishMessage=state.language==="fr"?"Publication confirmée par le serveur.":"Publication confirmed by the server.";
        clearAdminPreview();
        await refreshPrivateBank(client,uid);
      }catch(error){if(authStatus.user?.id===uid)publishedCatalog.publishError=String(error?.message||error);}
      finally{publishedCatalog.publishing=false;render();}
    })();return;
  }
  const usedForm=event.target.closest('form[data-form="used-filter"]');
  if(usedForm){
    event.preventDefault();
    if(!SITE_EMBEDDED||!authStatus.user||canOpenAdmin()||usedPictos.loading||usedPictos.adding)return;
    const data=new FormData(usedForm);
    usedPictos.query=String(data.get("query")||"");
    usedPictos.sort=String(data.get("sort")||"recent");
    usedPictos.theme=String(data.get("theme")||"all");
    usedPictos.page=0;void fetchUsedPictos();return;
  }
  const officialForm=event.target.closest('form[data-form="approved-export"]');
  if(officialForm){
    event.preventDefault();
    if(!SITE_EMBEDDED||!authStatus.user||canOpenAdmin()||officialComposer.busy||editableDrafts.busy||editableDrafts.copyKind||pendingGeneratedPdf)return;
    const kind=officialForm.dataset.kind;
    if(!["routine","board"].includes(kind))return;
    if(draftAutosave.status(kind).conflict){
      officialComposer.error=state.language==="fr"?
        "Conflit de brouillon : enregistrez une copie avant de créer le PDF, afin de conserver les deux versions.":
        "Draft conflict: save a new copy before creating the PDF so both versions are preserved.";
      render();return;
    }
    // Ne jamais exporter pendant qu'une écriture d'autosave est déjà partie.
    // Le bouton est désactivé visuellement, mais l'événement submit doit aussi le vérifier.
    if(draftAutosave.status(kind).busy){
      officialComposer.error=state.language==="fr"?
        "Un brouillon est en cours d'enregistrement. Réessayez après sa confirmation.":
        "A draft is being saved. Try again after it is confirmed.";
      render();return;
    }
    const invalidCaption=root.querySelector('.pa-composer-item [data-input="official-caption"]:invalid');
    if(invalidCaption){invalidCaption.reportValidity();return;}
    const data=new FormData(officialForm),title=String(data.get("title")||""),
      widthCm=Number(data.get("widthCm")),paper=String(data.get("paper")||"letter"),
      columns=kind==="board"?Number(data.get("columns")):3,
      snapshot=officialComposer[kind].map(x=>({...x})),uid=authStatus.user.id,
      epoch=++officialComposer.request,sourcePage=state.page,
      navigation=clientNavigationEpoch;
    if(!canPrepareApproved({kind,items:snapshot,widthCm,paper,columns})){
      officialComposer.error=state.language==="fr"?
        "Dimensions incompatibles avec la page imprimable. Réduisez la largeur ou le nombre de cases.":
        "Cells do not fit the printable page. Reduce the width or number of images.";
      render();return;
    }
    draftAutosave.pause(kind);
    officialComposer.busy=true;officialComposer.error="";render();
    void(async()=>{
      try{
        const client=await supabaseClient();
        const permission=await readCaptionPermission(client,uid);
        if(authStatus.user?.id!==uid||epoch!==officialComposer.request)return;
        captionFeature.enabled=permission.enabled;captionFeature.loaded=true;
        const rows=await loadApprovedSelection(client,uid,snapshot.map(x=>x.id));
        const items=[];
        for(const row of rows){
          const pngBlob=await downloadPublishedArtwork(client,uid,row);
          const position=items.length;
          const customLabel=snapshot[position]?.customLabel;
          const label=permission.enabled&&typeof customLabel==="string"&&customLabel.trim()?customLabel:null;
          items.push({fr:label||row.title_fr,en:label||(row.title_en||row.title_fr),pngBlob});
        }
        if(authStatus.user?.id!==uid||epoch!==officialComposer.request)return;
        // Une version éditable est enregistrée AVANT le PDF figé.
        // Un conflit de version stoppe l'export sans écraser un autre appareil.
        const savedDraft=await saveEditableDraft(client,uid,{
          kind,items:snapshot,settings:{...officialComposer.settings[kind],title,
            widthCm:String(widthCm),paper,columns:String(columns)}
        },editableDrafts.current[kind]||{});
        if(authStatus.user?.id!==uid||epoch!==officialComposer.request)return;
        editableDrafts.current[kind]={id:savedDraft.id,revision:savedDraft.revision};
        draftAutosave.discard(kind,{confirmed:true});
        editableDrafts.dirty[kind]=false;
        const beforePdf=await readCaptionPermission(client,uid);
        if(!beforePdf.enabled){
          for(let i=0;i<items.length;i++){
            items[i].fr=rows[i].title_fr;
            items[i].en=rows[i].title_en||rows[i].title_fr;
          }
        }
        if(authStatus.user?.id!==uid||epoch!==officialComposer.request)return;
        const {blob,pageCount}=await createPreparedPdf({
          items,kind,widthCm,paper,columns,language:state.language,title,
          separatorMode:"simple",preset:{...DEFAULT_PRESET,color:"#111111",colored:false}
        });
        if(authStatus.user?.id!==uid||epoch!==officialComposer.request)return;
        pdfRecoveryError="";
        pendingGeneratedPdf={uid,blob,pageCount,title,documentType:kind,sourceDraftId:savedDraft.id,
          documentId:crypto.randomUUID()};
        await archivePdf(client,uid,blob,{title,documentType:kind,pageCount,
          sourceDraftId:savedDraft.id,documentId:pendingGeneratedPdf.documentId});
        if(pendingGeneratedPdf?.blob===blob)pendingGeneratedPdf=null;
        if(authStatus.user?.id!==uid||epoch!==officialComposer.request)return;
        // L'archivage a réellement réussi, même si l'utilisateur s'est déplacé.
        // Dans ce cas, conserver sa composition/source éditable et SA page;
        // la confirmation sera disponible quand il ouvrira « Mes créations ».
        editableDrafts.loaded=false;
        clientFiles.message=state.language==="fr"?
          "PDF original créé et archivé dans votre compte.":
          "Original PDF created and saved in your account.";
        if(shouldOpenArchivedPdf({
          uid,activeUid:authStatus.user?.id,request:epoch,
          activeRequest:officialComposer.request,sourcePage,currentPage:state.page,
          navigation,activeNavigation:clientNavigationEpoch
        })){
          officialComposer[kind]=[];
          officialComposer.settings[kind]=emptyComposerSettings()[kind];
          editableDrafts.current[kind]=null;draftAutosave.discard(kind);
          editableDrafts.dirty[kind]=false;
          state.page="files";
          clientFiles.page=0;clientFiles.query="";clientFiles.type="all";clientFiles.sort="recent";
          await fetchClientFiles(client,uid);
        }
      }catch(error){
        if(authStatus.user?.id===uid&&epoch===officialComposer.request)
          officialComposer.error=String(error?.message||error);
      }finally{
        if(authStatus.user?.id===uid&&epoch===officialComposer.request){
          officialComposer.busy=false;
          draftAutosave.resume(kind);
          render();
        }
      }
    })();return;
  }
  const uploadForm=event.target.closest('form[data-form="archive-pdf"]');
  if(uploadForm){
    event.preventDefault();
    // Tant qu'un original attend sa confirmation, ne pas remplacer sa copie
    // en mémoire par un nouveau fichier ni créer un UUID concurrent.
    if(!authStatus.user||clientFiles.busy||pdfRecoveryBusy||
      pendingGeneratedPdf?.uid===authStatus.user.id)return;
    const data=new FormData(uploadForm),file=data.get("pdf"),
      title=String(data.get("title")||""),documentType=String(data.get("documentType")||"routine"),
      uid=authStatus.user.id,epoch=++clientFiles.request;
    clientFiles.draft={title,documentType};clientFiles.error="";clientFiles.message="";
    clientFiles.busy=true;render();
    void(async()=>{
      try{
        // Ne conserver un fichier récupérable que s'il s'agit bien d'un PDF.
        // Le transfert normal et toutes les reprises gardent le même ID privé.
        await validatePdfBlob(file);
        const cleanTitle=normalizeDocumentTitle(title);
        if(!["routine","board","sheet"].includes(documentType))
          throw Error("Type de PDF invalide.");
        if(authStatus.user?.id!==uid||clientFiles.request!==epoch)return;
        const pending={blob:file,uid,title:cleanTitle,documentType,pageCount:null,
          sourceDraftId:null,documentId:crypto.randomUUID(),imported:true};
        pendingGeneratedPdf=pending;pdfRecoveryError="";
        const client=await supabaseClient();
        await archivePdf(client,uid,file,{title:cleanTitle,documentType,documentId:pending.documentId});
        if(authStatus.user?.id!==uid||clientFiles.request!==epoch)return;
        if(pendingGeneratedPdf===pending)pendingGeneratedPdf=null;
        clientFiles.busy=false;clientFiles.draft={title:"",documentType:"routine"};
        clientFiles.message=state.language==="fr"?
          "PDF original archivé dans votre compte. Retrouvez-le sur tout appareil connecté.":
          "Original PDF archived in your account. Find it on any signed-in device.";
        clientFiles.page=0;clientFiles.query="";clientFiles.type="all";clientFiles.sort="recent";
        await fetchClientFiles(client,uid);
      }catch(error){
        if(authStatus.user?.id===uid&&clientFiles.request===epoch)
          clientFiles.error=String(error?.message||error);
      }finally{
        if(authStatus.user?.id===uid&&clientFiles.request===epoch){clientFiles.busy=false;render();}
      }
    })();return;
  }
  const filterForm=event.target.closest('form[data-form="files-filter"]');
  if(filterForm){
    event.preventDefault();if(!authStatus.user||clientFiles.busy)return;
    const data=new FormData(filterForm);
    clientFiles.query=String(data.get("query")||"");
    clientFiles.type=String(data.get("type")||"all");
    clientFiles.sort=String(data.get("sort")||"recent");
    clientFiles.page=0;clientFiles.renameId=null;refreshFilesForCurrentUser();return;
  }
  const renameForm=event.target.closest('form[data-form="files-rename"]');
  if(renameForm){
    event.preventDefault();
    if(!authStatus.user||clientFiles.busy)return;
    const id=renameForm.dataset.id,doc=clientFiles.items.find(d=>d.id===id);
    if(!doc)return;
    const title=String(new FormData(renameForm).get("title")||""),
      uid=authStatus.user.id,epoch=++clientFiles.request;
    clientFiles.busy=true;clientFiles.error="";render();
    void(async()=>{
      try{
        const client=await supabaseClient();
        await renameMyDocument(client,uid,id,doc.title,title);
        if(clientFiles.request!==epoch||authStatus.user?.id!==uid)return;
        clientFiles.busy=false;clientFiles.renameId=null;
        clientFiles.message=state.language==="fr"?"Nom mis à jour. Le PDF original est inchangé.":"Name updated. Original PDF unchanged.";
        await fetchClientFiles(client,uid);
      }catch(error){
        if(clientFiles.request===epoch&&authStatus.user?.id===uid)clientFiles.error=String(error?.message||error);
      }finally{
        if(clientFiles.request===epoch&&authStatus.user?.id===uid){clientFiles.busy=false;render();}
      }
    })();return;
  }

  const themeForm=event.target.closest('form[data-form^="admin-theme-"]');
  if(themeForm){
    event.preventDefault();
    if(!canOpenAdmin()||themeUI.busy)return;
    const data=new FormData(themeForm),kind=themeForm.dataset.form;
    if(kind==="admin-theme-create"){
      const code=String(data.get("code")||""),fr=String(data.get("fr")||""),en=String(data.get("en")||"");
      void performThemeMutation((client,uid)=>createTheme(client,uid,code,fr,en),
        state.language==="fr"?"Thème créé.":"Theme created.");
    }else if(kind==="admin-theme-edit"){
      const prev=themeUI.items.find(x=>x.code===themeUI.editCode&&!x.merged_into);
      if(!prev)return;
      const fr=String(data.get("fr")||""),en=String(data.get("en")||"");
      void performThemeMutation((client,uid)=>editThemeLabels(client,uid,prev.code,prev.label_fr,prev.label_en,fr,en),
        state.language==="fr"?"Noms du thème enregistrés.":"Theme labels saved.");
    }else if(kind==="admin-theme-merge"){
      if(data.get("confirmed")!=="on")return;
      const source=String(data.get("source")||""),target=String(data.get("target")||"");
      if(source===target){themeUI.error=state.language==="fr"?"Choisissez deux thèmes différents.":"Choose two different themes.";render();return;}
      void performThemeMutation(async(client,uid)=>{
        await mergeThemes(client,uid,source,target);
        themeUI.editCode="";
        if(bankFilters.theme===source){bankFilters.theme=target;privateBank.page=0;}
        if(privateImport.draft.theme===source)privateImport.draft.theme="autres";
      },state.language==="fr"?"Thèmes fusionnés sans supprimer les images.":"Themes merged without deleting images.");
    }else if(kind==="admin-theme-add"){
      const code=String(data.get("code")||""),asset=themeUI.assetId;
      const selected=themeUI.links[asset]||[];
      if(!asset||selected.includes(code)||selected.length>=MAX_THEMES_PER_ASSET)return;
      void performThemeMutation((client,uid)=>addAssetTheme(client,uid,asset,code),
        state.language==="fr"?"Thème ajouté à l’image.":"Theme added to image.");
    }
    return;
  }

  const nameForm=event.target.closest('form[data-form="admin-bank-rename"]');
  if(nameForm){
    event.preventDefault();
    if(!canOpenAdmin()||!authStatus.user||!bankRename.id||bankRename.busy)return;
    const id=bankRename.id,uid=authStatus.user.id,ticket=++bankRename.request;
    const name=String(new FormData(nameForm).get("adminName")??"");
    bankRename.value=name;bankRename.busy=true;bankRename.error="";render();
    void(async()=>{
      try{
        const client=await supabaseClient();
        const result=await renameAdminAsset(client,uid,id,bankRename.expected,name);
        if(ticket!==bankRename.request||authStatus.user?.id!==uid||!canOpenAdmin())return;
        const item=privateBank.items.find(asset=>asset.id===id);
        if(item)item.admin_name=result.admin_name;
        clearBankRename();
        if(result.changed)queueAdminBankRefresh(); // réévaluer le tri et la recherche sur toute la base
        notify(state.language==="fr"?(result.changed?"Nom administratif enregistré.":"Nom inchangé."):
          (result.changed?"Administrative name saved.":"Name unchanged."));
      }catch(error){
        if(ticket!==bankRename.request||authStatus.user?.id!==uid)return;
        bankRename.error=String(error?.message||error);
      }finally{if(ticket===bankRename.request){bankRename.busy=false;render();}}
    })();return;
  }
  const clientForm=event.target.closest('form[data-form="customer-request"]');
  if(clientForm){
    event.preventDefault();
    if(!authStatus.user||customerRequests.submitting)return;
    const form=new FormData(clientForm);
    const values={subject:form.get("subject"),description:form.get("description"),theme:form.get("theme")};
    customerRequests.form=values;customerRequests.error="";customerRequests.message="";
    try{validateRequestForm(values);}catch(error){customerRequests.error=String(error?.message||error);render();return;}
    const uid=authStatus.user.id,request=++customerRequests.request;
    customerRequests.submitting=true;render();
    void (async()=>{
      try{
        const client=await supabaseClient();
        await submitPictogramRequest(client,uid,values);
        if(authStatus.user?.id!==uid||request!==customerRequests.request)return;
        customerRequests.form={subject:"",description:"",theme:""};
        customerRequests.page=0;customerRequests.view="mine";
        customerRequests.message=state.language==="fr"?"Demande enregistrée dans votre compte. Elle ne crée pas automatiquement de pictogramme.":"Request saved to your account. No pictogram was created automatically.";
        customerRequests.submitting=false;await fetchCustomerRequests(client,uid);
      }catch(error){
        if(authStatus.user?.id!==uid||request!==customerRequests.request)return;
        customerRequests.error=String(error?.message||error);
      }finally{if(authStatus.user?.id===uid&&request===customerRequests.request){customerRequests.submitting=false;render();}}
    })();return;
  }
  const requestFilter=event.target.closest('form[data-form="admin-requests-filter"]');
  if(requestFilter){
    event.preventDefault();
    if(!canOpenAdmin()||!authStatus.user)return;
    const form=new FormData(requestFilter);
    adminRequests.query=String(form.get("query")||"");
    adminRequests.status=String(form.get("status")||"all");
    adminRequests.sort=String(form.get("sort")||"recent");
    adminRequests.page=0;adminRequests.selectedId=null;adminRequests.saved="";
    void supabaseClient().then(client=>fetchAdminRequests(client,authStatus.user.id));return;
  }
  const adminUpdate=event.target.closest('form[data-form="admin-request-update"]');
  if(adminUpdate){
    event.preventDefault();
    if(!canOpenAdmin()||!authStatus.user||adminRequests.saving||!adminRequests.selectedId)return;
    const data=new FormData(adminUpdate),uid=authStatus.user.id,id=adminRequests.selectedId;
    const body={status:String(data.get("status")||""),adminNote:String(data.get("adminNote")||""),
      linkedAssetId:String(data.get("linkedAssetId")||"").trim()||null};
    adminRequests.draft={status:body.status,adminNote:body.adminNote,linkedAssetId:body.linkedAssetId||""};
    const ticket=++adminRequests.request;
    adminRequests.saving=true;adminRequests.error="";adminRequests.saved="";render();
    void (async()=>{
      try{
        const client=await supabaseClient();
        await updateAdminPictogramRequest(client,uid,id,body);
        if(authStatus.user?.id!==uid||ticket!==adminRequests.request)return;
        adminRequests.saving=false;adminRequests.selectedId=null;
        adminRequests.saved=state.language==="fr"?"Suivi enregistré sur le serveur. Aucune publication automatique.":"Follow-up saved on the server. No automatic publishing.";
        await fetchAdminRequests(client,uid);
      }catch(error){
        if(authStatus.user?.id!==uid||ticket!==adminRequests.request)return;
        adminRequests.error=String(error?.message||error);
      }finally{if(authStatus.user?.id===uid&&ticket===adminRequests.request){adminRequests.saving=false;render();}}
    })();return;
  }
  const reviewForm=event.target.closest('form[data-form="admin-edit-draft"]');
  if(reviewForm){
    event.preventDefault();
    if(!DRAFT_METADATA_WRITES_ENABLED||!canOpenAdmin()||draftEditor.saving||
       !draftEditor.id||!draftEditor.original||!authStatus.user)return;
    const data=new FormData(reviewForm);
    draftEditor.form={titleFr:data.get("titleFr"),titleEn:data.get("titleEn"),theme:data.get("theme")};
    const assetId=draftEditor.id,expected={...draftEditor.original};
    const uid=authStatus.user.id,request=++draftEditor.request;
    draftEditor.saving=true;draftEditor.error="";draftEditor.message="";render();
    void (async()=>{
      try{
        const client=await supabaseClient();
        const result=await editPrivateDraftMetadata(client,uid,assetId,expected,draftEditor.form);
        if(request!==draftEditor.request||authStatus.user?.id!==uid)return;
        draftEditor.saving=false;
        if(result.saved){clearDraftEditor();await refreshPrivateBank(client,uid);}
        else {draftEditor.message=state.language==="fr"?"Aucune modification nécessaire.":"No change needed.";}
      }catch(error){
        if(request!==draftEditor.request||authStatus.user?.id!==uid)return;
        draftEditor.error=String(error?.message||error);
      }finally{if(request===draftEditor.request){draftEditor.saving=false;render();}}
    })();
    return;
  }
  const form=event.target.closest('form[data-form="admin-import"]');
  if(!form)return;
  event.preventDefault();
  if(!canOpenAdmin()||privateImport.loading||!authStatus.user)return;
  const file=privateImport.file;
  if(!file){privateImport.error=state.language==="fr"?"Sélectionnez un fichier PNG.":"Select a PNG file.";render();return;}
  const formData=new FormData(form);
  const metadata={titleFr:formData.get("titleFr"),titleEn:formData.get("titleEn"),theme:formData.get("theme")};
  privateImport.draft={...metadata};
  const userId=authStatus.user.id,request=++privateImport.request;
  privateImport.loading=true;privateImport.error="";privateImport.message="";render();
  void (async()=>{
    try{
      const client=await supabaseClient();
      await importPrivateDraft(client,userId,file,metadata);
      if(privateImport.request!==request||authStatus.user?.id!==userId)return;
      privateImport.file=null;privateImport.draft={titleFr:"",titleEn:"",theme:"autres"};
      privateImport.message=state.language==="fr"?"Brouillon privé importé. Non publié.":"Private draft imported. Not published.";
      await refreshPrivateBank(client,userId);
    }catch(error){
      if(privateImport.request!==request||authStatus.user?.id!==userId)return;
      privateImport.error=String(error?.message||error);
    }finally{
      if(privateImport.request===request){privateImport.loading=false;render();}
    }
  })();
});
root.addEventListener("change",function(event){
  if(recordComposerCaption(event.target))return;
  if(recordComposerFormValue(event.target))return;
  if(event.target.closest('form[data-form="customer-request"]')&&event.target.name==="theme"){
    customerRequests.form.theme=event.target.value;return;
  }
  if(event.target.closest('form[data-form="admin-edit-draft"]')&&event.target.name==="theme"){
    draftEditor.form.theme=event.target.value;draftEditor.error="";draftEditor.message="";return;
  }
  if(event.target.closest('form[data-form="admin-import"]') && event.target.name==="theme"){
    privateImport.draft.theme=event.target.value;return;
  }
  if(event.target.dataset.field==="admin-import-file"){
    if(!canOpenAdmin()||privateImport.loading)return;
    privateImport.file=event.target.files?.[0]||null;
    privateImport.error="";privateImport.message="";
    const status=document.querySelector("#draft-file-status");
    if(status)status.textContent=privateImport.file?(privateImport.file.name+" · "+Math.ceil(privateImport.file.size/1024)+" Ko"):(state.language==="fr"?"Aucun fichier sélectionné":"No file selected");
    return;
  }
  const field=event.target.dataset.field;
  if(field==="board-cols"){state.boardCols=boardColumnCount(event.target.value);saveDemoBoard();render();return;}
  if(field==="board-size"){state.boardWidthCm=clampWidth(event.target.value);render();return;}
  if(field==="board-paper"){state.paper=event.target.value==="a4"?"a4":"letter";render();return;}
  if(["admin-bank-status","admin-bank-theme","admin-bank-sort"].includes(field)){
    if(!canOpenAdmin())return;
    const mapping={"admin-bank-status":"status","admin-bank-theme":"theme","admin-bank-sort":"sort"};
    bankFilters[mapping[field]]=event.target.value;privateBank.page=0;
    clearAdminPreview();clearDraftEditor();clearBankRename();queueAdminBankRefresh();return;
  }
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
  if(field==="adminSquareArtCenter")state.currentPreset.squareCenterMode=value===CENTER_WHOLE?CENTER_WHOLE:CENTER_UPPER;
  if(field==="adminColor")state.currentPreset.color=value;
  if(field==="adminFontColor")state.currentPreset.fontColor=value;
  if(field==="adminColored")state.currentPreset.colored=event.target.checked;
  render();
});
render();
void initializeGoogle();
