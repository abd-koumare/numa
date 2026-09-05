# Correction de l’accès à la signature — 5 septembre 2026

Le rôle Validateur de Kader Yao était bien enregistré et lui donnait la capacité globale `correspondence.sign`. Le courrier DSI/0001/2026 (`03aae2c9-7dd1-42e4-ae47-99a5bceeb930`) avait cependant une tâche de signature encore affectée à Admin NUMA. Kader disposait des accès de son service, sans habilitation de signature sur ce courrier : l’API renvoyait HTTP 403.

La délégation d’une tâche modifiait son responsable sans lui transmettre les habilitations du workflow. Elle accorde maintenant ces habilitations sur le courrier concerné dans la même transaction que l’affectation et son événement d’audit. Les tâches terminées ne peuvent plus être déléguées ; le destinataire d’une tâche de validation ou de signature doit posséder la capacité globale correspondante.

L’écran de signature vérifie les droits avant d’activer le bouton. En cas de blocage, il explique la raison et affiche le responsable actuel. Cette vérification est renouvelée lorsque la fenêtre reprend le focus. L’API de signature conserve ses contrôles serveur.

La tâche `29f73139-4c8d-4384-8ea5-cb830f450d0a` a été déléguée à Kader avec un motif d’audit. Une vérification dans sa session Keycloak confirme `can_sign: true` et l’activation du bouton après confirmation de lecture. Le courrier est resté `validated`, sans signature, avec la même version : Kader peut le signer lui-même.

## Vérifications

- Compilation TypeScript et Vite réussie.
- 46 tests locaux réussis.
- Scénario connecté dédié réussi : refus HTTP 403 malgré le rôle Validateur avant délégation, explication à l’écran, accès accordé après délégation, signature graphique par Kader sur un courrier de recette distinct, preuve liée à l’empreinte du document, audit de délégation et refus HTTP 409 de déléguer la tâche terminée.
- Vérification séparée du courrier signalé réussie, sans apposer de signature.
- Recette générale : 6 scénarios connectés réussis au premier passage ; le septième (connexion) attendait un courrier de démonstration sur la première page malgré la pagination. Après ajout de la recherche dans ce test, sa relance ciblée a réussi. Les 7 scénarios sont donc vérifiés.

Le scénario `e2e-oidc/signature-access.spec.ts` utilise la base locale de recette et le compte Kader disposant du rôle Validateur, comme dans le signalement. Il crée un courrier de recette et restaure la configuration du workflow après sa création. La suite Python séparée n’a pas été exécutée, l’outil de sélection de l’interpréteur PyCharm étant indisponible ; les comportements serveur ont été vérifiés par l’API réelle.

Le point de sauvegarde précédant cette correction est le commit `b23e07d`, poussé sur `origin/main`. Cette intervention porte sur le premier point signalé, l’accès à la signature.
