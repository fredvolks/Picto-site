import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {readAdminLibraryReadiness} from "../app/src/admin-library-readiness.js";

const owner="11111111-1111-4111-8111-111111111111";
const other="22222222-2222-4222-8222-222222222222";
function fixture({userSequence=[owner],isAdmin=true,drafts=3,published=0,links=0,
 templatePrivate=1,templatePublished=0,templateError=null,
 guard=true,guardError=null,projectionError=null,countsError=null}={}){
  const calls=[];let n=0;
  const client={
    auth:{getUser:async()=>{calls.push(["auth"]);return{data:{user:{id:userSequence[Math.min(n++,userSequence.length-1)]}},error:null};}},
    rpc:async name=>{calls.push(["rpc",name]);return{data:guard,error:guardError};},
    from(table){
      calls.push(["from",table]);
      if(table==="pictau_admins")
        return{select:()=>({eq:()=>({maybeSingle:async()=>({data:isAdmin?{user_id:owner}:null,error:null})})})};
      const count=table==="pictau_assets"?drafts:table==="pictau_catalog_items"?published:
        table==="pictau_templates"?templatePrivate:links;
      const answer={data:null,count,error:table==="pictau_published_theme_links"?projectionError:countsError};
      const q={
        eq(k,v){
          calls.push(["eq",table,k,v]);
          if(table==="pictau_templates"&&k==="is_published")
            return Promise.resolve({...answer,
              count:v?templatePublished:templatePrivate,error:templateError??countsError});
          return Promise.resolve(answer);
        },
        then(ok,fail){return Promise.resolve(answer).then(ok,fail);}
      };
      return{select:(cols,options)=>{calls.push(["select",table,cols,options]);return q;}};
    }
  };
  return {client,calls};
}
test("Readiness reports verified counts and server capabilities, never grants publication",async()=>{
 const {client,calls}=fixture();
 const x=await readAdminLibraryReadiness(client,owner);
 assert.deepEqual(x,{drafts:3,published:0,guard:"available",projection:"available",
   templates:{state:"available",private:1,published:0},
   clientRlsVerified:false,imagesApprovedByHuman:false});
 assert.equal(calls.filter(x=>x[0]==="auth").length,2);
 assert.equal(calls.filter(x=>x[0]==="rpc").length,1);
 assert.ok(calls.some(x=>x[0]==="eq"&&x[1]==="pictau_assets"&&x[2]==="status"&&x[3]==="draft"));
 assert.ok(calls.every(x=>!["insert","update","delete","upload"].includes(x[0])));
 assert.deepEqual(calls.filter(x=>x[0]==="select"&&x[1]==="pictau_published_theme_links").map(x=>x[2]),["catalog_id"]);
 assert.ok(calls.filter(x=>x[0]==="select"&&x[1]==="pictau_published_theme_links")
   .every(x=>x[3].head===true));
 assert.equal(JSON.stringify(x).includes(owner),false);
});
test("Missing guarded RPC and missing projection are unavailable, not bypassed",async()=>{
 const f=fixture({guardError:{code:"PGRST202"},projectionError:{code:"PGRST205"}});
 const result=await readAdminLibraryReadiness(f.client,owner);
 assert.equal(result.guard,"missing");
 assert.equal(result.projection,"missing");
 assert.equal(result.clientRlsVerified,false);
});
test("Network errors or blocked projection never imply that its migration was installed",async()=>{
 const f=fixture({guardError:{code:"PGRST999"},projectionError:{code:"42501"}});
 const result=await readAdminLibraryReadiness(f.client,owner);
 assert.equal(result.guard,"unknown");
 assert.equal(result.projection,"unknown");
});
test("Gabarits : lecture en deux comptes avant publication, sans aucune écriture",async()=>{
 const {client,calls}=fixture({templatePrivate:3,templatePublished:2});
 const ready=await readAdminLibraryReadiness(client,owner);
 assert.deepEqual(ready.templates,{state:"available",private:3,published:2});
 const probes=calls.filter(x=>x[0]==="eq"&&x[1]==="pictau_templates");
 assert.deepEqual(probes,[
   ["eq","pictau_templates","is_published",false],
   ["eq","pictau_templates","is_published",true]
 ]);
 assert.ok(calls.every(x=>!["insert","update","delete","upload"].includes(x[0])));
 assert.equal(JSON.stringify(ready).includes(owner),false);
});
test("Gabarits indisponibles ou bloqués ne sont JAMAIS présentés comme zéro",async()=>{
 const missing=fixture({templateError:{code:"PGRST205"}});
 const denied=fixture({templateError:{code:"42501"}});
 const a=await readAdminLibraryReadiness(missing.client,owner);
 const b=await readAdminLibraryReadiness(denied.client,owner);
 assert.deepEqual(a.templates,{state:"missing",private:null,published:null});
 assert.deepEqual(b.templates,{state:"unknown",private:null,published:null});
 assert.equal(a.clientRlsVerified,false);
});
test("Role denied, changed session and inconsistent counts must refuse the whole diagnostic",async()=>{
 await assert.rejects(readAdminLibraryReadiness(fixture({isAdmin:false}).client,owner),/Super Admin requis/);
 await assert.rejects(readAdminLibraryReadiness(fixture({userSequence:[owner,other]}).client,owner),/session a changé/i);
 await assert.rejects(readAdminLibraryReadiness(fixture({countsError:{message:"RLS denied"}}).client,owner),
  err=>err?.message==="RLS denied","Supabase permission objects must fail closed");
 await assert.rejects(readAdminLibraryReadiness(fixture({drafts:null}).client,owner),/n'a pas confirmé/);
 await assert.rejects(readAdminLibraryReadiness(fixture().client,"invalid"),/Session Super Admin/);
});
test("Dashboard public : diagnostic privé et bouton de revue existant conservés",()=>{
 const app=readFileSync(new URL("../app/src/app.js",import.meta.url),"utf8");
 const css=readFileSync(new URL("../app/src/styles.css",import.meta.url),"utf8");
 assert.ok(app.includes('import {readAdminLibraryReadiness} from "./admin-library-readiness.js";'));
 assert.ok(app.includes('function renderAdminHome(){'));
 for(const value of ['data-action="admin-readiness-refresh"','Gabarits privés',
   'Gabarits publiés','data-tab="bank"','data-tab="templates"',
   'Brouillons à approuver','data-action="admin-review-queue"',
   'if(a==="admin-review-queue")'])assert.ok(app.includes(value),value);
 assert.ok(app.includes('libraryReadiness.request++;libraryReadiness.loaded=false'));
 assert.ok(app.includes('if(ticket!==libraryReadiness.request||authStatus.user?.id!==userId||!canOpenAdmin())return'));
 assert.ok(css.includes('.pa-release-actions button{min-height:44px}'));
 assert.ok(css.includes('@media screen and (max-width:520px)'));
});

test("Retour vers Accueil Super Admin : compteurs invalidés puis relus après navigation",()=>{
 const app=readFileSync(new URL("../app/src/app.js",import.meta.url),"utf8");
 assert.ok(app.includes("function refreshReadinessOnOverviewReturn()"));
 assert.ok(app.includes('const returningToOverview=el.dataset.tab==="overview"&&state.adminTab!=="overview";'));
 assert.ok(app.includes("if(returningToOverview)refreshReadinessOnOverviewReturn();"));
 assert.ok(app.includes('libraryReadiness.result=null;libraryReadiness.error="";'));
 assert.ok(app.includes('libraryReadiness.loading=true;libraryReadiness.loaded=false;'));
 assert.ok(app.includes("ticket!==libraryReadiness.request||authStatus.user?.id!==uid"));
 assert.ok(app.includes('state.page!=="admin"||state.adminTab!=="overview"'));
 // Contrôles existants de la vraie interface : pas de nouveau backend, pas de fausse publication.
 assert.ok(app.includes('Brouillons à approuver'));
 assert.ok(app.includes('data-action="admin-review-queue"'));
});

test("Accueil Super Admin : le raccourci publie rien et ouvre le premier brouillon privé",()=>{
 const app=readFileSync(new URL("../app/src/app.js",import.meta.url),"utf8");
 assert.ok(app.includes('function startPrivateDraftReviewFromHome()'));
 assert.ok(app.includes('if(a==="admin-review-queue")'));
 assert.ok(app.includes('startPrivateDraftReviewFromHome();return;'));
 assert.ok(app.includes('draftReviewQueue.active=true;draftReviewQueue.pending=true'));
 assert.ok(app.includes('bankFilters.query="";bankFilters.status="draft"'));
 assert.ok(app.includes('bankFilters.theme="all";bankFilters.sort="oldest"'));
 assert.ok(app.includes('state.adminTab="bank";state.adminMenuOpen=false'));
 assert.ok(app.includes('data-action="admin-review-queue"'));
 assert.ok(app.includes('Brouillons à approuver'));
 assert.ok(app.includes('Ouvrir la Banque'));
 assert.ok(app.includes('Open image bank'));
 assert.ok(app.includes('if(a==="admin-draft-review-next")'));
 assert.ok(app.includes('if(a==="admin-draft-review-stop")'));
});

test("Revue des brouillons : Suivant et Terminer visibles dans tous les onglets, sans perte silencieuse",()=>{
 const app=readFileSync(new URL("../app/src/app.js",import.meta.url),"utf8");
 const css=readFileSync(new URL("../app/src/styles.css",import.meta.url),"utf8");
 assert.ok(app.includes("const reviewStep=draftReviewQueue.active&&privatePreview.id&&bankSelectionId===privatePreview.id?"));
 assert.ok(app.includes("+'</nav>'+reviewStep;"));
 assert.equal(app.split('data-action="admin-draft-review-next"').length-1,1);
 assert.ok(app.includes("Next draft · without publishing"));
 assert.ok(app.includes("Brouillon suivant · sans publier"));
 assert.ok(app.includes("if(!confirmDiscardBankEdits())return;"));
 assert.ok(app.includes("bankSelectionId=null;bankPanel="));
 assert.ok(css.includes(".pa-bank-sheet .pa-bank-review-step"));
 assert.ok(css.includes("min-height:44px"));
});

test("Panne PNG de la revue : aucun brouillon sauté avant succès du chargement",()=>{
 const app=readFileSync(new URL("../app/src/app.js",import.meta.url),"utf8");
 const css=readFileSync(new URL("../app/src/styles.css",import.meta.url),"utf8");
 const advance=app.split("function advanceDraftReviewQueue(){")[1].split("\n}\n")[0];
 assert.doesNotMatch(advance,/draftReviewQueue\.seen\.add\(/);
 const open=app.split("async function openAdminPreview(assetId){")[1];
 assert.doesNotMatch(open.slice(0,open.indexOf("try{")),/draftReviewQueue\.seen\.add\(/);
 assert.match(open.slice(open.indexOf("privatePreview.url=URL.createObjectURL(result.blob);")),
   /if\(draftReviewQueue\.active&&result\.asset\?\.status==="draft"\)\s+draftReviewQueue\.seen\.add\(assetId\)/);
 assert.ok(app.includes('data-action="admin-preview-retry"'));
 assert.match(app,/if\(a==="admin-preview-retry"\)[\s\S]*?void openAdminPreview\(privatePreview\.id\)/);
 assert.match(app,/if\(!draftReviewQueue\.active\|\|privatePreview\.loading\|\|!privatePreview\.url\|\|/);
 assert.ok(app.includes("Réessayer le chargement du PNG"));
 assert.ok(app.includes("Retry loading the PNG"));
 assert.ok(app.includes("Aucune approbation automatique"));
 assert.ok(app.includes("No automatic approval"));
 assert.ok(css.includes(".pa-bank-review-progress"));
 assert.ok(css.includes(".pa-bank-preview-error .btn{min-height:44px"));
});
