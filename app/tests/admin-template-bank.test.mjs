import test from "node:test";
import assert from "node:assert/strict";
import {DEFAULT_PRESET} from "../src/core.js";
import {
  normalizeTemplateName,prepareNamedTemplate,listAdminNamedTemplates,
  listClientPublishedTemplates,saveAdminNamedTemplate,setAdminTemplatePublication
} from "../src/admin-template-bank.js";

const ADMIN="00000000-0000-4000-8000-000000000001";
const CLIENT="00000000-0000-4000-8000-000000000002";
const ID="00000000-0000-4000-8000-000000000222";
const DATE="2026-10-31T00:00:00.000Z";
function fixture(changes={}){
  return {
    id:ID,created_by:ADMIN,is_published:false,revision:1,created_at:DATE,updated_at:DATE,
    ...prepareNamedTemplate("Carré sans couleur",DEFAULT_PRESET),
    ...changes
  };
}
function mockDb({user=ADMIN,isAdmin=true,rows=[],verifyWrites=true}={}){
  const state={user,isAdmin,rows:[...rows],writes:[],reads:[]};
  const client={
    auth:{getUser:async()=>({data:{user:state.user?{id:state.user}:null},error:null})},
    from(table){
      const q={table,filters:[],payload:null,method:"select",
        select(){return this;},eq(key,value){this.filters.push([key,value]);return this;},
        order(){return this;},limit(){return this.result(false);},
        insert(data){this.method="insert";this.payload=data;return this;},
        update(data){this.method="update";this.payload=data;return this;},
        single(){return this.result(true);},maybeSingle(){return this.result(true);},
        async result(single){
          state.reads.push({table,method:this.method,filters:this.filters});
          const include=(row)=>this.filters.every(([k,v])=>row[k]===v);
          if(table==="pictau_admins"){
            return{data:state.isAdmin&&this.filters.some(([k,v])=>k==="user_id"&&v===ADMIN)?
              {user_id:ADMIN}:null,error:null};
          }
          if(table!=="pictau_templates")throw Error("Unexpected table "+table);
          if(this.method==="select"){
            const data=state.rows.filter(include);
            return{data:single?data[0]||null:data,error:null};
          }
          if(!verifyWrites)throw Error("Mutating API used without authorization");
          state.writes.push({method:this.method,data:this.payload,filters:this.filters});
          if(this.method==="insert"){
            const row=fixture({...this.payload});state.rows.push(row);
            return{data:row,error:null};
          }
          const row=state.rows.find(include);
          if(!row)return{data:null,error:null};
          const newer={...row,...this.payload,revision:row.revision+1};
          state.rows[state.rows.indexOf(row)]=newer;
          return{data:newer,error:null};
        }
      };
      return q;
    }
  };
  return {client,state};
}

test("Les gabarits nommés rejettent noms, valeurs et rotations invalides",()=>{
  assert.equal(normalizeTemplateName("  Routine   école  "),"Routine école");
  for(const name of ["","   ","x".repeat(81),"\u0000admin"])
    assert.throws(()=>normalizeTemplateName(name));
  assert.throws(()=>prepareNamedTemplate("X",DEFAULT_PRESET,{rotationDeg:181}),/invalides/);
  assert.throws(()=>prepareNamedTemplate("X",DEFAULT_PRESET,{widthCm:11}),/invalides/);
  assert.throws(()=>prepareNamedTemplate("X",{...DEFAULT_PRESET,colored:"false"}),/invalides/);
  assert.throws(()=>prepareNamedTemplate("X",{...DEFAULT_PRESET,artPercent:NaN}),/invalides/);
  const p=prepareNamedTemplate("Sans bordure",{...DEFAULT_PRESET,colored:false},
    {widthCm:4.5,rotationDeg:-12});
  assert.deepEqual([p.name,p.colored,p.width_cm,p.rotation_deg],
    ["Sans bordure",false,4.5,-12]);
});

test("Créer plusieurs modèles nommés ne publie jamais automatiquement",async()=>{
  const {client,state}=mockDb();
  const r=await saveAdminNamedTemplate(client,ADMIN,
    {name:"Routine école",preset:{...DEFAULT_PRESET,colored:false},rotationDeg:10});
  assert.equal(r.is_published,false);
  assert.equal(r.revision,1);
  assert.equal(Object.hasOwn(r,"created_by"),false);
  assert.equal(state.writes.length,1);
  assert.equal(state.writes[0].method,"insert");
  assert.equal(state.writes[0].data.is_published,false);
  assert.equal(state.rows.length,1);
});

test("Les droits Super Admin sont revalidés avant les modifications",async()=>{
  const {client,state}=mockDb({user:CLIENT,isAdmin:false});
  await assert.rejects(saveAdminNamedTemplate(client,CLIENT,
    {name:"Tentative",preset:DEFAULT_PRESET}),/Super Admin/);
  await assert.rejects(setAdminTemplatePublication(client,CLIENT,
    {id:ID,revision:1,published:true}),/Super Admin/);
  assert.equal(state.writes.length,0);
});

test("Le client ne reçoit que les modèles publiés",async()=>{
  const pub=fixture({is_published:true});
  const draft=fixture({id:"00000000-0000-4000-8000-000000000223",
    name:"Brouillon secret"});
  const {client,state}=mockDb({user:CLIENT,isAdmin:false,rows:[pub,draft]});
  const rows=await listClientPublishedTemplates(client,CLIENT);
  assert.equal(rows.length,1);
  assert.equal(rows[0].name,pub.name);
  assert.ok(state.reads.some(x=>x.table==="pictau_templates"&&
    x.filters.some(([k,v])=>k==="is_published"&&v===true)));
  const leaked=mockDb({user:CLIENT,isAdmin:false,rows:[draft]});
  // Serveur malveillant qui ignore le filtre : refus côté client.
  leaked.client.from=function(table){
    const q=client.from(table); if(table==="pictau_templates"){
      q.result=async()=>({data:[draft],error:null});
    }
    return q;
  };
  await assert.rejects(listClientPublishedTemplates(leaked.client,CLIENT),/non approuvé/);
});

test("Les versions empêchent écrasements simultanés et publication implicite",async()=>{
  const {client,state}=mockDb({rows:[fixture()]});
  const one=await saveAdminNamedTemplate(client,ADMIN,{
    id:ID,revision:1,name:"Révisé",preset:DEFAULT_PRESET
  });
  assert.equal(one.revision,2);
  assert.equal(one.is_published,false);
  await assert.rejects(saveAdminNamedTemplate(client,ADMIN,{
    id:ID,revision:1,name:"Écraser",preset:DEFAULT_PRESET
  }),/modifié ailleurs/);
  const pub=await setAdminTemplatePublication(client,ADMIN,{
    id:ID,revision:2,published:true
  });
  assert.equal(pub.revision,3);
  assert.equal(pub.is_published,true);
  await assert.rejects(setAdminTemplatePublication(client,ADMIN,{
    id:ID,revision:2,published:false
  }),/périmée/);
  assert.equal(state.rows[0].name,"Révisé");
});

// Les assertions SQL sont exécutées uniquement dans le dépôt privé sur PostgreSQL isolé.
