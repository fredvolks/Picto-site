import test from "node:test";
import assert from "node:assert/strict";
import {copyAdditionalAssetThemes} from "../app/src/admin-themes.js";

const uid="11111111-1111-4111-8111-111111111111";
const target="22222222-2222-4222-8222-222222222222";
function adminClient({denied=false,role=true}={}){
  const writes=[];
  const client={
    auth:{async getUser(){return {data:{user:{id:uid}},error:null};}},
    from(table){
      if(table==="pictau_admins")return{select(){return{eq(){return{
        async maybeSingle(){return {data:role?{user_id:uid}:null,error:null};}
      };}};}};
      assert.equal(table,"pictau_asset_themes");
      return{insert(payload){writes.push(payload);return{select(){return{
        async single(){return denied?{data:null,error:Error("RLS refused")}:{data:payload,error:null};}
      };}};}};
    }
  };
  return {client,writes};
}
test("La copie conserve les catégories secondaires sans dupliquer la primaire",async()=>{
  const {client,writes}=adminClient();
  const input=["ecole","hygiene","autonomie"];
  assert.deepEqual(await copyAdditionalAssetThemes(client,uid,target,"ecole",input),["hygiene","autonomie"]);
  assert.deepEqual(writes,[{asset_id:target,theme_code:"hygiene"},{asset_id:target,theme_code:"autonomie"}]);
  assert.deepEqual(input,["ecole","hygiene","autonomie"]);
});
test("La liste vide n'écrit rien, doublons et catégories invalides sont bloqués",async()=>{
  const {client,writes}=adminClient();
  assert.deepEqual(await copyAdditionalAssetThemes(client,uid,target,"ecole",[]),[]);
  for(const values of [["ecole","hygiene","hygiene"],["hygiene","titre illégal"],Array(13).fill("ecole")])
    await assert.rejects(copyAdditionalAssetThemes(client,uid,target,"ecole",values));
  assert.equal(writes.length,0);
});
test("Un refus de droits ou du serveur n'est jamais signalé comme une réussite",async()=>{
  const roleDenied=adminClient({role:false});
  await assert.rejects(copyAdditionalAssetThemes(roleDenied.client,uid,target,"ecole",["hygiene"]),/Réservé au Super Admin/);
  const denied=adminClient({denied:true});
  await assert.rejects(copyAdditionalAssetThemes(denied.client,uid,target,"ecole",["hygiene"]),/RLS refused/);
});
