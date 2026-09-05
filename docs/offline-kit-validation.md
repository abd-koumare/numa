# Kit hors ligne — validation du 5 septembre 2026

## Résultat de l’étape 3

Le kit réel a été construit avec Docker, sans simulation :

- Version : `1.0.0-preprod.20260905`.
- Plateforme des neuf images : `linux/amd64`.
- Archive : `offline-kit/numa-1.0.0-preprod.20260905-linux-x86_64.tar.gz`.
- Taille : 836 749 116 octets, soit environ 798 Mio.
- SHA-256 : `8f71a01597c54147d70a99064c4c805e945fc26c4fd8061727fbd5aaf3c48365`.
- Fichier de contrôle : même nom suivi de `.sha256`.

Le code applicatif inclut les corrections de la recette connectée. Il provient du répertoire de travail modifié, sur la base du commit `61e2af15f12437b7987fc55cbcfd40e5073d8780` ; il ne s’agit pas d’un tag Git de production. Cette provenance figure dans `BUILD-INFO.txt`.

## Contenu et contrôles réussis

Les images API et frontend ont été construites, puis exportées avec PostgreSQL, Redis, MinIO, le client MinIO, ClamAV, Keycloak et Caddy. `IMAGES.jsonl` enregistre leurs identifiants, tags, digests et architectures. `SHA256SUMS` couvre tous les fichiers livrés, y compris l’archive d’images et les scripts d’installation.

Les vérifications suivantes ont réussi :

1. Construction réelle des images applicatives, dont compilation TypeScript et Vite dans Docker.
2. Contrôle SHA-256 de tous les fichiers du kit et de l’archive finale.
3. Rechargement réel de `images/numa-images.tar.gz` avec `docker load`.
4. Comparaison des neuf images rechargées avec les identifiants et plateformes de l’inventaire.
5. Validation de la configuration Nginx, démarrage du frontend avec `--network none`, et réponse HTTP contenant la configuration API/OIDC attendue.
6. Démarrage de ClamAV avec `--network none` et Freshclam désactivé pour ce contrôle, réponse `PONG` et analyse saine d’un fichier témoin.
7. Vérification syntaxique des scripts modifiés et de la configuration Compose de production.

Les conteneurs temporaires de vérification sont arrêtés après les contrôles. Le rechargement d’images a utilisé le moteur Docker local ; ce n’est pas encore une installation sur un serveur vierge.

L’image ClamAV épinglée embarque des signatures datées du 2 mars 2026 et signale leur ancienneté. Le démarrage hors réseau est confirmé. Leur actualisation doit être prévue lors de la préparation de la préproduction ; le service Freshclam reste activé par défaut dans le déploiement. Docker Engine et Compose doivent déjà être installés sur le serveur cible : le kit ne contient pas leurs paquets Ubuntu.

## Ajustements du conditionnement

- Exclusion des fichiers `.env.*`, certificats et archives hors ligne du contexte de construction frontend ; exclusion des `.env*` du contexte backend.
- Construction et téléchargement explicites pour `linux/amd64`.
- Refus d’écraser une destination de kit existante.
- Inventaire des images, provenance du code et sommes de contrôle de l’ensemble du kit.
- Détection automatique de la version du kit par l’installateur.
- Correction du contrôle de santé API pour utiliser le nom d’hôte interne `api`, autorisé par la configuration de production.

## Étape 4 : cible encore nécessaire

L’installation de préproduction Ubuntu 24.04, la réception SMTP et l’exercice de sauvegarde/restauration ne sont pas encore réalisés. L’hôte WSL actuel utilise Ubuntu 26.04 ; les conteneurs de test locaux ne constituent donc pas la cible demandée.

Pour poursuivre, il faut identifier :

- le serveur Ubuntu 24.04 et l’accès SSH/sudo à utiliser, ou la plateforme où créer cette machine ;
- le domaine et la méthode de certificat HTTPS ;
- le relais SMTP et une boîte de recette autorisée à recevoir le message de contrôle ;
- les références des secrets déjà disponibles, sans les publier dans le compte rendu.

La procédure d’installation est décrite dans [le guide Ubuntu](ubuntu-24-production-deployment.md). La restauration devra être exécutée sur la préproduction isolée et vérifiée sur la base de données, les documents et les accès Keycloak.
