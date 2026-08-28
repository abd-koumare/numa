# NUMA — Point de reprise de la productisation

Ce document est la source de vérité persistante pour reprendre l’implémentation sans réauditer tout le dépôt. Il doit être mis à jour à la fin de chaque compartiment, avant tout changement de sous-système et avant toute interruption volontaire.

## Règles de travail

1. Un seul compartiment est actif à la fois.
2. Ne pas modifier le frontend pendant un compartiment backend, sauf correction indispensable à la compilation d’un contrat public déjà finalisé.
3. Terminer les tests et contrôles du compartiment avant d’entamer le suivant.
4. Après une reprise de contexte, lire uniquement ce fichier, puis les fichiers listés dans « Prochaine reprise ».
5. Conserver les changements préexistants de l’utilisateur et ne jamais réinitialiser le worktree.
6. Toute décision nouvelle ou modification d’interface publique est consignée ici immédiatement.

## Décisions approuvées

- Le runtime est piloté par les configurations publiées.
- Les données de démonstration sont isolées et interdites en production.
- Les enregistrements existants restent épinglés à leur bundle de configuration immuable.
- Le moteur de règles et de workflow utilise un DSL JSON déclaratif ; aucun code ou texte arbitraire n’est exécuté.
- La signature numérique externe passe par un adaptateur désactivé par défaut.
- Les templates couvrent les blueprints de configuration et les documents DOCX.
- Les API de correspondance existantes restent compatibles.
- Les mutations versionnées utilisent `If-Match`.

## Compartiments

### B0 — Stabilisation de la fondation backend — IMPLÉMENTÉ, VALIDATION PYTHON DIFFÉRÉE

Objectif : obtenir un socle Django cohérent, migrable et testé avant d’ajouter les autres capacités.

Déjà présent :

- démarrage Docker séparant migrations, collecte statique et serveur ;
- garde de production imposant les modes `api` et `oidc` ;
- champs de compilation des versions de configuration ;
- modèles de bundles immuables et règles ordonnées ;
- compilateur schema v2 et évaluateur runtime initial ;
- épinglage initial des correspondances et éléments génériques ;
- migration `0010_runtime_configuration.py` ;
- sérialisation et action de validation/publication enrichies.

À terminer dans B0 :

- [x] relire uniquement les changements backend déjà commencés et corriger les erreurs de cohérence/syntaxe ;
- [x] rendre la migration `0010` sûre depuis une base au niveau `0009` ;
- [x] faire utiliser la version de liste épinglée par les créations et mises à jour ;
- [x] faire utiliser le bundle épinglé par la numérotation et la validation métier ;
- [x] compléter les tests unitaires du compilateur, du bundle et de la migration ;
- exécuter les contrôles Django, Ruff et tests backend ;
- [x] valider statiquement Compose et les scripts de démarrage sans course de migrations ;
- [x] valider le démarrage réel de l'API et de ses dépendances Compose ; la suite complète des contrôles Python reste différée.

Critère de sortie : migrations applicables, backend existant sans régression et nouveaux invariants de compilation/bundle couverts par des tests.

### B1 — Moteurs runtime backend — IMPLÉMENTÉ, VALIDATION PYTHON DIFFÉRÉE

Règles, transitions de workflow, affectations, notifications, signatures épinglées et templates DOCX. Aucun travail frontend pendant ce compartiment.

Implémenté :

- exécution du workflow publié et épinglé, transitions conditionnelles, étapes automatiques, cycles de réouverture et tâches affectées par acteur/rôle/groupe/service ;
- garde des étapes empêchant validation, signature ou archivage hors du circuit configuré, avec prise en charge des étapes optionnelles ;
- effets de règles structurés sur `create`, `update`, `submit`, `transition`, `sign` et `archive` : validations, restriction d’ACL, notifications, tâches et injection d’étapes ;
- politique de signature épinglée dans chaque preuve, adaptateur de signature numérique explicitement indisponible par défaut et capacités runtime publiques ;
- rendu DOCX sûr par variables déclarées et instanciation transactionnelle des blueprints de configuration publiés ;
- événements et audits enrichis avec versions, fournisseur, preuve et tâche concernés.

### B2 — API runtime et sécurité backend — EN ATTENTE

Endpoints `/runtime`, éléments génériques, documents, ACL, audit, ETags et compatibilité des API existantes.

### F1 — Frontend d’administration — EN ATTENTE

Contrats TypeScript puis branchement réel des builders de listes, formulaires, vues, règles, workflows, pages, templates, navigation et politiques de signature.

### F2 — Frontend runtime — EN ATTENTE

Listes, formulaires, fiches, actions de workflow et pages dynamiques ; suppression des faux succès et isolation du mode démo.

### R1 — Production et livraison — EN ATTENTE

Découpage du bundle, OIDC, Compose, sauvegarde/restauration, kit hors ligne, documentation et tests de bout en bout.

## Interfaces publiques déjà introduites

- `ConfigurationVersion`: `schema_version`, `compiled_data`, `dependencies`, `content_hash`.
- `POST /api/v1/configurations/{id}/validate/`.
- `Correspondence.configuration_bundle_id` et `GenericListItem.configuration_bundle_id` en lecture seule.

Ces interfaces restent provisoires tant que B0 n’est pas validé. Toute modification doit être enregistrée dans cette section.

## État des vérifications

- `git diff --check` : réussi après les premiers changements.
- Frontend avant le chantier runtime : 28 tests Vitest réussis et build OIDC/API réussi, avec avertissement de chunk supérieur à 500 kB.
- Configurations Compose et syntaxe shell : validées avant les derniers changements backend.
- Tests Django/Ruff après `0010` : non exécutés car les outils PyCharm `get_python_environment`/`execute_tool` exigés par la compétence Python ne sont pas exposés dans cette session. Aucun interpréteur local arbitraire n’a été utilisé.
- Tests B0 ajoutés : robustesse du compilateur, empreinte déterministe, refus des conditions texte en schema v2, épinglage des dépendances, numérotation épinglée et migration depuis `0009`.
- Tests B1 ajoutés : workflow épinglé complet validation → signature → archivage, refus du contournement d’une signature obligatoire, fournisseur numérique désactivé, effets de règles et audit, rendu DOCX, variables absentes/non déclarées, blueprint schema v2 et refus des templates non publiés.
- Contrôles B1 exécutés : absence d’erreurs d’espaces sur les nouveaux fichiers, syntaxe de tous les scripts validée avec leur interpréteur déclaré et configuration Compose de développement valide.
- Configuration Compose de production non relancée dans ce contrôle car le fichier secret local `.env.production` est absent ; sa structure avait été validée avant B1 et B1 ne la modifie pas.
- Cause Docker déjà confirmée : `collectstatic` échouait sur `/app/staticfiles` dans le conteneur de développement ; la collecte est désormais désactivée sur l’API de développement et isolée dans le service de migration en production.
- Validation Docker du 2026-08-28 : image API reconstruite, PostgreSQL/Redis/MinIO/Keycloak et API sains, endpoint `/api/v1/health/` au vert et migration `core.0010_runtime_configuration` présente en base. La migration `0010` est désormais non atomique afin que PostgreSQL puisse vider les événements de triggers différés avant les opérations DDL.
- Validation OIDC/PostgreSQL du 2026-08-28 : la synchronisation d'un profil ne joint plus l'unité d'organisation nullable pendant `SELECT FOR UPDATE`. Le compte `admin.numa` obtient `200` sur `me`, configurations, rôles, listes et courriers ; aucun traceback après redémarrage. Le flux direct temporairement activé pour le contrôle a été redésactivé.
- Validation frontend du 2026-08-28 : 28 tests Vitest, 22 scénarios Playwright démo desktop/mobile et le parcours Playwright OIDC réel via Keycloak réussis. Le callback OIDC restaure désormais la destination demandée et notifie `BrowserRouter` après `history.replaceState` ; le scénario revient bien sur `/courriers/externes` et affiche les données API.

## Prochaine reprise

Compartiment : **validation cumulée B0 + B1**, avant B2.

Lire seulement :

- `docs/productization-checkpoint.md`
- configuration de l’environnement Python retournée par PyCharm ;
- sorties des contrôles Django/Ruff/pytest uniquement en cas d’échec.

Première action exacte : dès que `get_python_environment` est exposé, récupérer l’interpréteur PyCharm puis exécuter les contrôles Django, Ruff et la suite pytest backend. Corriger uniquement les échecs observés ; si tout passe, marquer B0 et B1 validés puis commencer B2 sans réaudit.

## Journal des compartiments

- 2026-08-28 — Méthode compartimentée adoptée ; point de reprise initial créé à partir de l’état courant.
- 2026-08-28 — B0 implémenté statiquement : validations JSON durcies, schema legacy préservé, bundle et numérotation épinglés, unicité active/rouverte migrée, volume statique de production ajouté et tests B0 écrits. Validation Python en attente de l’outil d’environnement PyCharm.
- 2026-08-28 — À la demande de l’utilisateur, passage à B1 autorisé avant exécution des tests Python ; la validation cumulée B0+B1 reste obligatoire dès que l’outil réapparaît.
- 2026-08-28 — B1 implémenté : workflow épinglé, règles et effets, signatures/politiques, templates DOCX et tests associés. Contrôles statiques réussis ; exécution Python toujours bloquée par l’absence de l’outil PyCharm obligatoire.
- 2026-08-28 — Incident Docker reproduit et isolé : le démarrage manuel de `numa-api-1` sans le projet Compose laissait PostgreSQL hors réseau, puis une migration atomique pouvait échouer sur les triggers différés. `0010` rendue non atomique ; démarrage Compose de l’API et contrôles de santé réels réussis.
- 2026-08-28 — Docker Desktop s'est arrêté pendant le contrôle complet ; moteur Windows relancé et intégration WSL `Ubuntu` rétablie. Pile complète saine. Correction du verrou OIDC sur relation nullable validée par cinq appels authentifiés réels.
- 2026-08-28 — Validation frontend cumulée : 28 tests Vitest et 22 tests E2E démo réussis. Le retour OIDC perdait sa route car `replaceState` ne notifiait pas `BrowserRouter` ; émission de `popstate` ajoutée et parcours Keycloak réel validé jusqu'au registre API.
