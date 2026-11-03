// Tests de sécurité du véritable code publié par Pict-au. Provenance des
// scénarios métier : Picto/tests/catalog.test.js; aucun compte client réel utilisé.
import test from "node:test";
import assert from "node:assert/strict";
import {webcrypto} from "node:crypto";
import {publishReviewedPictogram,unpublishReviewedPictogram,CATALOG_BUCKET} from "../src/catalog.js";
if(!globalThis.crypto?.subtle)globalThis.crypto=webcrypto;
const uid="11111111-1111-4111-8111-111111111111";
const assetId="33333333-3333-4333-8333-333333333333";
const row={id:assetId,title_fr:"toilette",title_en:"bathroom",theme:"hygiene",
  image_path:"items/"+assetId+".png",published_at:"2026-10-28T12:00:00Z"};
function png(){const data=new Uint8Array(40);data.set([137,80,78,71,13,10,26,10]);return new Blob([data],{type:"image/png"});}
function user(id=uid){return {auth:{getUser:async()=>({data:{user:id?{id}:null},error:null})}};}

function adminClient({isAdmin=true,insertFails=false}={}){
  const calls=[];
  let approved=null, published=null;
  const asset={id:assetId,title_fr:"toilette",title_en:"bathroom",theme:"hygiene",
    status:"draft",created_at:"2026-10-28T12:00:00Z",
    image_path:"imports/"+uid+"/"+assetId+".png"};
  const source=png();
  const client={
    ...user(),
    from(name){
      calls.push(["table",name]);
      if(name==="pictau_admins")return{
        select(){return{eq(){return{maybeSingle:async()=>({data:isAdmin?{user_id:uid}:null,error:null})};}}}
      };
      if(name==="pictau_assets")return{
        select(){return{eq(){return{maybeSingle:async()=>({data:asset,error:null})};}}}
      };
      if(name==="pictau_catalog_items")return{
        select(){return{eq(){return{maybeSingle:async()=>({data:published,error:null})};}}},
        insert:record=>{calls.push(["insert",record]);return{select(){return{
          single:async()=>{
            if(insertFails)return{error:Error("Insert refused")};
            published={...row,title_fr:record.title_fr,title_en:record.title_en,
              theme:record.theme,image_path:record.image_path};
            return{data:published,error:null};
          }
        };}}},
        delete(){calls.push(["delete"]);return{eq(){return{select(){return{
          maybeSingle:async()=>({data:{id:assetId,image_path:row.image_path},error:null})
        };}}}};}
      };
      throw Error("Unexpected table "+name);
    },
    storage:{from(bucket){calls.push(["storage",bucket]);return{
      download:async path=>{calls.push(["download",path]);
        return{data:bucket===CATALOG_BUCKET?approved:source,error:null};},
      upload:async(path,blob,opts)=>{calls.push(["upload",path,blob.size,opts.upsert]);
        if(bucket===CATALOG_BUCKET)approved=blob;
        return{error:null};},
      remove:async paths=>{calls.push(["remove",paths]);return{error:null};}
    };}}
  };
  return {client,calls,review:{...asset,blob:source}};
}
test("Seul un administrateur authentifié peut publier : téléchargement source PRIVÉE puis copie privée approuvée",async()=>{
  const {client,calls,review}=adminClient();
  const result=await publishReviewedPictogram(client,uid,assetId,review);
  assert.equal(result.id,assetId);
  assert.ok(calls.some(x=>x[0]==="storage"&&x[1]==="pictau-drafts"));
  assert.ok(calls.some(x=>x[0]==="storage"&&x[1]===CATALOG_BUCKET));
  assert.ok(calls.some(x=>x[0]==="insert"&&x[1].published_by===uid));
  assert.ok(calls.some(x=>x[0]==="upload"&&x[1]===row.image_path&&x[3]===false));
  assert.ok(!calls.some(x=>x[0]==="remove"),"No deletion on success");
});
test("Une publication sans aperçu vérifié refuse le catalogue avant l'upload",async()=>{
 const {client,calls}=adminClient();
 await assert.rejects(publishReviewedPictogram(client,uid,assetId),/Aperçu approuvé absent/);
 assert.equal(calls.some(x=>x[0]==="upload"||x[0]==="insert"),false);
});
test("L'image PNG revue doit rester identique aux octets privés au moment de publier",async()=>{
 const {client,calls,review}=adminClient();
 const source=client.storage.from.bind(client.storage);
 client.storage.from=bucket=>{
  const storage=source(bucket);
  if(bucket!=="pictau-drafts")return storage;
  return {...storage,download:async path=>{
   const answer=await storage.download(path);
   const bytes=new Uint8Array(await answer.data.arrayBuffer());
   bytes[35]^=0x80;
   return{data:new Blob([bytes],{type:"image/png"}),error:null};
  }};
 };
 await assert.rejects(publishReviewedPictogram(client,uid,assetId,review),/PNG a changé depuis l'aperçu/);
 assert.equal(calls.some(x=>x[0]==="upload"||x[0]==="insert"),false);
});
test("Le non administrateur ne peut pas télécharger ni publier de PNG privé",async()=>{
  const {client,calls,review}=adminClient({isAdmin:false});
  await assert.rejects(()=>publishReviewedPictogram(client,uid,assetId,review),/Super Admin refusé/);
  assert.ok(!calls.some(x=>x[0]==="upload"||x[0]==="download"));
});
test("Échec transaction catalogue : nettoyage de la copie et aucune annonce de publication",async()=>{
  const {client,calls,review}=adminClient({insertFails:true});
  await assert.rejects(()=>publishReviewedPictogram(client,uid,assetId,review),/Insert refused/);
  assert.equal(calls.some(x=>x[0]==="remove"),false,
    "Ne jamais effacer le PNG après un INSERT SQL : la transaction pourrait avoir été confirmée sans réponse");
});
test("Dépublication retire la ligne avant de nettoyer le PNG privé",async()=>{
  const {client,calls,review}=adminClient();
  const result=await unpublishReviewedPictogram(client,uid,assetId,review);
  assert.equal(result.unpublished,true);
  assert.ok(calls.findIndex(x=>x[0]==="delete")<calls.findIndex(x=>x[0]==="remove"));
});


function publishingServer({ackLost=false,insertRejected=false,insertRejectedOnce=false,uploadAckLost=false,approvedMissing=false,approvedChanged=false}={}){
 const x=adminClient(),calls=x.calls;
 let published=null,approved=null;
 let pendingInsertFailure=insertRejectedOnce,pendingUploadError=uploadAckLost;
 const originalFrom=x.client.from.bind(x.client);
 x.client.from=name=>{
  if(name!=="pictau_catalog_items")return originalFrom(name);
  calls.push(["table",name]);
  return{
   insert:record=>({select:()=>({single:async()=>{
    calls.push(["insert",record]);
    if(insertRejected||pendingInsertFailure){pendingInsertFailure=false;return{data:null,error:new Error("SQL rejeté")};}
    published={...row,title_fr:record.title_fr,title_en:record.title_en,
      theme:record.theme,image_path:record.image_path,published_at:row.published_at};
    if(ackLost)return{data:null,error:new Error("Réponse INSERT perdue après COMMIT")};
    return{data:published,error:null};
   }})}),
   select:()=>({eq:()=>({maybeSingle:async()=>{
    calls.push(["read-published"]);
    return{data:published,error:null};
   }})})
  };
 };
 const originalStorage=x.client.storage.from.bind(x.client.storage);
 x.client.storage.from=bucket=>{
  if(bucket!==CATALOG_BUCKET)return originalStorage(bucket);
  calls.push(["storage",bucket]);
  return{
   upload:async(path,blob,opts)=>{
    calls.push(["upload",path,blob.size,opts.upsert]);
    if(approved)return{error:{statusCode:"409",message:"Object exists"}};
    approved=blob;
    if(pendingUploadError){pendingUploadError=false;return{error:new Error("Upload ACK lost")};}
    return{error:null};
   },
   download:async path=>{
    calls.push(["download-approved",path]);
    if(approvedMissing)return{data:null,error:new Error("Objet absent")};
    if(!approved)return{data:null,error:new Error("Non publié")};
    if(approvedChanged){
     const bytes=new Uint8Array(await approved.arrayBuffer());bytes[21]^=0x42;
     return{data:new Blob([bytes],{type:"image/png"}),error:null};
    }
    return{data:approved,error:null};
   },
   remove:async paths=>{calls.push(["remove",paths]);approved=null;return{error:null};}
  };
 };
 return{client:x.client,calls,review:x.review,stored:()=>approved,published:()=>published};
}
test("Bibliothèque : un INSERT publié sans accusé garde le PNG privé et récupère le résultat",async()=>{
 const s=publishingServer({ackLost:true});
 const saved=await publishReviewedPictogram(s.client,uid,assetId,s.review);
 assert.equal(saved.id,assetId);
 assert.equal(s.published()?.id,assetId);
 assert.ok(s.stored(),"Le PNG publié reste réellement présent");
 assert.equal(s.calls.filter(x=>x[0]==="insert").length,1);
 assert.equal(s.calls.filter(x=>x[0]==="remove").length,0);
 assert.ok(s.calls.some(x=>x[0]==="read-published"));
 assert.ok(s.calls.some(x=>x[0]==="download-approved"));
});
test("Bibliothèque : SQL réellement rejeté, ne jamais supprimer un PNG après début INSERT",async()=>{
 const s=publishingServer({insertRejected:true});
 await assert.rejects(publishReviewedPictogram(s.client,uid,assetId,s.review),/SQL rejeté/);
 assert.equal(s.published(),null);
 assert.ok(s.stored());
 assert.equal(s.calls.filter(x=>x[0]==="remove").length,0);
});
test("Bibliothèque : une fiche SQL sans PNG approuvé ne prouve jamais une publication",async()=>{
 const s=publishingServer({approvedMissing:true});
 await assert.rejects(publishReviewedPictogram(s.client,uid,assetId,s.review),/stockage|PNG|privé|absent/i);
 assert.equal(s.published()?.id,assetId);
 assert.equal(s.calls.filter(x=>x[0]==="remove").length,0);
});
test("Bibliothèque : PNG publié altéré après l'upload, succès interdit",async()=>{
 const s=publishingServer({approvedChanged:true});
 await assert.rejects(publishReviewedPictogram(s.client,uid,assetId,s.review),/intégrité|octets|corrompu|identique/i);
 assert.equal(s.published()?.id,assetId);
 assert.equal(s.calls.filter(x=>x[0]==="remove").length,0);
});


test("Bibliothèque : après SQL rejeté, le second clic reprend le même PNG privé",async()=>{
 const s=publishingServer({insertRejectedOnce:true});
 await assert.rejects(publishReviewedPictogram(s.client,uid,assetId,s.review),/SQL rejeté/);
 const original=s.stored();
 assert.ok(original);
 const recovered=await publishReviewedPictogram(s.client,uid,assetId,s.review);
 assert.equal(recovered.id,assetId);
 assert.equal(s.stored(),original,"La source approuvée n'est jamais écrasée");
 assert.equal(s.calls.filter(x=>x[0]==="insert").length,2);
 assert.equal(s.calls.filter(x=>x[0]==="upload").length,2);
 assert.equal(s.calls.filter(x=>x[0]==="remove").length,0);
});
test("Bibliothèque : accusé upload perdu, preuve privée permet un seul INSERT",async()=>{
 const s=publishingServer({uploadAckLost:true});
 const result=await publishReviewedPictogram(s.client,uid,assetId,s.review);
 assert.equal(result.id,assetId);
 assert.equal(s.calls.filter(x=>x[0]==="upload").length,1);
 assert.equal(s.calls.filter(x=>x[0]==="insert").length,1);
 assert.ok(s.calls.filter(x=>x[0]==="download-approved").length>=2);
 assert.equal(s.calls.filter(x=>x[0]==="remove").length,0);
});
test("Bibliothèque : objet existant altéré, aucun INSERT ou remplacement sous même ID",async()=>{
 const s=publishingServer({insertRejectedOnce:true});
 await assert.rejects(publishReviewedPictogram(s.client,uid,assetId,s.review),/SQL rejeté/);
 const originalFrom=s.client.storage.from.bind(s.client.storage);
 s.client.storage.from=bucket=>{
  const st=originalFrom(bucket);
  if(bucket!==CATALOG_BUCKET)return st;
  return {...st,download:async path=>{
   const answer=await st.download(path);
   if(!answer.data)return answer;
   const bytes=new Uint8Array(await answer.data.arrayBuffer());bytes[24]^=0x40;
   return{data:new Blob([bytes],{type:"image/png"}),error:null};
  }};
 };
 await assert.rejects(publishReviewedPictogram(s.client,uid,assetId,s.review),/identique|intégrité|conflit|différent/i);
 assert.equal(s.calls.filter(x=>x[0]==="insert").length,1);
 assert.equal(s.calls.filter(x=>x[0]==="remove").length,0);
});


// Tri public bilingue : même contrat que le code privé, sans accès aux brouillons.
test("Tri public bilingue serveur avant pagination et filtres bornés",async()=>{
  const {normalizeCatalogFilters,listPublishedCatalog}=await import("../src/catalog.js");
  assert.deepEqual(normalizeCatalogFilters({query:"ecole",theme:"ecole",page:2}),
    {query:"ecole",theme:"ecole",sort:"recent",page:2,language:"fr"});
  assert.throws(()=>normalizeCatalogFilters({language:"autre"}),/Langue/);
  assert.throws(()=>normalizeCatalogFilters({sort:"invalide"}),/Tri/);
  const calls=[];
  const query={eq(k,v){calls.push(["eq",k,v]);return this;},order(k,o){calls.push(["order",k,o]);return this;},
    range(a,b){calls.push(["range",a,b]);return Promise.resolve({data:[],count:0,error:null});}};
  const client={auth:{getUser:async()=>({data:{user:{id:uid}},error:null})},from(name){calls.push(["table",name]);return {select(){return query;}}}};
  await listPublishedCatalog(client,uid,{sort:"name_desc",language:"en",page:1});
  assert.deepEqual(calls.filter(x=>x[0]==="order"),[
    ["order","title_en",{ascending:false,nullsFirst:false}],["order","id",{ascending:true}]]);
  assert.deepEqual(calls.find(x=>x[0]==="range"),["range",24,47]);
  assert.deepEqual(calls.find(x=>x[0]==="table"),["table","pictau_catalog_items"]);
});
test("L'interface client expose le tri et retour à tous sans vider les sélections",async()=>{
  const {readFileSync}=await import("node:fs");
  const source=readFileSync(new URL("../src/app.js",import.meta.url),"utf8");
  const render=source.split("function renderClientLibrary(){")[1]?.split("function renderClientUsed(){")[0]||"";
  const clear=source.split('if(a==="catalog-clear-filters"')[1]?.split('if(a==="client-category")')[0]||"";
  assert.match(render,/data-field="catalog-sort"/);
  assert.match(render,/data-action="catalog-clear-filters"/);
  for(const term of ['state.search=""','state.clientCategory=""','publishedCatalog.sort="recent"','publishedCatalog.page=0'])
    assert.ok(clear.includes(term),term);
  assert.doesNotMatch(clear,/bulkSelected\.clear|officialComposer\.(routine|board)\s*=/);
  assert.match(source,/language:state\.language,page:publishedCatalog\.page/);
});
