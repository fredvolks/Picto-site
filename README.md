# Pict-au — site officiel public

Ce dépôt héberge **uniquement le véritable site de présentation et de vente Pict-au** sur GitHub Pages. Il ne s'agit pas de l'application client.

- Page d'accueil bilingue FR/EN, responsive mobile, tablette et ordinateur.
- Présentation de Pict-au, illustrations explicatives, avantages et fonctionnalités.
- **Un seul forfait Pict-au Essentiel**, dont le tarif n'est pas encore annoncé.
- Aucune simulation d'achat : tant que l'abonnement n'est pas configuré, les inscriptions sont indiquées comme à venir.
- Aucun module client, connexion Google, outil super admin, base Supabase, jeton ou secret dans ce dépôt.
- HTML statique directement indexable, JS minimal pour basculer la langue, CSS responsive. Les représentations de l'application dans les appareils sont illustratives.

## Mise en ligne

GitHub Pages sur la branche `main`, dossier `/(root)`.
Adresse : https://fredvolks.github.io/Picto-site/

## Développement de l'application

Le code applicatif, la banque Supabase, les outils du super admin, l'extension Chrome et le prompt maître sont conservés dans **le dépôt privé `fredvolks/pictogram`**. Leur mise en ligne est un projet séparé, avec authentification et contrôle des accès.

## Contrôles

Exécuter `node --check src/site.js` et `node --test tests/site.test.mjs` si les tests du dépôt sont présents. Vérifier manuellement les rendus à 375, 768 et 1440 pixels avant mise en production commerciale.

## Contrôle correctif du titre — 28 octobre 2026

L'accroche était accidentellement stylée comme le point décoratif (boîte de 7 × 7 px), ce qui faisait déborder les lettres sur le titre. Le sélecteur CSS cible désormais **uniquement** `.home-kicker-dot`. Le test Chrome vérifie à présent les **vrais caractères** (via DOM Range et leurs rectangles) et échoue si les lettres quittent leur boîte ou recouvrent le titre.
