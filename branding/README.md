# Identité Pict-au — Le Fil

Logo retenu pour le site au 1er novembre 2026 : trois carrés reliés + nom **Pict-au** en une typographie uniforme (Comfortaa Bold convertie en tracés). Le « a » est rond et à un seul étage, sans effet manuscrit distinct.

- `pictau-logo-le-fil.svg` : logo complet, fond transparent, pour en-têtes à partir de 681 px.
- `pictau-logo-le-fil-mobile.svg` : **les trois carrés toujours visibles**, à gauche de la même typographie, en en-tête de 680 px ou moins; sur téléphone étroit, les contrôles FR, EN et Connexion passent sur une deuxième rangée. Le logo reste horizontal et lisible.
- `pictau-logo-le-fil-wordmark.svg` : lettrage seul archivé pour usage particulier; **ne jamais utiliser pour les en-têtes**.

Les trois SVG contiennent les contours des caractères (aucune police externe à télécharger ni inclure). Ne pas réintroduire le « a » cursif/Comic Sans ni une couleur différente sur cette lettre. Ne pas introduire de sous-titre. Sur les pages du site, garder l'accessibilité via un lien d'accueil étiqueté.

Les fichiers sont les actifs maîtres de cette intégration; toute nouvelle variante de typographie doit faire l'objet d'un choix explicite avant remplacement. Le logo a été créé pour Pict-au ; aucune recherche de marques déposées n'est documentée ici.


## Contrat universel d'en-tête (1er novembre 2026)

`pictau-universal-header.css` impose l'identité **sur une ligne**: trois carrés colorés à gauche du nom Pict-au, FR, EN, et Connexion (ou Mon compte après authentification), pour l'accueil, inscription, information, connexion et chaque vue client. Le logo mobile horizontal se trouve dans `pictau-logo-le-fil-mobile.svg`. Le code applicatif affiche le même actif via la fonction `universalHeader` et garde la navigation métier sur une barre distincte.

Le test Chromium doit mesurer les positions réelles des quatre contrôles et la largeur disponible; ne jamais considérer un en-tête à deux rangées comme valide, même si aucun débordement n'est constaté. La zone Super Admin possède une navigation de sécurité distincte.
