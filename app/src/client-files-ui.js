// Vue pure « Mes fichiers ». Aucune écriture, aucune clé API, aucun HTML PDF tiers.
export function renderClientFiles({language,logged,files,escape:e,icon}){
 const fr=language==="fr";
 const t=(a,b)=>fr?a:b;
 const typeName={routine:t("Routine","Routine"),sheet:t("Feuille","Sheet"),board:t("Tableau","Board")};
 const date=raw=>{
   const n=Date.parse(raw||"");
   return Number.isFinite(n)?new Date(n).toLocaleDateString(fr?"fr-CA":"en-CA",
     {year:"numeric",month:"short",day:"numeric"}):"—";
 };
 const pageMax=Math.max(0,Math.ceil(files.total/20)-1);
 const panel='<div class="files-heading"><div><span class="client-detail-kicker">'+t("VOTRE ESPACE PRIVÉ","YOUR PRIVATE SPACE")+'</span>'
   +'<h1>'+t("Mes fichiers","My files")+'</h1>'
   +'<p>'+t("Retrouvez vos PDF préparés et réimprimez le document original, sans le reconstruire.","Find your prepared PDFs and print the original document without rebuilding it.")+'</p></div></div>';
 if(!logged)return '<div class="files-page">'+panel+'<section class="panel files-sign-in"><h2>'+t("Connectez-vous pour retrouver vos documents","Sign in to find your documents")+'</h2>'
  +'<p>'+t("Les PDF sont conservés de façon privée et associés à votre compte Google. Utilisez « Continuer avec Google » dans l’en-tête.","PDFs are stored privately under your Google account. Use Continue with Google in the header.")+'</p></section></div>';
 const form='<section class="panel files-upload-panel"><h2>'+t("Archiver un PDF existant","Archive an existing PDF")+'</h2>'
   +'<p>'+t("Vous pouvez archiver ici un PDF existant. Depuis une routine ou un tableau d’essai, le bouton « Créer et archiver le PDF » permet aussi de sauvegarder une nouvelle composition. Contrôlez sa taille réelle avant d’imprimer.","You can archive an existing PDF here. From a sample routine or board, Create and archive PDF can also save a new composition. Check its actual size before printing.")+'</p>'
   +'<form data-form="archive-pdf" class="files-upload-form">'
   +'<div class="control"><label for="files-title">'+t("Nom du document","Document name")+'</label>'
   +'<input id="files-title" name="title" type="text" required maxlength="120" placeholder="'+t("Ma routine du soir","My evening routine")+'" value="'+e(files.draft.title)+'"></div>'
   +'<div class="control"><label for="files-type">'+t("Type de document","Document type")+'</label>'
   +'<select id="files-type" name="documentType">'+["routine","sheet","board"].map(key=>'<option value="'+key+'"'+(files.draft.documentType===key?' selected':'')+'>'+e(typeName[key])+'</option>').join("")+'</select></div>'
   +'<div class="control files-file-control"><label for="files-pdf">'+t("Fichier PDF de votre appareil","PDF file from your device")+'</label>'
   +'<input id="files-pdf" name="pdf" type="file" accept=".pdf,application/pdf" required>'
   +'<small>'+t("PDF d’origine : copie privée non modifiée (limite technique 20 Mo).","Original PDF: unchanged private copy (technical limit 20 MB).")+'</small></div>'
   +'<button type="submit" class="btn btn-primary"'+(files.busy?' disabled':'')+'>'+icon("save","btn-icon")+t(files.busy?"Archivage…":"Archiver le PDF",files.busy?"Archiving…":"Archive PDF")+'</button></form></section>';
 const filters='<form data-form="files-filter" class="files-filters"><div class="control"><label for="files-search">'+t("Rechercher par nom","Search by name")+'</label>'
   +'<input id="files-search" name="query" type="search" maxlength="80" value="'+e(files.query)+'" placeholder="'+t("Ex. routine du soir","E.g. evening routine")+'"></div>'
   +'<div class="control"><label for="files-filter-type">'+t("Type","Type")+'</label>'
   +'<select id="files-filter-type" name="type"><option value="all">'+t("Tous les documents","All documents")+'</option>'
   +["routine","sheet","board"].map(key=>'<option value="'+key+'"'+(files.type===key?' selected':'')+'>'+e(typeName[key])+'</option>').join("")+'</select></div>'
   +'<button type="submit" class="btn btn-light">'+icon("search","btn-icon")+t("Rechercher","Search")+'</button></form>';
 const list=files.loading?'<p class="files-feedback" role="status">'+t("Chargement des fichiers privés…","Loading private files…")+'</p>'
   :files.items.length?'<div class="files-list">'+files.items.map(doc=>{
      const renaming=files.renameId===doc.id;
      return '<article class="files-entry"><div class="files-entry-icon" aria-hidden="true">'+icon("file-text")+'</div>'
       +'<div class="files-entry-body"><strong>'+e(doc.title)+'</strong>'
       +'<div class="files-meta"><span>'+e(typeName[doc.document_type]||doc.document_type)+'</span><span>'+e(date(doc.created_at))+'</span>'
       +'<span>PDF'+(doc.page_count?" · "+doc.page_count+" "+t("pages","pages"):"")+'</span></div>'
       +(renaming?'<form data-form="files-rename" data-id="'+e(doc.id)+'" class="files-rename"><label for="rename-'+e(doc.id)+'">'+t("Nouveau nom","New name")+'</label>'
        +'<input id="rename-'+e(doc.id)+'" maxlength="120" required name="title" value="'+e(doc.title)+'">'
        +'<button type="submit" class="btn btn-primary btn-small"'+(files.busy?' disabled':'')+'>'+t("Enregistrer","Save")+'</button>'
        +'<button type="button" class="btn btn-light btn-small" data-action="files-rename-cancel">'+t("Annuler","Cancel")+'</button></form>':"")+'</div>'
       +'<div class="files-entry-actions"><button type="button" class="btn btn-light btn-small" data-action="files-preview" data-id="'+e(doc.id)+'"'+(files.busy?' disabled':'')+'>'+icon("search","btn-icon")+t("Aperçu","Preview")+'</button>'
       +'<button type="button" class="btn btn-primary btn-small" data-action="files-reprint" data-id="'+e(doc.id)+'"'+(files.busy?' disabled':'')+'>'+icon("print","btn-icon")+t("Réimprimer","Reprint")+'</button>'
       +'<button type="button" class="btn btn-light btn-small" data-action="files-download" data-id="'+e(doc.id)+'"'+(files.busy?' disabled':'')+'>'+t("Télécharger PDF","Download PDF")+'</button>'
       +'<button type="button" class="btn btn-light btn-small" data-action="files-rename-open" data-id="'+e(doc.id)+'">'+t("Renommer","Rename")+'</button></div></article>';
     }).join("")+'</div>'
   :'<p class="files-empty">'+t("Aucun PDF archivé pour le moment. Vous pouvez en ajouter un ci-dessus.","No archived PDFs yet. You can add one above.")+'</p>';
 const pages='<div class="files-pagination"><button type="button" class="btn btn-light btn-small" data-action="files-page" data-direction="-1"'+(files.page===0||files.loading?' disabled':'')+'>'+t("Précédent","Previous")+'</button>'
    +'<span>'+e((files.page+1)+" / "+(pageMax+1)+" · "+files.total)+"</span>"
    +'<button type="button" class="btn btn-light btn-small" data-action="files-page" data-direction="1"'+(files.page>=pageMax||files.loading?' disabled':'')+'>'+t("Suivant","Next")+'</button></div>';

 const preview=files.preview&&files.preview.id?
   '<div class="files-preview-backdrop"><section class="files-preview-modal" role="dialog" aria-modal="true" aria-labelledby="files-preview-heading">'
     +'<div class="files-preview-head"><h2 id="files-preview-heading">'+t("Aperçu du document","Document preview")+'</h2>'
     +'<button type="button" class="btn btn-light btn-small" data-action="files-preview-close" aria-label="'+t("Fermer l’aperçu","Close preview")+'">'+icon("close","btn-icon")+t("Fermer","Close")+'</button></div>'
     +'<p class="files-preview-title">'+e(files.preview.title)+'</p>'
     +(files.preview.url?
       '<figure class="files-preview-figure"><img src="'+e(files.preview.url)+'" alt="'+e(t("Page ","Page ")+(Number.isInteger(files.preview.pageIndex)?files.preview.pageIndex+1:1)+t(" du PDF original : "," of the original PDF: ")+files.preview.title)+'"><figcaption>'+t("Page du PDF original enregistré, sans régénération.","Page of the saved original PDF, without rebuilding it.")+'</figcaption></figure>'
       +(files.preview.pages?.length>1?
         '<nav class="files-preview-pagination" aria-label="'+t("Pages du PDF original","Original PDF pages")+'">'
         +'<button type="button" class="btn btn-light btn-small" data-action="files-preview-previous"'+((files.preview.pageIndex||0)===0?' disabled':'')+'>'+t("Page précédente","Previous page")+'</button>'
         +'<span role="status" aria-live="polite">'+t("Page ","Page ")+((files.preview.pageIndex||0)+1)+' / '+files.preview.pages.length+'</span>'
         +'<button type="button" class="btn btn-light btn-small" data-action="files-preview-next"'+((files.preview.pageIndex||0)===files.preview.pages.length-1?' disabled':'')+'>'+t("Page suivante","Next page")+'</button></nav>'
         :'<p class="files-preview-page-label">'+t("Première page du PDF original","First page of the original PDF")+'</p>')
       :'<p class="files-preview-fallback">'+t("Ce format PDF ne contient pas de miniature compatible. Vous pouvez ouvrir le PDF original dans le lecteur de votre navigateur.","This PDF format has no compatible thumbnail. You can open the original PDF in your browser’s viewer.")+'</p>')
     +'<button type="button" class="btn btn-primary" data-action="files-reprint" data-id="'+e(files.preview.id)+'">'+icon("file-text","btn-icon")+t("Ouvrir le PDF original","Open original PDF")+'</button>'
     +'</section></div>':"";
 return '<div class="files-page">'+panel
   +(files.error?'<p class="request-error" role="alert">'+e(files.error)+'</p>':"")
   +(files.message?'<p class="request-success" role="status">'+e(files.message)+'</p>':"")
   +form+'<section class="panel files-history"><div class="files-history-head"><h2>'+t("Documents préparés","Prepared documents")+'</h2>'
   +'<button type="button" class="btn btn-light btn-small" data-action="files-refresh"'+(files.loading?' disabled':'')+'>'+t("Actualiser","Refresh")+'</button></div>'
   +filters+list+pages+'</section>'+preview+'</div>';
}
