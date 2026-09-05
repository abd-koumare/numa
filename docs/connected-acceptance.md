# Recette des étapes 1 et 2 — 5 septembre 2026

## Périmètre livré

- Routes de consultation des pages et formulaires publiés avec vérification des droits et respect des versions figées des courriers.
- Pages dynamiques, sélection d’une page publiée comme accueil et éditeur de blocs.
- Création et duplication de pages, workflows et templates ; instanciation des templates de configuration et rendu DOCX des modèles documentaires.
- Formulaires connectés avec champs personnalisés, choix, relations, calculs et visibilité conditionnelle ; éditeurs des expressions et transitions de workflow.
- Sélection des dépendances métier des listes parmi les configurations publiées.

## Validation locale

Les 40 tests locaux existants et les 6 tests ciblés supplémentaires ont réussi pendant la reprise finale, soit **46 tests réussis**. Ils couvrent notamment l’application, le thème, le DSL des règles, la récupération après refus de publication, les calculs, les valeurs masquées et les variables imbriquées des documents. `npm run build` a également réussi (TypeScript et Vite), avec un avertissement de taille du bundle principal.

Après démarrage de Docker, la recette a été exécutée avec le navigateur Chromium, Keycloak, l’API réelle, PostgreSQL, MinIO, Redis, Celery et ClamAV. Les contrôles portent sur les services locaux, sans authentification simulée.

**Résultat final : 6 scénarios connectés réussis sur 6, en 2,1 minutes, le 5 septembre 2026. L’étape 1 est validée sur cet environnement local**, dans les limites décrites à la fin du document.

La suite Python séparée n’a pas été exécutée dans cette reprise, faute d’accès à l’outil de sélection de l’interpréteur PyCharm. Le correctif serveur décrit ci-dessous est vérifié par les appels HTTP réels de la recette.

## Correctifs apportés pendant la recette

- Un workflow comportant plusieurs approbations plaçait le courrier en état `validated` dès la première décision, ce qui bloquait les approbations suivantes. Le courrier reste désormais en état `in_validation` tant que l’étape suivante exige une validation ou une approbation. La recette vérifie la seconde tâche, son traitement et le refus de signer prématurément.
- Les champs temporaires laissés par une ancienne recette interrompue ont été retirés en conservant le reste du formulaire. Les nouveaux scénarios restaurent les contenus initiaux des configurations partagées dans un bloc `finally`.
- Les sélecteurs navigateur ont été adaptés aux libellés accessibles des champs obligatoires et à la présence de plusieurs courriers de démonstration portant le même objet. Les délais des actions laissent le temps d’exécuter la restauration après un échec.

## Scénarios de recette ajoutés

| Scénario | Contrôles |
|---|---|
| Pages publiées | Données réelles, isolation des brouillons, publication, audience, refus des accès anonymes et des modifications non autorisées |
| Templates | Création, duplication, publication, instanciation en formulaire, téléchargement DOCX et refus d’un contexte incomplet |
| Formulaires | Champs personnalisés, calculs, visibilité conditionnelle, sauvegarde depuis l’interface et maintien de la version des anciens courriers |
| Documents et signature électronique | Conflit de version, dépôt PDF, scan ClamAV, soumission, numérotation, tâche de validation, droits de signature, preuve liée au hash documentaire et vérification de la chaîne d’audit |
| Workflow conditionnel et signature graphique | Pièce jointe imposée par une règle, branches urgente et normale, deux approbations pour l’urgence, traitement de la seconde tâche, refus des signatures prématurées ou sans marque, signature graphique puis archivage |
| Connexion utilisateur | Authentification réelle Keycloak du gestionnaire et affichage du registre alimenté par l’API |

Ces tests doivent s’exécuter sur une base locale de recette : ils créent des objets et versions identifiés comme données de recette, conservés pour l’audit. Les scénarios des formulaires et workflows publient temporairement une configuration partagée puis restaurent son contenu ; une interruption forcée peut empêcher cette restauration. L’identité visuelle de l’organisation est conservée.

Commande de recette connectée :

```bash
npm run test:e2e:oidc -- --workers=1
```

La signature numérique via un fournisseur externe reste hors validation : le fournisseur actuel est désactivé et son intégration effective reste nécessaire. La recette vérifie son refus explicite (HTTP 409), sans prétendre réaliser une signature numérique externe. Cette recette locale ne constitue pas une validation du déploiement de production.
