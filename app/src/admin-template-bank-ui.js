// Bank of named versioned pictogram templates, ready for explicit Super Admin
// activation only after the isolated Supabase migration and Auth review.
const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({
 "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
}[c]));
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function renderAdminNamedTemplateBank({
 templates=[],selectedId=null,name="",widthCm=5,rotationDeg=0,
 busy=false,loading=false,error="",message="",fr=true
}={}){
 if(!Array.isArray(templates)||new Set(templates.map(x=>x.id)).size!==templates.length||
    templates.some(x=>!x||!UUID.test(x.id||"")||typeof x.name!=="string"||
      !Number.isSafeInteger(x.revision)||x.revision<1||
      typeof x.is_published!=="boolean"))
   throw Error("Réponse des gabarits nommés incohérente.");
 if(selectedId!==null&&!templates.some(x=>x.id===selectedId))
   throw Error("Le gabarit à modifier n'existe plus.");
 const active=templates.find(x=>x.id===selectedId);
 const tr=(fr?
  ["Mes gabarits enregistrés","Nouveau gabarit","Nom du gabarit","Largeur (cm)",
   "Rotation (degrés)","Enregistrer en brouillon","Enregistrer les modifications",
   "Publier","Retirer du client","Publié","Brouillon",
   "Les nouveaux gabarits restent privés jusqu'à leur publication.",
   "Aucun gabarit enregistré."]:
  ["Saved templates","New template","Template name","Width (cm)",
   "Rotation (degrees)","Save as draft","Save changes","Publish","Hide from clients",
   "Published","Draft","New templates stay private until published.",
   "No saved templates."]);
 return '<section class="admin-named-templates" aria-label="'+esc(tr[0])+'">'
  +'<h2>'+esc(tr[0])+'</h2>'
  +(loading?'<p role="status">'+esc(fr?"Chargement des gabarits…":"Loading templates…")+'</p>':"")
  +(error?'<p role="alert">'+esc(error)+'</p>':"")
  +(message?'<p role="status">'+esc(message)+'</p>':"")
  +'<div class="admin-named-template-fields">'
  +'<div><label for="pa-named-template-name">'+esc(tr[2])+'</label>'
  +'<input id="pa-named-template-name" type="text" maxlength="80" data-input="admin-named-template-name" '
  +'value="'+esc(name)+'" autocomplete="off"'+(busy?" disabled":"")+'></div>'
  +'<div><label for="pa-named-template-width">'+esc(tr[3])+'</label>'
  +'<input id="pa-named-template-width" type="number" min="2" max="10" step=".25" data-input="admin-named-template-width" '
  +'value="'+esc(widthCm)+'"'+(busy?" disabled":"")+'></div>'
  +'<div><label for="pa-named-template-rotation">'+esc(tr[4])+'</label>'
  +'<input id="pa-named-template-rotation" type="number" min="-180" max="180" step="1" data-input="admin-named-template-rotation" '
  +'value="'+esc(rotationDeg)+'"'+(busy?" disabled":"")+'></div>'
  +'</div>'
  +'<p class="admin-named-template-help">'+esc(tr[11])+'</p>'
  +'<div class="admin-named-template-actions">'
  +'<button type="button" data-action="admin-named-template-new"'+(busy?" disabled":"")+'>'+esc(tr[1])+'</button>'
  +'<button type="button" data-action="admin-named-template-save"'+(busy||loading?" disabled":"")+'>'+esc(active?tr[6]:tr[5])+'</button></div>'
  +(!templates.length?'<p role="status">'+esc(tr[12])+'</p>':
   '<ul class="admin-named-template-list">'+templates.map(t=>
     '<li><button type="button" data-action="admin-named-template-load" data-id="'+esc(t.id)+'" '
       +(busy?"disabled ":"")+'aria-pressed="'+String(selectedId===t.id)+'">'
       +esc(t.name)+' · v'+t.revision+'</button>'
       +'<span>'+esc(t.is_published?tr[9]:tr[10])+'</span>'
       +'<button type="button" data-action="admin-named-template-publish" data-id="'+esc(t.id)+'" '
       +'data-revision="'+t.revision+'" data-publish="'+String(!t.is_published)+'"'
       +(busy?" disabled":"")+'>'+esc(t.is_published?tr[8]:tr[7])+'</button></li>'
   ).join("")+'</ul>')
  +'</section>';
}
