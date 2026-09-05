# Notifications et aide — 5 septembre 2026

Les trois créations de notifications serveur (tâches, règles métier et décisions sur un courrier) utilisent désormais un constructeur commun qui traduit les registres `external` et `internal` en routes `externes` et `internes`.

La migration `0011_fix_notification_paths` corrige les liens déjà enregistrés, en conservant leurs suffixes, paramètres et fragments ainsi que les autres champs des notifications. Elle a été appliquée lors du redémarrage standard des services locaux API et worker. La vérification en base trouve zéro lien avec les anciens préfixes et sept liens avec les préfixes français. Le contrôle de santé de l’API confirme le fonctionnement de la base, du cache et du stockage.

L’interface normalise aussi les liens reçus de l’API et ceux conservés dans les sessions de démonstration. Les anciennes adresses ouvertes directement, notamment depuis un courriel déjà envoyé, sont redirigées vers la fiche correspondante sans perdre leurs paramètres ni leur fragment.

Le bouton « ? », accessible sur ordinateur et mobile, ouvre `/aide`. Cette page comporte un sommaire, des instructions pour rechercher, créer, soumettre, valider et signer un courrier, ainsi que des explications sur les notifications, les préférences et les difficultés d’accès. Des liens conduisent aux écrans concernés.

## Vérifications

- Compilation TypeScript et Vite réussie.
- 37 tests d’interface vérifiés : 34 réussis au premier passage, puis les trois tests existants ayant dépassé cinq secondes réussis avec un délai de vingt secondes.
- Quatre parcours Playwright réussis dans le conteneur du projet : ouverture de l’aide, navigation dans le sommaire sans débordement horizontal et ouverture d’une ancienne notification, sur ordinateur et mobile.
- `git diff --check` réussi.
- Tests Python ajoutés pour la génération des notifications de validation/signature des deux registres et pour la migration. Leur exécution séparée reste non vérifiée : l’outil `get_python_environment` exigé par la compétence PyCharm n’est pas disponible dans cette session. La migration réelle a été exécutée par le démarrage normal du service et vérifiée en base.

Les changements déjà présents concernant les droits de signature sont conservés.
