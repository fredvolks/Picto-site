// Présentation pure du PDF déjà produit, mais non confirmé dans l'archive privée.
// Aucune donnée conservée dans localStorage, aucun transfert, aucune impression prétendue.
export function renderPdfRecovery({pending,uid,busy=false,retrying=false,error="",language="fr",escape,icon}){
  if(!pending||!uid||pending.uid!==uid||busy)return "";
  const fr=language==="fr";
  return '<section class="pdf-recovery panel" role="status" aria-live="polite">'
    +'<h2>'+escape(fr?"PDF créé, mais non archivé":"PDF created, but not archived")+'</h2>'
    +'<p>'+escape(fr
      ?"Une copie temporaire est disponible tant que cette page reste ouverte. Réessayez l’archivage sans recréer le PDF, ou téléchargez-la avant de quitter. Si la confirmation réseau a été perdue, vérifiez Mes créations pour éviter un doublon."
      :"A temporary copy is available while this page stays open. Retry archiving without rebuilding the PDF, or download it before leaving. If the network confirmation was lost, check My creations to avoid duplicates.")+'</p>'
    +'<strong>'+escape(pending.title)+'</strong>'
    +(error?'<p role="alert" class="pdf-recovery-error">'+escape(error)+'</p>':'')
    +(retrying?'<p role="status" class="pdf-recovery-progress">'
      +escape(fr?"Nouvel essai d’archivage en cours…":"Retrying archive…")+'</p>':'')
    +'<button type="button" class="btn btn-primary" data-action="retry-unarchived-pdf"'
    +(retrying?' disabled':'')+'>'+icon("save","btn-icon")
    +escape(fr?"Réessayer l’archivage":"Retry archiving")+'</button>'
    +'<button type="button" class="btn btn-light" data-action="download-unarchived-pdf"'
    +(retrying?' disabled':'')+'>'+icon("file-text","btn-icon")
    +escape(fr?"Télécharger le PDF non archivé":"Download unarchived PDF")+'</button>'
    +'<button type="button" class="btn btn-light" data-action="discard-unarchived-pdf"'
    +(retrying?' disabled':'')+'>'+escape(fr?"Écarter cette copie temporaire":"Discard this temporary copy")+'</button>'
    +'</section>';
}
