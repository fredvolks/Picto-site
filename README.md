# Pict-au — vitrine officielle

Site commercial bilingue **FR/EN** : https://fredvolks.github.io/Picto-site/

## Ce que contient le site

- Accueil commercial blanc, sobre et responsive sur **une seule vue** aux tailles ordinaires (ordinateur, tablette, téléphone), sans onglets, simulateur ou application cliente.
- **Une seule offre**, aucun prix ni paiement inventé. Un seul bouton **« Créer mon compte »**, dans le forfait, actuellement inactif car l'inscription réelle n'est pas encore ouverte.
- **Connexion** toujours visible en haut, menant à une page d'état explicite tant que le portail sécurisé de l'application n'est pas accessible — aucune fausse connexion.
- Trois fonctions présentées, pictogrammes graphiques d'illustration non présentés comme une banque publiée; pages Contact, Conditions et Confidentialité séparées, provisoires lorsqu'une décision manque.
- Des adaptations pour grand zoom, petites hauteurs ou texte agrandi permettent le défilement nécessaire plutôt que de tronquer le contenu.

## Gouvernance

Le **seul prompt maître officiel du projet** est `docs/MASTER_PROMPT_PICTAU.md` dans le dépôt **privé** `fredvolks/pictogram`, branche `setup/prompt-maitre-projet-picto`. Le document local `docs/MASTER_PROMPT.md` de ce dépôt public est une **copie historique non canonique** et n'est pas modifié pour y ajouter de nouvelles décisions. Toutes les décisions futures appartiennent au fichier privé unique.

La vitrine demeure séparée de l'application Web, du Super Admin et de Supabase. Aucun secret, accès de démonstration ni module privé n'est intégré ici.

## Vérification

La suite `node --test tests/*.test.mjs` valide les invariants structurels. Les contrôles UX réels nécessitent des captures en Chrome à différents formats, ainsi que FR/EN et zoom. **Ne pas annoncer une inscription active tant que la véritable application n'est pas connectée.**
