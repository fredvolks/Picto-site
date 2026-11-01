import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {
  normalizePictoTemplateIds,saveAdminPictoTemplateDraft,
  confirmAdminPictoTemplateChoices,listClientPictoTemplateChoices,
  getAdminPictoTemplateChoices
} from "../src/picto-template-choices.js";

const ADMIN="00000000-0000-4000-8000-000000000001";
const CLIENT="00000000-0000-4000-8000-000000000002";
const PICTO="00000000-0000-4000-8000-000000000333";
const T1="00000000-0000-4000-8000-000000000444";
const T2="00000000-0000-4000-8000-000000000445";
const DATE="2026-10-31T10:11:12.000Z";

function fixture({user=ADMIN,admin=true,ready=true}={}){
 const state={user,admin,ready,draft:null,choices:[],receipt:null,calls:[],rpcCalls:[]};
 function table(name){
   const q={name,method:"select",payload:null,filters:[],
     select(){return this;},eq(field,value){this.filters.push([field,value]);return this;},
     order(){return this;},limit(){return this.result("list");},
     insert(value){this.method="insert";this.payload=value;return this;},
     update(value){this.method="update";this.payload=value;return this;},
     single(){return this.result("one");},maybeSingle(){return this.result("one");},
     then(resolve,reject){return this.result("list").then(resolve,reject);},
     async result(shape){
       state.calls.push({name,method:this.method,filters:this.filters,payload:this.payload});
       const filter=(rows)=>rows.filter(row=>this.filters.every(([k,v])=>
         k==="choices.catalog_id" ? row.choices?.[0]?.catalog_id===v:row[k]===v));
       if(name==="pictau_admins")return{data:state.admin?{user_id:ADMIN}:null,error:null};
       if(name==="pictau_picto_template_drafts"){
         if(this.method==="insert"){
           state.draft={...this.payload,revision:1,updated_at:DATE,updated_by:ADMIN};
           return{data:state.draft,error:null};
         }
         if(this.method==="update"){
           if(!state.draft||!filter([state.draft]).length)return{data:null,error:null};
           state.draft={...state.draft,...this.payload,revision:state.draft.revision+1};
           return{data:state.draft,error:null};
         }
         return{data:shape==="one"?filter(state.draft?[state.draft]:[])[0]||null:filter(state.draft?[state.draft]:[]),error:null};
       }
       if(name==="pictau_picto_template_confirmations")
         return{data:state.receipt,error:null};
       if(name==="pictau_picto_template_choices")
         return{data:filter(state.choices.map(template_id=>({catalog_id:PICTO,template_id}))),error:null};
       if(name==="pictau_templates"){
         if(!state.ready)return{data:[],error:null};
         const source=[T1,T2].map((id,i)=>({
           id,name:i?"Carré":"Vertical",created_by:ADMIN,
           is_published:true,revision:1,
           choices:state.choices.includes(id)?[{catalog_id:PICTO}]:[]
         })).filter(row=>row.choices.length);
         return{data:filter(source),error:null};
       }
       throw Error("Table imprévue: "+name);
     }
   };return q;
 }
 const client={auth:{getUser:async()=>({data:{user:{id:state.user}},error:null})},
   from:table,
   rpc:async(name,args)=>{
     state.rpcCalls.push({name,args});
     if(!state.admin||name!=="pictau_confirm_picto_template_choices")
       return{error:new Error("Accès refusé")};
     if(args.p_revision!==state.draft?.revision)
       return{error:new Error("Version périmée")};
     state.choices=[...state.draft.template_ids];
     state.receipt={catalog_id:PICTO,confirmed_revision:args.p_revision,
       confirmed_by:ADMIN,confirmed_at:DATE};
     return{data:state.choices.length,error:null};
   }
 };
 return{client,state};
}

test("Sélection par picto : 12 maximum, aucun doublon, UUID valides",()=>{
 assert.deepEqual(normalizePictoTemplateIds([]),[]);
 assert.deepEqual(normalizePictoTemplateIds([T1,T2]),[T1,T2]);
 assert.throws(()=>normalizePictoTemplateIds([T1,T1]),/deux fois/);
 assert.throws(()=>normalizePictoTemplateIds(["../private.png"]),/invalide/);
 assert.throws(()=>normalizePictoTemplateIds(Array(13).fill(T1)),/maximum/);
});

test("Préparer des gabarits ne change jamais le choix visible côté client",async()=>{
 const {client,state}=fixture();
 const stage=await saveAdminPictoTemplateDraft(client,ADMIN,{
   catalogId:PICTO,ids:[T1,T2],revision:0
 });
 assert.equal(stage.revision,1);
 assert.equal(stage.awaitingConfirmation,true);
 assert.deepEqual(state.choices,[]);
 assert.equal(state.rpcCalls.length,0);
 assert.equal(state.draft.template_ids.length,2);
 const fetched=await getAdminPictoTemplateChoices(client,ADMIN,PICTO);
 assert.deepEqual(fetched.selected,[T1,T2]);
 assert.deepEqual(fetched.confirmed,[]);
});

test("Confirmation exige un vrai geste explicite, le rôle Admin et un reçu",async()=>{
 const {client,state}=fixture();
 await saveAdminPictoTemplateDraft(client,ADMIN,{catalogId:PICTO,ids:[T1],revision:0});
 await assert.rejects(confirmAdminPictoTemplateChoices(client,ADMIN,{
   catalogId:PICTO,revision:1,confirmedByUser:false
 }),/Confirmation explicite/);
 assert.equal(state.rpcCalls.length,0);
 const receipt=await confirmAdminPictoTemplateChoices(client,ADMIN,{
   catalogId:PICTO,revision:1,confirmedByUser:true
 });
 assert.equal(receipt.confirmedCount,1);
 assert.equal(receipt.confirmedRevision,1);
 assert.deepEqual(state.choices,[T1]);
 assert.equal(state.rpcCalls[0].args.p_confirm,true);
});

test("Modifier un brouillon puis confirmer zéro gabarit retire les choix visibles",async()=>{
 const {client,state}=fixture();
 await saveAdminPictoTemplateDraft(client,ADMIN,{catalogId:PICTO,ids:[T1],revision:0});
 await confirmAdminPictoTemplateChoices(client,ADMIN,
   {catalogId:PICTO,revision:1,confirmedByUser:true});
 await saveAdminPictoTemplateDraft(client,ADMIN,{catalogId:PICTO,ids:[],revision:1});
 assert.deepEqual(state.choices,[T1],"Les anciennes propositions sont encore visibles");
 await confirmAdminPictoTemplateChoices(client,ADMIN,
   {catalogId:PICTO,revision:2,confirmedByUser:true});
 assert.deepEqual(state.choices,[],"Le client ne voit plus aucun gabarit");
});

test("Les modifications sont interdites au client, y compris la confirmation",async()=>{
 const {client,state}=fixture({user:CLIENT,admin:false});
 await assert.rejects(saveAdminPictoTemplateDraft(client,CLIENT,
   {catalogId:PICTO,ids:[T1]}),/Super Admin/);
 await assert.rejects(confirmAdminPictoTemplateChoices(client,CLIENT,{
   catalogId:PICTO,revision:1,confirmedByUser:true
 }),/Super Admin/);
 assert.equal(state.rpcCalls.length,0);
});

test("La fiche client ne révèle que les modèles associés et publiés",async()=>{
 const {client,state}=fixture({user:CLIENT,admin:false});
 state.choices=[T1];
 const rows=await listClientPictoTemplateChoices(client,CLIENT,PICTO);
 assert.deepEqual(rows.map(r=>r.id),[T1]);
 assert.ok(rows.every(row=>!Object.hasOwn(row,"choices")));
 const query=state.calls.find(c=>c.name==="pictau_templates");
 assert.ok(query.filters.some(([field,value])=>field==="is_published"&&value===true));
 assert.ok(query.filters.some(([field,value])=>field==="choices.catalog_id"&&value===PICTO));
});

test("La fiche client refuse les modèles non publiés ou mal associés",async()=>{
 const {client}=fixture({user:CLIENT,admin:false});
 const original=client.from;
 client.from=(name)=>{
   const q=original(name);
   if(name==="pictau_templates"){
     q.result=async()=>({data:[{
       id:T1,name:"Caché",is_published:false,
       choices:[{catalog_id:PICTO}]
     }],error:null});
   }
   return q;
 };
 await assert.rejects(listClientPictoTemplateChoices(client,CLIENT,PICTO),
   /non confirmé/);
});

// La migration SQL est vérifiée dans le dépôt privé, jamais copiée sur Pages.
