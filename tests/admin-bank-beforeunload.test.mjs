import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {runInNewContext} from "node:vm";

// Exécute le véritable écouteur de fermeture de src/app.js avec des états
// contrôlés, sans appeler Supabase ni dépendre de fenêtres natives instables.
const app=readFileSync(new URL("../app/src/app.js",import.meta.url),"utf8");
const hook='window.addEventListener("beforeunload",event=>{';
const first=app.indexOf(hook);
const start=app.indexOf(hook,first+hook.length);
const end=app.indexOf("\n});",start);
assert.ok(first>=0&&start>first&&end>start,"Écouteur privé Super Admin présent");
const actualHandler=app.slice(start,end+4);
assert.match(actualHandler,/hasUnsavedBankEdits\(\)/,
  "Le garde doit couvrir aussi les noms et catégories, pas seulement l'image");

function harness(){
  let listener=null;
  const env={
    SITE_EMBEDDED:true,
    canOpenAdmin:()=>true,
    hasUnsavedBankEdits:()=>false,
    bankImageSheet:{busy:false},
    draftEditor:{saving:false},
    bankRename:{busy:false},
    themeUI:{busy:false},
    privatePreview:{id:null,adjustBusy:false},
    publishedCatalog:{publishing:false},
    window:{addEventListener:(name,callback)=>{
      assert.equal(name,"beforeunload");
      listener=callback;
    }}
  };
  runInNewContext(actualHandler,env);
  assert.equal(typeof listener,"function");
  return {
    env,
    tryLeave(){
      const event={
        prevented:false,returnValue:null,
        preventDefault(){this.prevented=true;}
      };
      listener(event);
      return {prevented:event.prevented,returnValue:event.returnValue};
    }
  };
}

test("Nom/catégorie modifiés : fermeture refusée même sans aperçu PNG ouvert",()=>{
  const h=harness();
  h.env.hasUnsavedBankEdits=()=>true;
  assert.deepEqual(h.tryLeave(),{prevented:true,returnValue:""});
  h.env.hasUnsavedBankEdits=()=>false;
  assert.deepEqual(h.tryLeave(),{prevented:false,returnValue:null});
});

test("Chaque écriture privée encore en cours protège le rechargement",()=>{
  const paths=[
    ["bankImageSheet","busy"],["draftEditor","saving"],["bankRename","busy"],
    ["themeUI","busy"],["privatePreview","adjustBusy"],["publishedCatalog","publishing"]
  ];
  for(const [object,key] of paths){
    const h=harness();
    h.env[object][key]=true;
    assert.equal(h.tryLeave().prevented,true,object+"."+key+" must protect beforeunload");
  }
});

test("Ni espace non intégré ni session non-admin ne déclenchent une alerte privée",()=>{
  const h=harness();
  h.env.hasUnsavedBankEdits=()=>true;
  h.env.SITE_EMBEDDED=false;
  assert.equal(h.tryLeave().prevented,false);
  h.env.SITE_EMBEDDED=true;
  h.env.canOpenAdmin=()=>false;
  assert.equal(h.tryLeave().prevented,false);
});
