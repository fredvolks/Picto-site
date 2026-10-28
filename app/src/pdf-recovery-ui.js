// Présentation pure du PDF déjà produit, mais non confirmé dans l'archive privée.
// Aucune donnée conservée dans localStorage, aucun transfert, aucune impression prétendue.
export function renderPdfRecovery({pending,uid,busy=false,language="fr",escape,icon}){
  if(!pending||!uid||pending.uid!==uid||busy)return "";
  const fr=language==="fr";
  return '<section class="pdf-recovery panel" role="status" aria-live="polite">'
    +'<h2>'+escape(fr?"PDF créé, mais non archivé":"PDF created, but not archived")+'</h2>'
    +'<p>'+escape(fr
      ?"Une copie temporaire est disponible tant que cette page reste ouverte. Téléchargez-la avant de quitter; vous pourrez ensuite l’archiver manuellement dans Mes fichiers."
      :"A temporary copy is available while this page stays open. Download it before leaving; you can archive it manually in My files later.")+'</p>'
    +'<strong>'+escape(pending.title)+'</strong>'
    +'<button type="button" class="btn btn-primary" data-action="download-unarchived-pdf">'
    +icon("file-text","btn-icon")+escape(fr?"Télécharger le PDF non archivé":"Download unarchived PDF")+'</button>'
    +'<button type="button" class="btn btn-light" data-action="discard-unarchived-pdf">'
    +escape(fr?"Écarter cette copie temporaire":"Discard this temporary copy")+'</button>'
    +'</section>';
}
