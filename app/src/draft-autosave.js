// Éditeur autosave : horloge de modifications locale, un seul envoi par type,
// aucune perte silencieuse si une autre session modifie le brouillon.
export const DRAFT_AUTOSAVE_DELAY_MS=1500;
export function createDraftAutosave({save,onState=()=>{},delay=DRAFT_AUTOSAVE_DELAY_MS,
  schedule=(fn,ms)=>setTimeout(fn,ms),cancel=handle=>clearTimeout(handle)}){
 if(typeof save!=="function"||typeof onState!=="function"||
   !Number.isFinite(delay)||delay<0)throw Error("Configuration de sauvegarde invalide.");
 const states={
   routine:{epoch:0,version:0,pauseId:0,dirty:false,busy:false,paused:false,blocked:false,conflict:false,retryOnEdit:false,failed:"",timer:null,inflight:null,confirmed:false},
   board:{epoch:0,version:0,pauseId:0,dirty:false,busy:false,paused:false,blocked:false,conflict:false,retryOnEdit:false,failed:"",timer:null,inflight:null,confirmed:false}
 };
 const valid=k=>{if(!Object.hasOwn(states,k))throw Error("Type de brouillon invalide.");return states[k];};
 function view(k){const s=valid(k);return {dirty:s.dirty,busy:s.busy,paused:s.paused,pauseId:s.pauseId,blocked:s.blocked,conflict:s.conflict,
   failed:s.failed,confirmed:s.confirmed,version:s.version};}
 function notify(k){onState(k,view(k));}
 function clear(s){if(s.timer!==null){cancel(s.timer);s.timer=null;}}
 function queue(k){
   const s=valid(k);clear(s);
   if(!s.dirty||s.blocked||s.busy||s.paused)return;
   s.timer=schedule(()=>{s.timer=null;void flush(k);},delay);
 }
 function change(k){
   const s=valid(k);s.version++;s.dirty=true;s.confirmed=false;
   if(s.retryOnEdit){s.blocked=false;s.conflict=false;s.retryOnEdit=false;}
   if(!s.blocked)s.failed="";
   queue(k);notify(k);return view(k);
 }
 async function flush(k,{force=false}={}){
   const s=valid(k);
   // Une sauvegarde en arrière-plan ne doit pas redémarrer pendant l'export PDF.
   if(s.paused){notify(k);return false;}
   // Un refus de révision CAS ne se résout pas en réécrivant le même ID.
   // Même un flush manuel "force" doit respecter le conflit multiappareils.
   // Seule une ouverture explicite d'une autre version ou une copie validée le résout.
   if(s.conflict){notify(k);return false;}
   if(force){s.blocked=false;s.retryOnEdit=false;s.failed="";}
   clear(s);
   if(!s.dirty||s.blocked){notify(k);return false;}
   if(s.busy){notify(k);return s.inflight;}
   const epoch=s.epoch,version=s.version;
   s.busy=true;s.failed="";notify(k);
   const work=(async()=>{
     try{
       await save(k,{epoch,version});
       if(s.epoch!==epoch)return false;
       if(s.version===version){s.dirty=false;s.confirmed=true;s.failed="";}
       else{s.dirty=true;s.confirmed=false;}
       return true;
     }catch(error){
       if(s.epoch!==epoch)return false;
       s.dirty=true;s.blocked=true;s.conflict=error?.code==="DRAFT_REVISION_CONFLICT";s.confirmed=false;
       s.retryOnEdit=error?.autosaveRetryOnEdit===true;
       s.failed=String(error?.message||error||"Sauvegarde impossible.");
       return false;
     }finally{
       if(s.epoch===epoch){
         s.busy=false;s.inflight=null;
         if(s.dirty&&!s.blocked)queue(k);
         notify(k);
       }
     }
   })();
   s.inflight=work;
   return work;
 }
 function discard(k,{confirmed=false}={}){
   const s=valid(k);clear(s);s.epoch++;s.version++;s.pauseId++;
   s.dirty=false;s.busy=false;s.paused=false;s.blocked=false;s.conflict=false;s.retryOnEdit=false;s.failed="";
   s.inflight=null;s.confirmed=Boolean(confirmed);notify(k);
 }
 function pause(k){const s=valid(k);s.pauseId++;s.paused=true;clear(s);notify(k);}
 function resume(k){const s=valid(k);s.pauseId++;s.paused=false;queue(k);notify(k);}

 function reset(){for(const k of Object.keys(states))discard(k);}
 return {change,flush,pause,resume,discard,reset,status:view};
}


/**
 * Sécurise le remplacement d'une composition en cours d'édition.
 * Suspend les sauvegardes différées du type remplacé pendant la lecture privée,
 * puis annule proprement la suspension en cas d'échec, de changement de compte
 * ou de nouvelle frappe. Le type non remplacé reste intact.
 */
export function beginDraftReplacement(autosave,kind,{confirmDiscard=()=>false,onBusy=()=>{}}={}){
 if(!autosave||!["routine","board"].includes(kind)||
   typeof confirmDiscard!=="function"||typeof onBusy!=="function")
   throw Error("Ouverture de brouillon invalide.");
 const before=autosave.status(kind);
 if(before.busy||before.paused){onBusy();return null;}
 if(before.dirty&&!confirmDiscard())return null;
 autosave.pause(kind);
 const version=before.version,pauseId=autosave.status(kind).pauseId;
 let finished=false;
 function current(){
   const status=autosave.status(kind);
   return !finished&&status.paused&&status.pauseId===pauseId&&!status.busy&&status.version===version;
 }
 return {
   current,
   complete(){
     if(!current())return false;
     finished=true;
     autosave.discard(kind,{confirmed:true});
     return true;
   },
   cancel(){
     if(finished)return;
     finished=true;
     const status=autosave.status(kind);
     if(status.paused&&status.pauseId===pauseId)autosave.resume(kind);
   }
 };
}


/**
 * Supprimer un brouillon n'est pas équivalent à enregistrer une copie.
 * Si le brouillon est actuellement ouvert, la suppression suspend son autosave,
 * demande une unique confirmation et refuse une écriture déjà en cours.
 * Un brouillon seulement présent dans la liste ne modifie jamais l'éditeur actif.
 */
export function beginDraftDeletion(autosave,kind,{
  isOpen=false,confirmDelete=()=>false,onBusy=()=>{}
}={}){
 if(!autosave||!["routine","board"].includes(kind)||
   typeof confirmDelete!=="function"||typeof onBusy!=="function")
   throw Error("Suppression de brouillon invalide.");
 if(!isOpen){
   if(!confirmDelete(false))return null;
   return {current:()=>true,complete:()=>true,cancel:()=>{}};
 }
 const status=autosave.status(kind);
 if(status.busy||status.paused){onBusy();return null;}
 if(!confirmDelete(status.dirty))return null;
 return beginDraftReplacement(autosave,kind,{confirmDiscard:()=>true,onBusy});
}
