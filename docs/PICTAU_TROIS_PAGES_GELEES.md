# Pict-au — TROIS PAGES GELÉES (1er novembre 2026)

**Décision expresse du propriétaire : ne plus toucher aux pages déjà validées.**

- **Accueil** — `index.html`.
- **Créer mon compte** — `forfait.html`.
- **Connexion** — `app/index.html`, le contenu de la page Connexion dans `app/src/app.js`.

Le gel inclut les styles qui définissent leur identité : `app/src/login-harmonized.css`, `app/src/auth-layout.css`, `branding/pictau-universal-header.css`, et les deux SVG de marque `branding/pictau-logo-le-fil*.svg`. Les trois pictogrammes Trouver/Personnaliser/Imprimer restent sans support blanc extérieur, avec leur trait noir intérieur carré.

**Ne pas modifier** ces pages, leur marque, leurs pictogrammes, leur responsive, leurs traductions, leurs boutons ou leur gabarit ; ne pas appliquer d'« harmonisation » automatique. Toute modification de ces écrans demande un **déverrouillage explicite du propriétaire**, même si le prompt dit simplement « continue le développement ».

La bibliothèque officielle, les templates, les droits, l’espace admin, les exports PDF et les autres fonctionnalités peuvent être développés dans d’autres fichiers. Le rendu Connexion est gelé, **pas le reste de** `app/src/app.js`.

## Contrôle automatisé

Le fichier `docs/PICTAU_PAGES_GELEES.json` enregistre les empreintes des fichiers validés et `docs/PICTAU_LOGIN_RENDER_GELE.txt` fige le fragment de rendu de Connexion. `scripts/check-frozen-pages.mjs` vérifie la correspondance et le workflow `.github/workflows/frozen-public-pages.yml` échoue si une page gelée a changé.

**Limite :** un workflow échouant ne constitue pas à lui seul une protection de branche obligatoire. La CI avertit et refuse le succès ; un administrateur GitHub pourrait toujours la contourner si la branche n'est pas protégée.

La référence figée est l'état du site **après les PR #41 (site public) et #122 (code maître)** qui ont retiré les cadres blancs extérieurs.
