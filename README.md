# Pict-au — démo publique et connexion Google

Accueil responsive avec un seul forfait, pictogrammes fictifs de démonstration et routines visuelles. **Le prix de l'abonnement n'est pas fixé; aucun paiement n'est actif.**

## Connexion Google

- Bouton « Continuer avec Google » dans la page d'accueil et dans la bibliothèque, via Supabase Auth PKCE.
- La clé présente dans `src/google-auth.js` est une clé **publiable** Supabase, sans secret Google ni service_role.
- Pour que le retour fonctionne, autoriser `https://fredvolks.github.io/Picto-site/` dans **Supabase Authentication → URL Configuration → Redirect URLs**.
- Le client Google doit autoriser `https://hwgarcmyhmmovbxdngwc.supabase.co/auth/v1/callback` comme URI de redirection.
- Vérifier une connexion réelle avec Google et la déconnexion avant de qualifier l'authentification de validée.
- Les utilisateurs qui se connectent n'obtiennent **jamais** automatiquement des droits super admin ; le super admin réel reste hors de ce dépôt public.

## Hébergement

GitHub Pages, branche `main`, `/(root)`. Adresse attendue après déploiement : https://fredvolks.github.io/Picto-site/

## Sécurité et limites

Ce dépôt ne comporte pas de vraie interface de publication administrateur. Les images utilisées dans la démo ne sont pas celles de la bibliothèque privée Supabase. Aucun abonnement n'est activé.
