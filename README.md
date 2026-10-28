# Pict-au — site officiel unique

**Adresse de production :** https://fredvolks.github.io/Picto-site/

Ce dépôt public est **le site Pict-au**, et non une vitrine distincte. Le dépôt privé `fredvolks/pictogram` fournit le code de l’application qui est publiée automatiquement dans le dossier `app/` du présent site.

## Parcours publié

- **Accueil :** `index.html`, responsive FR/EN, une vue aux dimensions ordinaires. Les trois bénéfices sont Trouver / Personnaliser / Imprimer. Pictogrammes d’exemple en noir et blanc, cadres et traits noirs, textes centrés.
- **Créer mon compte :** `forfait.html`, une formule sans prix inventé; aucune inscription payante ni aucun paiement actif.
- **Connexion :** `connexion.html` mène réellement à `./app/`, où l’application affiche la connexion Google. Le fonctionnement OAuth sur l’URL de production reste à vérifier avec un vrai compte.
- **Espace Pict-au :** `app/`, ouvrant directement la bibliothèque; routines, tableaux, « Mes fichiers » et fonctionnalités administratives selon l’autorisation serveur. « Accueil » ramène à la vraie page d’accueil, sans deuxième page commerciale.

## Confidentialité et état fonctionnel

Le dossier public `app/` contient du code JavaScript, CSS et HTML consultable par toute personne qui ouvre le site : c’est normal pour une application Web statique. **Il ne contient pas les PDF privés, les brouillons, les migrations ni les secrets serveur.** L’accès aux fichiers clients et aux brouillons administratifs dépend des sessions Supabase, des politiques RLS et des compartiments Storage privés. Le menu Super Admin n’est accessible qu’après vérification du rôle administrateur auprès de Supabase.

**À ne pas confondre avec une application commercialement lancée :** la bibliothèque visible pour les clients contient encore des SVG fictifs d’essai. Les fonctions PDF et d’archives sont développées mais leur parcours entre deux comptes Google et deux appareils reste à tester, tout comme les impressions papier à échelle 100 %. La création de comptes payants, les prix et Stripe ne sont pas activés.

## Déploiement automatique

Le pipeline est défini dans le dépôt privé `fredvolks/pictogram`, branche `release/github-pages-site`, fichier `.github/workflows/pages-release.yml`. Il exécute les contrôles, prépare exclusivement les fichiers Web autorisés puis pousse les changements de `app/` et `connexion.html` vers la branche `main` de ce dépôt en utilisant le secret GitHub Actions `PICTAU_SITE_DEPLOY_TOKEN`. Sa valeur doit rester uniquement dans les paramètres GitHub. **L’accueil à la racine n’est pas écrasé par les déploiements de l’application.**

Premier transfert automatisé validé : https://github.com/fredvolks/pictogram/actions/runs/40727829052 ; publication Pages du site après tests : https://github.com/fredvolks/Picto-site/actions/runs/40729822110.

Les tests propres au dépôt public s’exécutent dans `.github/workflows/verify.yml` et `.github/workflows/site-check.yml` : vérifications structurelles, Chrome sur différentes tailles FR/EN, zoom et captures. Les anciennes assertions décrivant la connexion comme fermée ou un forfait sur l’accueil ont été remplacées par les exigences actuelles.

## Prompt maître et gouvernance

**[Commencer le travail depuis le point d'entrée privé unique](https://github.com/fredvolks/pictogram/blob/release/github-pages-site/docs/WORK_START.md).** Le [renvoi local](docs/WORK_START.md) ne duplique pas la routine. Les décisions et l'état restent dans le dépôt privé; il n'y a pas de second maître ou suivi dans ce dépôt public.

Le **seul prompt maître Pict-au** est `docs/MASTER_PROMPT_PICTAU.md` dans le dépôt privé `fredvolks/pictogram`, branche active `release/github-pages-site` : https://github.com/fredvolks/pictogram/blob/release/github-pages-site/docs/MASTER_PROMPT_PICTAU.md. `docs/WORK_CONTINUATION.md` contient la passation factuelle. Les six rôles de revue, les normes pictogrammes, la direction mobile premium et le déploiement progressif sont définis là-bas. **Ne pas créer d’autre prompt maître, de deuxième site ou de projet Vercel pour Pict-au.**
