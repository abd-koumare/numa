# Guide simple des images Docker de NUMA

Ce document explique les images Docker utilisées par NUMA, leur rôle, celles qui sont obligatoires et la manière de démarrer puis configurer la plateforme. Il s’adresse à une personne qui découvre le projet ou Docker.

## 1. Les trois mots à connaître

- Une **image** est un modèle prêt à l’emploi, par exemple `postgres:17.6-alpine`.
- Un **conteneur** est une instance en cours d’exécution de cette image, par exemple `numa-postgres-1`.
- Un **service Compose** décrit comment lancer un conteneur : variables, volumes, réseau, dépendances et contrôle de santé.

Plusieurs services peuvent utiliser la même image. En production, `api`, `migrate`, `worker` et `beat` utilisent tous l’image `numa-api`. Il ne s’agit donc pas de quatre images différentes.

## 2. Vue d’ensemble

En développement :

```text
Navigateur
   ├── localhost:5173 ──> frontend React/Vite
   ├── localhost:8000 ──> API Django
   ├── localhost:8080 ──> Keycloak
   └── localhost:9001 ──> console MinIO

API et tâches de fond
   ├── PostgreSQL : données métier et données Keycloak
   ├── Redis      : file de tâches Celery
   ├── MinIO      : fichiers et pièces jointes
   ├── ClamAV     : analyse antivirus
   └── Keycloak   : comptes, connexion et rôles
```

En production, seul Caddy publie les ports `80` et `443`. Les autres services restent sur le réseau Docker privé `numa-internal`.

## 3. Inventaire des images

### Images applicatives construites par NUMA

| Image | Services | Rôle | Statut |
|---|---|---|---|
| `numa-api:<version>` | `api`, `migrate`, `worker`, `beat` | API Django, migrations, tâches asynchrones et planification | Obligatoire |
| `numa-web:<version>` | `frontend` | Interface React compilée, servie par Nginx | Obligatoire pour utiliser l’interface |

En développement, Compose construit directement le backend avec [backend/Dockerfile](../backend/Dockerfile) et le frontend avec [docker/frontend/Dockerfile](../docker/frontend/Dockerfile). En production, les noms finaux sont `numa-api` et `numa-web`.

### Images d’infrastructure

| Image | Service | Rôle | Statut dans la stack fournie |
|---|---|---|---|
| `postgres:17.6-alpine` | `postgres` | Base de données NUMA et Keycloak | Obligatoire |
| `redis:8.2-alpine` | `redis` | File de tâches et résultats Celery | Obligatoire |
| `minio/minio:RELEASE.2025-04-22T22-12-26Z` | `minio` | Stockage privé des documents et sauvegardes | Obligatoire |
| `minio/mc:RELEASE.2025-04-16T18-13-26Z` | `minio-init` | Création et sécurisation des buckets MinIO | Obligatoire au démarrage, puis s’arrête |
| `clamav/clamav:1.4.3` | `clamav` | Analyse antivirus des fichiers déposés | Obligatoire pour la gestion sécurisée des documents |
| `quay.io/keycloak/keycloak:26.3.2` | `keycloak` | Authentification OIDC, comptes et rôles | Obligatoire |
| `caddy:2.10.2-alpine` | `caddy` | HTTPS et point d’entrée de production | Obligatoire dans le déploiement de référence |
| `mcr.microsoft.com/playwright:v1.62.1-noble` | `e2e` | Tests automatiques dans un navigateur | Facultatif, développement uniquement |

Les versions sont volontairement fixées. Une mise à jour d’image doit être testée avec NUMA avant de modifier les fichiers Compose.

## 4. À quoi sert chaque service ?

### PostgreSQL

PostgreSQL conserve les courriers, configurations, droits, audits et comptes techniques. Keycloak utilise une zone séparée, appelée schéma `keycloak`, dans la même base.

- Données persistantes : volume `postgres_data`.
- Variable principale : `POSTGRES_PASSWORD`.
- Ne supprimez jamais ce volume sans sauvegarde.

### Redis

Redis transporte les travaux à exécuter par Celery : antivirus, OCR, courriels, webhooks, imports, exports et sauvegardes.

- Données persistantes : volume `redis_data`.
- Aucun port n’est publié vers l’extérieur.
- L’API peut parfois sembler fonctionner sans le worker, mais les traitements de fond resteront bloqués.

### MinIO et `minio-init`

MinIO stocke les pièces jointes dans un bucket privé. En production, il stocke aussi une copie des sauvegardes.

`minio-init` utilise l’outil MinIO Client pour créer les buckets. Il termine ensuite avec le code `0`. Voir `minio-init` dans l’état `Exited (0)` est donc **normal**.

- Documents : volume `minio_data`.
- Identifiant : `MINIO_ROOT_USER`.
- Mot de passe : `MINIO_ROOT_PASSWORD`.
- Bucket documentaire : `MINIO_BUCKET`.
- Bucket de sauvegarde : `NUMA_BACKUP_S3_BUCKET`, en production.

### ClamAV

ClamAV analyse chaque fichier avant que son téléchargement soit autorisé. Le premier démarrage peut prendre une à deux minutes pendant la préparation des signatures antivirus.

- Signatures persistantes : volume `clamav_data`.
- Port interne : `3310`.
- Il n’existe pas de mode de production recommandé sans antivirus.

### Keycloak

Keycloak gère la connexion, les mots de passe et les rôles. Il existe deux types de comptes administratifs :

- `numa.admin` administre les configurations dans l’application NUMA ;
- `numa-keycloak-admin` administre directement le serveur d’identité Keycloak.

En production, utilisez normalement `numa.admin`. Le compte Keycloak est réservé aux opérations d’identité avancées.

### API, migrations, worker et beat

Ces quatre services partagent le même code et la même image :

- `migrate` applique le schéma de base et collecte les fichiers statiques, puis s’arrête avec `Exited (0)` ;
- `api` sert les requêtes HTTP avec Django et Gunicorn ;
- `worker` exécute les traitements de fond Celery ;
- `beat` déclenche les tâches périodiques, notamment l’envoi des notifications demandées.

Les quatre sont nécessaires pour une exploitation complète. `migrate` n’a pas vocation à rester actif.

### Frontend

En développement, le frontend est servi par Vite avec rechargement automatique. En production, il est compilé une fois puis servi par Nginx dans l’image `numa-web`.

La production charge sa configuration au démarrage dans `runtime-config.js`. Un changement de domaine ou d’URL d’API ne demande donc pas de reconstruire l’image.

### Caddy

Caddy est le seul point d’entrée public de la production. Il fournit HTTPS et distribue les requêtes :

- `/api/*`, `/admin/*` et `/static/*` vers Django ;
- `/auth/*` vers Keycloak ;
- le reste vers le frontend.

Il est possible d’utiliser un reverse proxy d’entreprise à sa place, mais cela exige d’adapter Compose, TLS et les en-têtes proxy. Ce n’est pas une simple option à désactiver.

### Playwright

Playwright ne démarre pas avec la plateforme. Son profil `test` est activé uniquement par les commandes de tests de bout en bout. Il est totalement facultatif pour utiliser NUMA.

## 5. Installation locale pas à pas

### Étape 1 — Vérifier les prérequis

Il faut :

- Docker Desktop démarré ;
- l’intégration WSL activée pour la distribution utilisée ;
- Docker Compose disponible ;
- au moins 4 Gio de mémoire disponibles pour la stack.

Depuis WSL, vérifiez :

```bash
docker info
docker compose version
```

### Étape 2 — Créer la configuration locale

À la racine du dépôt :

```bash
cp .env.example .env
```

Le fichier `.env.example` contient déjà des valeurs de développement. Elles ne doivent jamais être reprises en production.

Les variables les plus utiles sont :

| Variable | Valeur locale habituelle | Utilité |
|---|---|---|
| `POSTGRES_PASSWORD` | `numa_dev_password` | Mot de passe PostgreSQL |
| `MINIO_ROOT_USER` | `numa` | Administrateur MinIO |
| `MINIO_ROOT_PASSWORD` | `numa_dev_password` | Mot de passe MinIO |
| `VITE_API_URL` | `http://localhost:8000/api/v1` | Adresse de l’API vue par le navigateur |
| `VITE_OIDC_AUTHORITY` | `http://localhost:8080/realms/numa` | Adresse de connexion Keycloak |

### Étape 3 — Construire et démarrer toute la stack

Lancez toujours la stack complète, pas seulement `numa-api-1` :

```bash
docker compose up -d --build
```

Docker télécharge les images publiques, construit les deux parties de NUMA et démarre les services dans l’ordre défini par leurs contrôles de santé.

### Étape 4 — Contrôler le démarrage

```bash
docker compose ps -a
docker compose logs --tail=100 api
```

Le résultat attendu est :

- les services permanents sont `Up` ou `healthy` ;
- `minio-init` est `Exited (0)` ;
- l’API répond avec un statut HTTP `200`.

Test rapide :

```bash
curl http://localhost:8000/api/v1/health/
```

### Étape 5 — Ouvrir les services

| Service | Adresse | Compte local |
|---|---|---|
| NUMA | <http://localhost:5173> | `admin.numa` / `numa-admin` |
| Compte métier de démonstration | <http://localhost:5173> | `kader` / `numa-demo` |
| API et santé | <http://localhost:8000/api/v1/health/> | — |
| Documentation API | <http://localhost:8000/api/docs/> | — |
| Administration Keycloak | <http://localhost:8080> | `admin` / `admin_dev_password` |
| Console MinIO | <http://localhost:9001> | `numa` / `numa_dev_password` |

Tous ces identifiants sont réservés au développement.

## 6. Commandes quotidiennes en développement

Afficher l’état :

```bash
docker compose ps -a
```

Suivre les journaux utiles :

```bash
docker compose logs -f api worker frontend
```

Redémarrer un service :

```bash
docker compose restart api
```

Arrêter en conservant les données :

```bash
docker compose down
```

Réinitialiser complètement les données locales :

```bash
docker compose down -v
docker compose up -d --build
```

Attention : `down -v` supprime définitivement la base locale, les documents MinIO et les autres volumes du projet. Ne l’utilisez jamais sur une production.

Lancer les tests navigateur facultatifs :

```bash
npm run test:e2e:docker
```

## 7. Installation de production recommandée

La cible de référence est Ubuntu 24.04 x86_64 avec Docker Engine, Docker Compose, 8 Gio de RAM et 20 Gio d’espace libre. Les ports `80` et `443` doivent être disponibles.

### Étape 1 — Construire le kit sur une machine connectée

```bash
./scripts/build-offline-kit.sh
```

Le kit contient les images applicatives et toutes les images d’infrastructure. Le serveur cible n’a donc pas besoin d’un accès Internet.

### Étape 2 — Copier et vérifier le kit sur le serveur

```bash
sha256sum -c numa-<version>-linux-x86_64.tar.gz.sha256
sudo mkdir -p /opt/numa
sudo tar --strip-components=1 -xzf numa-<version>-linux-x86_64.tar.gz -C /opt/numa
```

### Étape 3 — Lancer l’installateur

Remplacez le domaine par le vrai nom DNS du serveur :

```bash
sudo /opt/numa/scripts/numa-install.sh numa.exemple.local
```

L’installateur :

1. génère des secrets uniques ;
2. crée `/opt/numa/.env.production` avec les permissions `600` ;
3. charge les images du kit ;
4. contrôle le serveur avec `numa-doctor.sh` ;
5. démarre tous les services ;
6. affiche le mot de passe temporaire de `numa.admin` ;
7. active la sauvegarde quotidienne si l’installation est lancée en tant que `root` dans `/opt/numa`.

Conservez immédiatement le mot de passe temporaire, connectez-vous avec `numa.admin`, puis choisissez un nouveau mot de passe. Si `.env.production` existe déjà, l’installateur le conserve et ne réaffiche pas les secrets précédents.

### Étape 4 — Contrôler la production

```bash
cd /opt/numa
./scripts/numa-status.sh
docker compose --env-file .env.production -f compose.production.yaml logs --tail=100 api worker
```

L’application doit être disponible à l’adresse `https://<NUMA_DOMAIN>`.

## 8. Configuration de production, point par point

Le fichier de référence est [.env.production.example](../.env.production.example). Le plus sûr est de laisser l’installateur créer `.env.production`, puis de modifier uniquement les valeurs fonctionnelles nécessaires.

### 8.1 Domaine et HTTPS — obligatoire

```dotenv
NUMA_DOMAIN=numa.exemple.local
NUMA_PUBLIC_URL=https://numa.exemple.local
DJANGO_ALLOWED_HOSTS=numa.exemple.local,api
CSRF_TRUSTED_ORIGINS=https://numa.exemple.local
CORS_ALLOWED_ORIGINS=https://numa.exemple.local
```

Pour un certificat interne généré par Caddy :

```dotenv
NUMA_TLS_CONFIG=tls internal
```

Pour un certificat fourni par l’organisation, placez `fullchain.pem` et `privkey.pem` dans `/opt/numa/certificates`, puis utilisez :

```dotenv
NUMA_TLS_CONFIG=tls /etc/numa/certificates/fullchain.pem /etc/numa/certificates/privkey.pem
```

### 8.2 Secrets — obligatoires

Les variables suivantes doivent être longues, uniques et secrètes :

- `POSTGRES_PASSWORD` ;
- `DJANGO_SECRET_KEY` ;
- `NUMA_SETUP_TOKEN` ;
- `NUMA_ENCRYPTION_KEY` ;
- `NUMA_BACKUP_ENCRYPTION_KEY` ;
- `MINIO_ROOT_PASSWORD` ;
- `KC_BOOTSTRAP_ADMIN_PASSWORD` ;
- `NUMA_BOOTSTRAP_ADMIN_PASSWORD`.

L’installateur les génère automatiquement. Ne les remplacez pas par les exemples `CHANGE_ME`, et ne publiez jamais `.env.production` dans Git.

### 8.3 Stockage des documents — obligatoire

```dotenv
MINIO_ROOT_USER=numa
MINIO_ROOT_PASSWORD=<secret-unique>
MINIO_BUCKET=numa-documents
USE_S3=true
```

Changer ces identifiants après la première installation demande une opération coordonnée sur MinIO et l’API. Ne les modifiez pas comme une simple préférence d’affichage.

### 8.4 Authentification — obligatoire

```dotenv
NUMA_AUTH_MODE=oidc
NUMA_OIDC_CLIENT_ID=numa-web
OIDC_AUDIENCE=numa-api
NUMA_BOOTSTRAP_ADMIN_USERNAME=numa.admin
NUMA_BOOTSTRAP_ADMIN_PASSWORD=<mot-de-passe-temporaire>
```

La production exige les modes `api` et `oidc`. Le mot de passe initial de `numa.admin` est temporaire.

### 8.5 Courriel — facultatif pour démarrer, requis pour envoyer réellement

Par défaut, l’installateur écrit les courriels dans les journaux sans les expédier. Pour un vrai serveur SMTP :

```dotenv
EMAIL_BACKEND=django.core.mail.backends.smtp.EmailBackend
EMAIL_HOST=smtp.exemple.local
EMAIL_PORT=25
EMAIL_HOST_USER=
EMAIL_HOST_PASSWORD=
EMAIL_USE_TLS=false
DEFAULT_FROM_EMAIL=NUMA <numa@exemple.local>
```

Adaptez le port, TLS et les identifiants aux règles de votre messagerie.

### 8.6 Capacité — facultatif, valeurs par défaut disponibles

```dotenv
GUNICORN_WORKERS=4
GUNICORN_THREADS=2
GUNICORN_TIMEOUT=120
CELERY_WORKER_CONCURRENCY=4
MAX_UPLOAD_SIZE=26214400
OCR_LANGUAGES=fra+eng
NUMA_TIMEZONE=UTC
```

Réduisez les workers sur une petite machine. Augmentez-les seulement après avoir mesuré la mémoire et la charge.

### 8.7 Sauvegardes — fortement recommandé

```dotenv
NUMA_BACKUP_DIR=/var/lib/numa/backups
NUMA_BACKUP_S3_BUCKET=numa-backups
NUMA_BACKUP_S3_PREFIX=backups/
NUMA_BACKUP_KEEP_LOCAL_AFTER_S3=true
```

La clé `NUMA_BACKUP_ENCRYPTION_KEY` est indispensable pour restaurer les sauvegardes. Conservez-en une copie dans le gestionnaire de secrets de l’organisation, séparément du serveur.

### Étape finale — appliquer une modification

Après une modification de `.env.production` :

```bash
cd /opt/numa
./scripts/numa-doctor.sh
docker compose --env-file .env.production -f compose.production.yaml up -d --pull never
./scripts/numa-status.sh
```

## 9. Ce qui est réellement facultatif

- **Playwright** est facultatif : il sert uniquement aux tests.
- **SMTP** est facultatif pour démarrer, mais les notifications ne seront pas réellement envoyées sans lui.
- **Un certificat fourni par l’organisation** est facultatif : Caddy peut créer un certificat interne.
- **Caddy** peut être remplacé par un reverse proxy existant, mais uniquement avec une adaptation et une validation de l’architecture.
- **PostgreSQL, Redis, MinIO, ClamAV et Keycloak** peuvent techniquement être externalisés, mais les fichiers Compose fournis attendent leurs services internes. Leur remplacement est un chantier d’intégration, pas une case à décocher.

## 10. Pannes fréquentes

### `Permission denied: /app/staticfiles`

L’image backend doit être reconstruite après une correction de permissions, et le volume `static_data` doit être accessible à l’utilisateur `numa` de l’image :

```bash
# Après avoir construit ou chargé la version corrigée de numa-api
docker compose --env-file .env.production -f compose.production.yaml up -d --force-recreate migrate api
```

Consultez les journaux de `migrate` avant toute suppression de volume.

### `Temporary failure in name resolution`

L’API ne trouve pas un service Docker, généralement `postgres`, `redis` ou `minio`. Démarrez le projet avec le fichier Compose complet et inspectez :

```bash
docker compose ps -a
docker compose logs postgres redis minio api
```

Ne lancez pas isolément un ancien conteneur depuis l’interface Docker Desktop.

### Des appels `/api/v1/health/` apparaissent toutes les dix secondes

C’est le contrôle de santé Docker. Le statut HTTP `200` signifie que l’API répond correctement ; ce n’est pas une erreur.

### `minio-init` ou `migrate` est arrêté

`Exited (0)` est attendu. Un code différent de `0` indique une erreur et doit être vérifié avec :

```bash
# Développement
docker compose logs minio-init

# Production
docker compose --env-file .env.production -f compose.production.yaml logs minio-init migrate
```

## 11. Fichiers de référence

- Développement : [compose.yaml](../compose.yaml) et [.env.example](../.env.example).
- Production : [compose.production.yaml](../compose.production.yaml) et [.env.production.example](../.env.production.example).
- Construction backend : [backend/Dockerfile](../backend/Dockerfile).
- Construction frontend : [docker/frontend/Dockerfile.production](../docker/frontend/Dockerfile.production).
- Routage HTTPS : [docker/caddy/Caddyfile](../docker/caddy/Caddyfile).
- Installation : [scripts/numa-install.sh](../scripts/numa-install.sh).
- Diagnostic : [scripts/numa-doctor.sh](../scripts/numa-doctor.sh).
