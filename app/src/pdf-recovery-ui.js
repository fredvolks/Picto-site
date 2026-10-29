// Présentation pure du PDF déjà produit, mais non confirmé dans l'archive privée.
// Aucune donnée conservée dans localStorage, aucun transfert, aucune impression prétendue.
export function renderPdfRecovery({pending,uid,busy=false,retrying=false,error="",language="fr",escape,icon}){
  if(!pending||!uid||pending.uid!==uid||busy)return "";
  const fr=language==="fr",imported=pending.imported===true;
  return '<section class="pdf-recovery panel" role="status" aria-live="polite">'
    +'<h2>'+escape(imported?
      (fr?"PDF sélectionné, mais non archivé":"Selected PDF not archived"):
      (fr?"PDF créé, mais non archivé":"PDF created, but not archived"))+'</h2>'
    +'<p>'+escape(imported?
      (fr?"Le PDF original choisi sur votre appareil reste disponible temporairement dans cet onglet. Réessayez l’archivage du même fichier, sans changer son contenu, ou téléchargez cette copie avant de quitter. Aucun document n’est déclaré archivé sans confirmation du serveur.":
          "Your selected original PDF is temporarily available in this tab. Retry archiving the same file without changing it, or download this copy before leaving. No archive is confirmed without server verification."):
      (fr?"Une copie temporaire est disponible tant que cette page reste ouverte. Réessayez l’archivage sans recréer le PDF, ou téléchargez-la avant de quitter. La reprise utilise le même identifiant privé pour éviter les doublons après perte de confirmation réseau.":
          "A temporary copy is available while this page stays open. Retry archiving without rebuilding the PDF, or download it before leaving. Recovery uses the same private document ID to avoid duplicates after a lost network acknowledgment."))+'</p>'
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
