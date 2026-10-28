// Éditeur autosave : horloge de modifications locale, un seul envoi par type,
// aucune perte silencieuse si une autre session modifie le brouillon.
export const DRAFT_AUTOSAVE_DELAY_MS=1500;
export function createDraftAutosave({save,onState=()=>{},delay=DRAFT_AUTOSAVE_DELAY_MS,
  schedule=(fn,ms)=>setTimeout(fn,ms),cancel=handle=>clearTimeout(handle)}){
 if(typeof save!=="function"||typeof onState!=="function"||
   !Number.isFinite(delay)||delay<0)throw Error("Configuration de sauvegarde invalide.");
 const states={
   routine:{epoch:0,version:0,dirty:false,busy:false,blocked:false,retryOnEdit:false,failed:"",timer:null,inflight:null,confirmed:false},
   board:{epoch:0,version:0,dirty:false,busy:false,blocked:false,retryOnEdit:false,failed:"",timer:null,inflight:null,confirmed:false}
 };
 const valid=k=>{if(!Object.hasOwn(states,k))throw Error("Type de brouillon invalide.");return states[k];};
 function view(k){const s=valid(k);return {dirty:s.dirty,busy:s.busy,blocked:s.blocked,
   failed:s.failed,confirmed:s.confirmed,version:s.version};}
 function notify(k){onState(k,view(k));}
 function clear(s){if(s.timer!==null){cancel(s.timer);s.timer=null;}}
 function queue(k){
   const s=valid(k);clear(s);
   if(!s.dirty||s.blocked||s.busy)return;
   s.timer=schedule(()=>{s.timer=null;void flush(k);},delay);
 }
 function change(k){
   const s=valid(k);s.version++;s.dirty=true;s.confirmed=false;
   if(s.retryOnEdit){s.blocked=false;s.retryOnEdit=false;}
   if(!s.blocked)s.failed="";
   queue(k);notify(k);return view(k);
 }
 async function flush(k,{force=false}={}){
   const s=valid(k);
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
       s.dirty=true;s.blocked=true;s.confirmed=false;
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
   const s=valid(k);clear(s);s.epoch++;s.version++;
   s.dirty=false;s.busy=false;s.blocked=false;s.retryOnEdit=false;s.failed="";
   s.inflight=null;s.confirmed=Boolean(confirmed);notify(k);
 }
 function pause(k){clear(valid(k));}
 function resume(k){queue(k);}
 function reset(){for(const k of Object.keys(states))discard(k);}
 return {change,flush,pause,resume,discard,reset,status:view};
}
