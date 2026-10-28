// Renderers pass only escaped, verified data; no server access in this module.
export function renderAdminRequestDesk({fr,requests,labels,escape:esc,dateLabel}){
 const r=requests,selected=r.items.find(x=>x.id===r.selectedId);
 const statusOpts=[["all",fr?"Tous":"All"],...Object.entries(labels).map(([id,n])=>[id,fr?n.fr:n.en])];
 const statusName=id=>labels[id]?.[fr?"fr":"en"]||id;
 const el=(name,id,options)=>'<div class="control"><label for="'+id+'">'+esc(name)+'</label>'+options+'</div>';
 const choices=(name,items,current,id="request-"+name)=>'<select id="'+id+'" name="'+name+'">'+items.map(([v,t])=>'<option value="'+esc(v)+'"'+(current===v?' selected':'')+'>'+esc(t)+'</option>').join("")+'</select>';
 const filters='<form data-form="admin-requests-filter" class="request-filter">'+
    el(fr?"Recherche":"Search","request-query",'<input id="request-query" name="query" type="search" maxlength="80" value="'+esc(r.query)+'">')+
    el(fr?"Statut":"Status","request-status",choices("status",statusOpts,r.status))+
    el(fr?"Tri":"Sort","request-sort",choices("sort",[["recent",fr?"Récentes":"Newest"],["oldest",fr?"Anciennes":"Oldest"]],r.sort))+
    '<button type="submit" class="btn btn-primary">'+esc(fr?"Filtrer":"Filter")+'</button></form>';
 const rows=r.items.map(x=>'<article class="request-entry"><div class="request-entry-head"><strong>'+esc(x.subject)+'</strong><span class="request-status">'+esc(statusName(x.status))+'</span></div>'+
   '<p class="request-meta">'+esc(dateLabel(x.created_at))+' · '+esc(x.requester_id)+'</p><p>'+esc(x.description)+'</p>'+
   '<button type="button" class="btn btn-light btn-small" data-action="admin-request-open" data-id="'+esc(x.id)+'">'+esc(fr?"Examiner":"Review")+'</button></article>').join("");
 const detail=selected?'<section class="request-admin-detail"><h3>'+esc(fr?"Traitement de la demande":"Review request")+'</h3>'+
   '<strong>'+esc(selected.subject)+'</strong><p>'+esc(selected.description)+'</p>'+
   '<form data-form="admin-request-update">'+
   el(fr?"Décision":"Decision","request-decision",choices("status",statusOpts.filter(x=>x[0]!=="all"&&x[0]!=="submitted"),r.draft.status,"request-decision"))+
   el(fr?"Message visible au client":"Reply visible to customer","request-note",'<textarea id="request-note" name="adminNote" maxlength="1000" rows="4">'+esc(r.draft.adminNote)+'</textarea>')+
   el(fr?"ID d’un pictogramme déjà publié (si applicable)":"Published pictogram ID (if applicable)","request-linked",'<input id="request-linked" name="linkedAssetId" value="'+esc(r.draft.linkedAssetId)+'" placeholder="UUID">')+
   '<p class="request-help">'+esc(fr?"« Acceptée » ne signifie pas « Publiée ». Un statut Publiée ou Déjà disponible exige un pictogramme effectivement publié, vérifié dans Supabase.":
    "Accepted is not Published. Published and Already available require a genuinely published pictogram, verified by Supabase.")+'</p>'+
   '<button type="submit" class="btn btn-primary"'+(r.saving?' disabled':'')+'>'+esc(r.saving?(fr?"Enregistrement…":"Saving…"):(fr?"Enregistrer le suivi":"Save follow-up"))+'</button></form>'+
   '<div class="request-admin-history"><button class="btn btn-light btn-small" data-action="admin-request-history">'+esc(fr?"Voir l’historique":"View history")+'</button>'+
   (r.historyId===selected.id?'<div class="request-history">'+(r.history.length?r.history.map(event=>
      '<p>'+esc(dateLabel(event.created_at))+' · '+esc(statusName(event.old_status)||"—")+' → '+esc(statusName(event.new_status))+'</p>').join(""):
      esc(fr?"Aucun événement affiché.":"No events to display."))+'</div>':"")+'</div>'+
   '<button class="btn btn-quiet btn-small" data-action="admin-request-close">'+esc(fr?"Fermer":"Close")+'</button></section>':"";
 const last=Math.max(0,Math.ceil(r.total/20)-1);
 return '<section class="admin-surface request-admin-panel"><div class="admin-surface-head"><div><h2>'+esc(fr?"Demandes des clients":"Customer requests")+'</h2><p>'+esc(fr?"Suivi privé, aucune publication automatique.":"Private follow-up; no automatic publishing.")+'</p></div>'+
   '<button class="btn btn-light" data-action="admin-requests-refresh">'+esc(fr?"Actualiser":"Refresh")+'</button></div>'+
   filters+(r.error?'<p class="request-error" role="alert">'+esc(r.error)+'</p>':"")+(r.saved?'<p class="request-success" role="status">'+esc(r.saved)+'</p>':"")+
   (r.loading?'<p role="status">'+esc(fr?"Chargement…":"Loading…")+'</p>':
    '<p class="request-meta">'+esc(r.total+" "+(fr?"résultat(s)":"result(s)"))+'</p>'+(rows?'<div class="request-list">'+rows+'</div>':'<p>'+esc(fr?"Aucune demande trouvée.":"No requests found.")+'</p>')+
    '<div class="admin-bank-pagination"><button data-action="admin-request-page" data-direction="-1" class="btn btn-light btn-small"'+(r.page===0?' disabled':'')+'>'+esc(fr?"Précédent":"Previous")+'</button><span>'+esc((r.page+1)+"/"+(last+1))+'</span>'+
    '<button data-action="admin-request-page" data-direction="1" class="btn btn-light btn-small"'+(r.page>=last?' disabled':'')+'>'+esc(fr?"Suivant":"Next")+'</button></div>')+detail+'</section>';
}
