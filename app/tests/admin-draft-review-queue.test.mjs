import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {planNextPrivateDraftReview,ADMIN_BANK_PAGE_SIZE} from "../src/admin-bank.js";
const app=readFileSync(new URL("../src/app.js",import.meta.url),"utf8");

test("File Super Admin : ouvre les brouillons privés dans l'ordre de la page",()=>{
 const drafts=Array.from({length:3},(_,i)=>({id:"draft-"+i,status:"draft"}));
 const seen=new Set();
 assert.deepEqual(planNextPrivateDraftReview({items:drafts,seen,total:3,page:0}),
   {kind:"open",id:"draft-0"});
 seen.add("draft-0");
 assert.deepEqual(planNextPrivateDraftReview({items:drafts,seen,total:3,page:0}),
   {kind:"open",id:"draft-1"});
 seen.add("draft-1");seen.add("draft-2");
 assert.deepEqual(planNextPrivateDraftReview({items:drafts,seen,total:3,page:0}),
   {kind:"done"});
 assert.equal(seen.size,3);
});

test("File Super Admin : franchit les pages sans oublier les brouillons vus",()=>{
 const first=Array.from({length:ADMIN_BANK_PAGE_SIZE},(_,i)=>({
   id:"review-"+i,status:"draft"
 }));
 const seen=new Set(first.map(x=>x.id));
 const next=planNextPrivateDraftReview({items:first,seen,total:29,page:0});
 assert.deepEqual(next,{kind:"page",page:1});
 const second=Array.from({length:5},(_,i)=>({id:"review-"+(i+24),status:"draft"}));
 assert.deepEqual(planNextPrivateDraftReview({items:second,seen,total:29,page:1}),
   {kind:"open",id:"review-24"});
 seen.add("review-24");seen.add("review-25");seen.add("review-26");seen.add("review-27");seen.add("review-28");
 assert.deepEqual(planNextPrivateDraftReview({items:second,seen,total:29,page:1}),
   {kind:"done"});
});

test("File Super Admin : aucune fiche publiée et aucune réponse incohérente",()=>{
 const payload={items:[{id:"private-draft",status:"draft"}],
   seen:new Set(),total:1,page:0};
 for(const change of [
   {items:[{id:"published",status:"published"}]},
   {items:[{id:"same",status:"draft"},{id:"same",status:"draft"}]},
   {items:[{id:"",status:"draft"}]},
   {total:-1},{page:-1},{seen:[]}
 ])assert.throws(()=>planNextPrivateDraftReview({...payload,...change}),/incohérente/);
});

test("File de révision intégrée : ouverture privée, confirmation humaine et aucun publish automatique",()=>{
 assert.match(app,/planNextPrivateDraftReview\(/);
 assert.match(app,/if\(a==="admin-draft-review-start"\)/);
 assert.match(app,/if\(a==="admin-draft-review-next"\)/);
 assert.match(app,/if\(a==="admin-draft-review-stop"\)/);
 assert.match(app,/data-action="admin-draft-review-start"/);
 assert.match(app,/data-action="admin-draft-review-next"/);
 assert.match(app,/bankFilters\.status="draft"/);
 assert.match(app,/bankFilters\.sort="oldest"/);
 const next=app.split('if(a==="admin-draft-review-next")')[1]
   .split('if(a==="admin-draft-review-stop")')[0];
 assert.doesNotMatch(next,/publishReviewedPictogram|update\(|insert\(/);
 const publish=app.split('if(publishForm){')[1]
   .split('const usedForm=')[0];
 assert.match(publish,/\[name="confirmed"\]/);
 assert.match(publish,/window\.confirm\(/);
 assert.ok(publish.indexOf("await publishReviewedPictogram")<
    publish.indexOf("advanceDraftReviewQueue()"));
});
