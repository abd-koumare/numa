# Guide du prototype UI/UX NUMA

Le prototype couvre l’ensemble des écrans décrits dans l’inventaire directeur. Les actions modifient un état local dans le navigateur afin de permettre une recette réaliste sans backend.

## Démarrage

```powershell
npm.cmd install
npm.cmd run dev
```

Ouvrir l’adresse indiquée par Vite. La connexion de démonstration passe par le bouton SSO ORGATECH puis par le code MFA `123456`.

## Parcours de recette recommandés

1. Connexion, MFA, profil, déconnexion et demande d’accès.
2. Recherche, vues tableau/personnelle/groupée, création, modification, annulation et archivage d’un courrier.
3. Validation, rejet motivé, délégation, signature et consultation des preuves.
4. Ajout d’un utilisateur depuis l’annuaire, groupes, rôles et matrice de permissions.
5. Identité du site, navigation, paramètres système et politiques de signature.
6. Catalogues et éditeurs de listes, formulaires, règles, workflows, pages et templates.
7. Cycle annuel, réouverture justifiée, audit, sauvegarde/restauration et exploitation.

## Portée technique

- Les données métier, l’annuaire, les notifications et les configurations sont simulés dans `localStorage`.
- Les exports sont générés côté navigateur.
- La restauration utilise le code MFA de démonstration `123456`.
- Aucun appel réel à Active Directory, Keycloak, PostgreSQL, MinIO, Redis ou un service de signature n’est effectué.

Le raccordement backend devra conserver les contrats visuels et les états présentés ici, puis remplacer progressivement les données locales par les API sécurisées.
