// Vue Super Admin responsive : aucune entrée utilisateur n'est interprétée comme HTML.
export function escapeTestClientHtml(value) {
  return String(value??"").replace(/[&<>"']/g,c=>({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
  })[c]);
}
export function renderTestClients({fr=true,items=[],busy=false,loading=false,
  error="",message="",created=null}={}) {
  const t=(f,e)=>fr?f:e,esc=escapeTestClientHtml;
  const names={decouverte:t("Découverte","Discovery"),famille:t("Famille","Family"),
    professionnel:t("Professionnel","Professional")};
  const credential=created?
    '<section class="admin-test-credentials" role="status"><h3>'+
    t("Identifiants temporaires — à copier maintenant","Temporary credentials — copy now")+'</h3>'+
    '<p>'+t("Ils ne seront plus affichés après avoir quitté cet écran.","They will disappear when you leave this screen.")+'</p>'+
    '<p><strong>'+t("Courriel","Email")+' :</strong> <code>'+esc(created.email)+'</code></p>'+
    '<p><strong>'+t("Mot de passe","Password")+' :</strong> <code>'+esc(created.password)+'</code></p></section>':"";
  const rows=items.length?items.map(item=>
    '<div class="admin-test-row"><div class="admin-test-identity"><strong>'+esc(item.label)+'</strong>'+
    '<small>'+esc(item.email)+'</small></div><div class="admin-test-plan">'+
    '<label for="pa-test-plan-'+esc(item.user_id)+'">'+t("Forfait simulé","Simulated plan")+'</label>'+
    '<select id="pa-test-plan-'+esc(item.user_id)+'" data-input="test-client-plan" data-id="'+esc(item.user_id)+'"'+(busy?' disabled':'')+'>'+
    Object.entries(names).map(([id,label])=>'<option value="'+id+'"'+(item.simulated_plan===id?' selected':'')+'>'+esc(label)+'</option>').join("")+
    '</select></div><button type="button" class="btn btn-light" data-action="test-client-delete" data-id="'+esc(item.user_id)+
    '" data-email="'+esc(item.email)+'"'+(busy?' disabled':'')+'>'+
    t("Supprimer ce test","Delete test account")+'</button></div>').join(""):
    '<p class="admin-empty">'+t("Aucun compte client de test.","No test customer accounts.")+'</p>';
  return '<section class="admin-surface admin-test-clients" aria-labelledby="pa-test-clients-heading">'+
    '<div class="admin-surface-head"><div><h2 id="pa-test-clients-heading">'+t("Clients de test","Test customers")+'</h2>'+
    '<p>'+t("Comptes artificiels indépendants des vrais clients. Aucun paiement ni forfait réel.","Synthetic accounts separate from real customers. No real subscription or payment.")+'</p></div>'+
    '<button type="button" class="btn btn-light" data-action="test-clients-refresh"'+(busy||loading?' disabled':'')+'>'+t("Actualiser","Refresh")+'</button></div>'+
    (error?'<p role="alert" class="admin-import-alert">'+esc(error)+'</p>':"")+
    (message?'<p role="status" class="admin-import-success">'+esc(message)+'</p>':"")+
    credential+
    '<form class="admin-test-create" data-form="test-clients-create">'+
    '<div class="control"><label for="pa-test-label">'+t("Nom du profil de test","Test profile name")+'</label>'+
    '<input id="pa-test-label" name="label" maxlength="50" placeholder="'+t("Ex. Client QA famille","E.g. Family QA")+'" required autocomplete="off"'+(busy?' disabled':'')+'></div>'+
    '<div class="control"><label for="pa-test-plan">'+t("Forfait simulé","Simulated plan")+'</label>'+
    '<select id="pa-test-plan" name="plan"'+(busy?' disabled':'')+'>'+
    Object.entries(names).map(([id,label])=>'<option value="'+id+'">'+esc(label)+'</option>').join("")+'</select></div>'+
    '<button type="submit" class="btn btn-primary"'+(busy||loading?' disabled':'')+'>'+t("Créer un compte de test","Create test account")+'</button></form>'+
    '<p class="admin-test-note">'+t("Les accès sont réservés au Super Admin. La suppression exige de retaper l’adresse exacte du compte. Elle efface ses données de test, jamais celles des vrais clients.","Super Admin only. Deletion requires retyping the exact account email. It clears test data, never real customer data.")+'</p>'+
    '<div class="admin-test-list" aria-live="polite">'+(loading?'<p role="status">'+t("Chargement des clients de test…","Loading test accounts…")+'</p>':rows)+'</div>'+
    '</section>';
}
