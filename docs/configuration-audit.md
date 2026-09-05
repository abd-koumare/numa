# Audit de la configuration NUMA

Ce document décrit ce qui est effectivement modifiable, où la valeur est enregistrée et quand elle devient active.

## Règle commune : brouillon puis publication

Les listes, formulaires, règles, pages, workflows, modèles de numérotation et politiques de signature sont versionnés.

1. Ouvrir l'écran de configuration.
2. Enregistrer un brouillon pour conserver le travail sans modifier le comportement courant.
3. Corriger les erreurs signalées par l'API.
4. Publier la version.
5. Créer un nouvel objet métier pour vérifier le résultat. Les objets déjà créés conservent leur bundle de configuration afin de rester auditables.

## État point par point

| Zone | Enregistrement | Effet dans l'application | État de l'interface |
|---|---|---|---|
| Identité visuelle | Paramètres de l'organisation | Logo, favicon, noms, couleurs, police, bannière, pied de page et accueil | Fonctionnel |
| Navigation | Configuration `navigation/main-navigation` publiée | Ordre, libellé, destination et visibilité du menu | Fonctionnel |
| Listes | Configuration de type `list` | Périodicité, activation et dépendances métier | Édition des paramètres et sélection des formulaires, workflows, règles, vues, numérotations et politiques publiés |
| Formulaires | Configuration de type `form` | Formulaire connecté issu de la configuration applicable au courrier | Édition des champs, choix, relations, calculs, conditions, ordre et aperçu |
| Numérotation | Configuration de type `numbering` | Référence attribuée aux nouveaux courriers | Fonctionnel |
| Règles métier | Configuration de type `rule` | Validation et automatisations lors de la soumission | Fonctionnel avec le DSL structuré validé par l'API |
| Workflows | Configuration de type `workflow` | Étapes et transitions configurées pour les nouveaux objets | Création, duplication, édition des étapes et transitions conditionnelles |
| Pages | Configuration de type `page` | Rendu de la version publiée sur `/pages/:slug`, avec contrôle d’audience | Création, duplication, blocs dynamiques, aperçu et choix comme accueil |
| Templates | Configuration de type `template` | Modèles documentaires ou configurations réutilisables | Création, duplication, publication, instanciation en brouillon et téléchargement DOCX |
| Politiques de signature | Configuration `signature_policy` | Niveaux autorisés pour les nouvelles signatures | Fonctionnel |
| Paramètres système | Table des paramètres système | Politique de référence uniquement pour plusieurs sections | L'interface indique désormais explicitement ce qui doit être configuré dans le déploiement |

## Vérification rapide

### Identité visuelle

1. Aller dans **Administration > Identité visuelle**.
2. Modifier une couleur, la bannière ou la page d'accueil.
3. Enregistrer puis recharger la page.
4. Vérifier le thème, la bannière et la redirection de `/`.

### Navigation

1. Aller dans **Administration > Navigation**.
2. Renommer ou déplacer une entrée.
3. Cliquer sur **Enregistrer et publier**.
4. Vérifier immédiatement le menu latéral.

### Liste et formulaire

1. Ouvrir **Administration > Listes et formulaires** puis une liste.
2. Modifier ses paramètres et enregistrer un brouillon.
3. Vérifier que la version est indiquée comme brouillon.
4. Publier.
5. Ouvrir son formulaire, modifier un champ, publier puis créer un nouvel élément.

### Règle métier

Les conditions lisibles utilisent la forme `champ opérateur valeur`, par exemple `priorité = Urgente` ou `montant > 1000000`. Les actions proposées sont converties vers les actions serveur autorisées. La publication échoue si le schéma n'est pas valide.

Les conditions composées et les actions comportant des options sont présentées en DSL JSON afin de préserver leur structure. Les valeurs textuelles entre guillemets restent littérales (par exemple `"0012"`). L’éditeur modifie la première action et conserve les suivantes, ainsi que les événements déclencheurs et les autres options de la règle. Une action inconnue est refusée.

Si l’enregistrement du brouillon réussit mais que la publication échoue, les éditeurs de liste, formulaire, page et workflow conservent la version enregistrée pour permettre une nouvelle tentative.

### Workflow

1. Ouvrir un workflow existant.
2. Ajouter ou modifier une étape avec une clé unique, un type autorisé et un acteur valide (`creator`, `responsible-service`, `system` ou `role:nom`).
3. Vérifier la structure, enregistrer puis publier.
4. Créer un nouvel objet lié à ce workflow et contrôler ses tâches.

### Pages et templates

Les pages affichent les blocs de texte, titres, encadrés, boutons et liens internes ainsi que les métriques, graphiques, tâches, courriers et activités fournis par l’API. L’API de rendu expose seulement la version publiée et vérifie les rôles de l’audience. Chaque source de données conserve ses propres contrôles d’accès. Le brouillon reste réservé à l’éditeur.

Un template de configuration publié crée une nouvelle définition en brouillon. Un template documentaire publié génère un DOCX à partir des variables renseignées, y compris les chemins imbriqués comme `sender.name`. La duplication conserve le contenu de la dernière version dans un nouveau brouillon.

Les calculs et conditions sont proposés dans le formulaire connecté puis vérifiés par le serveur à l’enregistrement. L’édition d’un courrier existant charge son formulaire figé, sans lui appliquer une nouvelle version publiée entre-temps.

## Paramètres qui dépendent du déploiement

Les valeurs suivantes ne doivent pas être considérées comme actives parce qu'elles sont simplement stockées dans l'écran **Paramètres système** : durée de session, MFA, limites de fichiers, extensions, antivirus, SMTP, langue globale, fuseau et format de date. Leur application nécessite actuellement Keycloak, les variables d'environnement de l'API, le proxy, ClamAV ou la configuration SMTP. L'écran les présente donc comme des politiques de référence et renvoie vers la configuration effective quand elle existe.

Le nom, la description et l’activation d’une liste sont des métadonnées de sa définition : ils sont appliqués dès l’enregistrement, même lors de la sauvegarde d’un brouillon. Le contenu versionné (notamment la périodicité) devient actif à sa publication.

Une instance de liste conserve sa version de liste. Modifier les liaisons d’une liste puis publier affecte les nouvelles instances ; les instances existantes gardent leurs liaisons. Pour chaque nouveau courrier, les versions publiées des dépendances liées sont résolues puis figées dans son bundle.

## Vérifications automatisées

```bash
npm run test:run -- --testTimeout=30000 --maxWorkers=1
npm run build
npm run test:e2e:docker -- --workers=2
npm run test:e2e:oidc -- --workers=1
bash -n scripts/build-offline-kit.sh
git diff --check
```

Les tests des éditeurs simulent notamment une publication refusée après sauvegarde du brouillon, puis une nouvelle tentative avec la bonne version. Les tests navigateur utilisent le mode démonstration et couvrent le bureau et le mobile, dont la persistance de l’identité visuelle et de la navigation. Ils ne remplacent pas la recette avec l’API, Keycloak et les services de production décrite dans le guide Ubuntu.

L’état réel des validations de cette livraison figure dans [le compte rendu de recette](connected-acceptance.md). Les fonctionnalités implémentées ci-dessus ne signifient pas que leur recette connectée complète a réussi.
