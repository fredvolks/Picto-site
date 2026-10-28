# Pict-au — vitrine officielle

Site commercial bilingue **FR/EN** : https://fredvolks.github.io/Picto-site/

## Ce que contient le site

- Accueil commercial blanc, sobre et responsive sur **une seule vue** aux tailles ordinaires (ordinateur, tablette, téléphone), sans onglets, simulateur ou application cliente.
- **Nouvelle direction commerciale 28 octobre 2026 (§§0.3.2–0.3.3)** : aucune carte de forfait ni prix sur l'accueil. Un seul bouton actif **« Créer mon compte »** renvoie vers la page distincte `forfait.html` (formule unique, prix à confirmer, inscriptions et paiements indisponibles explicitement; aucun faux formulaire ni checkout). « Connexion » reste en haut.
- **Connexion** toujours visible en haut, menant à une page d'état explicite tant que le portail sécurisé de l'application n'est pas accessible — aucune fausse connexion.
- Direction artistique du prompt maître 2026-10-28 : fond blanc, bleu/jaune discrets, titre fort, ordinateur portable et téléphone illustratifs contenant **cinq vrais SVG d'exemple utilisés dans le code de l'application** (mais **pas** des pictogrammes approuvés/publiés), chacun avec **cadre noir, dessin centré, ligne de séparation noire, texte centré**, sans barres bleues fictives. Trois bénéfices **Trouver / Personnaliser / Imprimer** plus grands et centrés sur mobile/PC.
- Trois fonctions présentées, pictogrammes graphiques d'illustration non présentés comme une banque publiée; pages Contact, Conditions et Confidentialité séparées, provisoires lorsqu'une décision manque.
- Des adaptations pour grand zoom, petites hauteurs ou texte agrandi permettent le défilement nécessaire plutôt que de tronquer le contenu.

## Gouvernance

Le **seul prompt maître officiel du projet** est `docs/MASTER_PROMPT_PICTAU.md` dans le dépôt **privé** `fredvolks/pictogram`, branche `setup/prompt-maitre-projet-picto`. La copie locale historique `docs/MASTER_PROMPT.md` a été fusionnée puis supprimée pour éviter les maîtres concurrents (historique récupérable dans Git). Les décisions futures vont **uniquement** dans [ce prompt maître privé](https://github.com/fredvolks/pictogram/blob/setup/prompt-maitre-projet-picto/docs/MASTER_PROMPT_PICTAU.md).

La vitrine demeure séparée de l'application Web, du Super Admin et de Supabase. Aucun secret, accès de démonstration ni module privé n'est intégré ici.

## Vérification

La suite `node --test tests/*.test.mjs` valide les invariants structurels. `node tests/browser.mjs` démarre un serveur local et Chrome pour tester **10 formats de 320×568 à 1920×1080, FR/EN, zoom, 4 pages légales et liens**, en conservant les captures dans `artifacts/vitrine`. Le workflow `.github/workflows/verify.yml` déclenche ces vérifications à chaque commit sur `main` et archive les captures en cas de succès ou d'échec. **Ne pas annoncer une inscription active tant que la véritable application n'est pas connectée.**
