// Choix de gabarits PAR fiche de pictogramme officiel.
// Trois états distincts : préparation privée, confirmation Super Admin,
// et lecture client des seules associations confirmées + gabarits publiés.
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const MAX_PICTO_TEMPLATE_CHOICES=12;
const TEMPLATE_FIELDS="id,name,is_published,shape,width_cm,art_percent,square_center_mode,band_mm,stroke_mm,font_pt,separator_mm,border_color,font_color,colored,rotation_deg";
const DRAFT_FIELDS="catalog_id,template_ids,revision,updated_at,updated_by";
function validateId(id){if(typeof id!=="string"||!UUID.test(id))throw Error("Identifiant de pictogramme ou gabarit invalide.");return id;}
export function normalizePictoTemplateIds(value){
 if(!Array.isArray(value)||value.length>MAX_PICTO_TEMPLATE_CHOICES)
   throw Error("Choisissez au maximum 12 gabarits.");
 const list=value.map(validateId);
 if(new Set(list).size!==list.length)throw Error("Un même gabarit ne peut être choisi deux fois.");
 return list;
}
async function checkUser(client,uid){
 validateId(uid);
 const r=await client.auth.getUser();
 if(r.error)throw r.error;
 if(r.data?.user?.id!==uid)throw Error("La session a changé.");
}
async function checkAdmin(client,uid){
 await checkUser(client,uid);
 const r=await client.from("pictau_admins").select("user_id")
   .eq("user_id",uid).maybeSingle();
 if(r.error)throw r.error;
 if(r.data?.user_id!==uid)throw Error("Réservé au Super Admin.");
}
export async function getAdminPictoTemplateChoices(client,uid,catalogId){
 validateId(catalogId);await checkAdmin(client,uid);
 const draft=await client.from("pictau_picto_template_drafts").select(DRAFT_FIELDS)
   .eq("catalog_id",catalogId).maybeSingle();
 if(draft.error)throw draft.error;
 const receipt=await client.from("pictau_picto_template_confirmations")
   .select("catalog_id,confirmed_revision,confirmed_by,confirmed_at")
   .eq("catalog_id",catalogId).maybeSingle();
 if(receipt.error)throw receipt.error;
 const choices=await client.from("pictau_picto_template_choices")
   .select("catalog_id,template_id").eq("catalog_id",catalogId);
 if(choices.error)throw choices.error;
 await checkAdmin(client,uid);
 const selected=draft.data?.template_ids??[];
 const confirmed=(choices.data||[]).map(row=>row.template_id);
 normalizePictoTemplateIds(selected);normalizePictoTemplateIds(confirmed);
 if(draft.data&&(draft.data.catalog_id!==catalogId||
   !Number.isSafeInteger(draft.data.revision)||draft.data.revision<1)||
   receipt.data?.catalog_id!==undefined&&receipt.data.catalog_id!==catalogId||
   (choices.data||[]).some(row=>row.catalog_id!==catalogId))
   throw Error("Fiche de visibilité des gabarits incohérente.");
 return {catalogId,selected,confirmed,revision:draft.data?.revision||0,
   confirmedRevision:receipt.data?.confirmed_revision||0,
   confirmedAt:receipt.data?.confirmed_at||null};
}
export async function saveAdminPictoTemplateDraft(client,uid,{catalogId,ids,revision=0}){
 validateId(catalogId);const templateIds=normalizePictoTemplateIds(ids);
 if(!Number.isSafeInteger(revision)||revision<0)throw Error("Version des choix invalide.");
 await checkAdmin(client,uid);
 const base=client.from("pictau_picto_template_drafts");
 const q=revision===0
   ?base.insert({catalog_id:catalogId,template_ids:templateIds})
      .select(DRAFT_FIELDS).single()
   :base.update({template_ids:templateIds})
      .eq("catalog_id",catalogId).eq("revision",revision)
      .select(DRAFT_FIELDS).maybeSingle();
 const r=await q;if(r.error)throw r.error;
 if(!r.data)throw Error("Choix modifiés depuis un autre écran; actualisez la fiche.");
 await checkAdmin(client,uid);
 if(r.data.catalog_id!==catalogId||r.data.revision!==revision+1||
   JSON.stringify(r.data.template_ids)!==JSON.stringify(templateIds))
   throw Error("La préparation des choix n'a pas été confirmée par le serveur.");
 // Cette action ne publie RIEN. Les anciens choix client restent en place.
 return {catalogId,selected:templateIds,revision:r.data.revision,awaitingConfirmation:true};
}
export async function confirmAdminPictoTemplateChoices(client,uid,{
 catalogId,revision,confirmedByUser
}){
 validateId(catalogId);
 if(!Number.isSafeInteger(revision)||revision<1||confirmedByUser!==true)
   throw Error("Confirmation explicite requise avant de modifier la fiche client.");
 await checkAdmin(client,uid);
 const r=await client.rpc("pictau_confirm_picto_template_choices",{
   p_catalog_id:catalogId,p_revision:revision,p_confirm:true
 });
 if(r.error)throw r.error;
 await checkAdmin(client,uid);
 if(!Number.isSafeInteger(r.data)||r.data<0||r.data>MAX_PICTO_TEMPLATE_CHOICES)
   throw Error("Confirmation non vérifiée; actualisez la fiche.");
 const receipt=await client.from("pictau_picto_template_confirmations")
   .select("catalog_id,confirmed_revision,confirmed_by,confirmed_at")
   .eq("catalog_id",catalogId).maybeSingle();
 if(receipt.error)throw receipt.error;
 if(receipt.data?.catalog_id!==catalogId||
    receipt.data.confirmed_revision!==revision||
    receipt.data.confirmed_by!==uid||!receipt.data.confirmed_at)
   throw Error("Le reçu de confirmation du Super Admin est absent.");
 return {catalogId,confirmedCount:r.data,confirmedRevision:revision,
   confirmedAt:receipt.data.confirmed_at};
}
export async function listClientPictoTemplateChoices(client,uid,catalogId){
 validateId(catalogId);await checkUser(client,uid);
 const r=await client.from("pictau_templates")
   .select(TEMPLATE_FIELDS+",choices:pictau_picto_template_choices!inner(catalog_id)")
   .eq("is_published",true)
   .eq("choices.catalog_id",catalogId)
   .order("name",{ascending:true}).limit(MAX_PICTO_TEMPLATE_CHOICES+1);
 if(r.error)throw r.error;
 await checkUser(client,uid);
 if(!Array.isArray(r.data)||r.data.length>MAX_PICTO_TEMPLATE_CHOICES)
   throw Error("Choix de gabarits client incohérents.");
 const seen=new Set();
 for(const row of r.data){
   if(!row||!validateId(row.id)||row.is_published!==true||
      typeof row.name!=="string"||!row.name.trim()||
      !Array.isArray(row.choices)||row.choices.length!==1||
      row.choices[0]?.catalog_id!==catalogId||seen.has(row.id))
     throw Error("Un gabarit non confirmé est apparu dans la fiche client.");
   seen.add(row.id);
 }
 return r.data.map(({choices:_internal,...row})=>row);
}
