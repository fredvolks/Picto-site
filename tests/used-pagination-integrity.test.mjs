import test from "node:test";
import assert from "node:assert/strict";
import {listUsedPictograms,listUsedPictogramsAvailablePage} from "../app/src/used-pictograms.js";

const uid="11111111-1111-4111-8111-111111111111";
const row={owner_id:uid,pictogram_id:"33333333-3333-4333-8333-333333333333",approved_id:"33333333-3333-4333-8333-333333333333",
  last_used_at:"2026-10-31T10:00:00Z",title_fr:"Toilette",title_en:"Bathroom",theme:"hygiene",
  image_path:"items/33333333-3333-4333-8333-333333333333.png"};
function mock(counts, lengths, {revoke=false}={}){
  const ranges=[],orders=[];let authCount=0;
  const q={
    eq(){return q;},or(){return q;},
    order(field,opts){orders.push([field,opts]);return q;},
    async range(start,end){
      ranges.push([start,end]);
      const index=ranges.length-1;
      const count=counts[Math.min(index,counts.length-1)];
      const length=lengths[Math.min(index,lengths.length-1)];
      return {count,data:Array.from({length},(_,i)=>({...row,pictogram_id:
        (i+1).toString(16).padStart(8,"0")+"-5555-4555-8555-555555555555"})),error:null};
    }
  };
  const client={auth:{async getUser(){
    authCount++;return {data:{user:{id:revoke&&authCount>1?"22222222-2222-4222-8222-222222222222":uid}},error:null};
  }},from(){return {select(){return q;}}}};
  return {client,ranges,orders};
}
test("Historique public : page partielle relue avant affichage",async()=>{
  const m=mock([25,25],[4,24]);
  const r=await listUsedPictogramsAvailablePage(m.client,uid,{page:0});
  assert.equal(r.items.length,24);
  assert.deepEqual(m.ranges,[[0,23],[0,23]]);
});
test("Historique public : une page partielle persistante refuse le faux résultat",async()=>{
  const m=mock([25,25,25],[1,1,1]);
  await assert.rejects(listUsedPictogramsAvailablePage(m.client,uid,{page:0}),/Actualisez vos pictogrammes utilisés/);
  assert.equal(m.ranges.length,3);
});
test("Historique public : page disparue restaurée sous les mêmes filtres",async()=>{
  const m=mock([25,25],[0,1]);
  const r=await listUsedPictogramsAvailablePage(m.client,uid,{page:4,sort:"name",language:"en"});
  assert.equal(r.page,1);assert.equal(r.items.length,1);
  assert.deepEqual(m.ranges,[[96,119],[24,47]]);
  assert.equal(m.orders[0][0],"title_en");
});
test("Historique public : tri français ou anglais vérifié par la base",async()=>{
  for(const [language,column] of [["fr","title_fr"],["en","title_en"]]){
    const m=mock([1],[1]);
    await listUsedPictograms(m.client,uid,{sort:"name",language});
    assert.equal(m.orders[0][0],column);
  }
});
test("Historique public : Auth révoqué pendant la requête interdit tout résultat",async()=>{
  const m=mock([1],[1],{revoke:true});
  await assert.rejects(listUsedPictogramsAvailablePage(m.client,uid),/session a changé/i);
});
test("Historique public : une réponse dépassant la page est refusée",async()=>{
  const m=mock([25],[25]);
  // Seuil de 24 pictogrammes par feuillet.
  await assert.rejects(listUsedPictograms(m.client,uid),/Historique indisponible/);
});
