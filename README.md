# NUMA

NUMA est une plateforme configurable de gestion des courriers et processus métier. Le dépôt contient le frontend React/Vite, l’API Django REST et une pile Docker complète : PostgreSQL, Redis/Celery, MinIO, ClamAV, Keycloak et Caddy.

## Démarrage local

Prérequis : Docker Desktop relié à WSL, Docker Compose et au moins 4 Gio de mémoire disponible.

```bash
cp .env.example .env
docker compose up --build
```

Les services de développement sont alors disponibles :

- NUMA : <http://localhost:5173>
- API et santé : <http://localhost:8000/api/v1/health/>
- OpenAPI : <http://localhost:8000/api/docs/>
- Keycloak : <http://localhost:8080> (`admin` / `admin_dev_password`)
- MinIO : <http://localhost:9001> (`numa` / `numa_dev_password`)

Compte métier de démonstration : `kader` / `numa-demo`. Compte fonctionnel : `admin.numa` / `numa-admin`. Ces comptes ne doivent jamais être utilisés en production.

Le frontend utilise l’API et OIDC lorsque `VITE_DATA_MODE=api` et `VITE_AUTH_MODE=oidc`. Le mode sans variables reste réservé aux tests de démonstration.

## Déploiement de production hors ligne

La cible de référence est Ubuntu 24.04 x86_64 avec Docker Engine, le plugin Compose, 8 Gio de RAM et 20 Gio d’espace libre. Le kit contient toutes les images : la machine cible n’a pas besoin d’un accès Internet.

Sur une machine de construction connectée :

```bash
./scripts/build-offline-kit.sh
```

Copiez le fichier `offline-kit/numa-<version>-linux-x86_64.tar.gz` et son `.sha256` sur le serveur, puis :

```bash
sha256sum -c numa-<version>-linux-x86_64.tar.gz.sha256
sudo mkdir -p /opt/numa
sudo tar --strip-components=1 -xzf numa-<version>-linux-x86_64.tar.gz -C /opt/numa
sudo /opt/numa/scripts/numa-install.sh numa.exemple.local
```

L’installateur vérifie la machine, génère des secrets uniques dans `/opt/numa/.env.production`, charge les images, démarre la pile et affiche le mot de passe temporaire du compte `numa.admin`. Le fichier secret est créé en mode `600`. Conservez immédiatement ce mot de passe dans le gestionnaire de secrets de l’organisation, connectez-vous puis changez-le.

Installé en tant que `root` dans `/opt/numa`, NUMA active aussi une sauvegarde quotidienne à 03:00 UTC. L’installation est relançable : une configuration existante n’est pas écrasée.

## Configuration

Toute la configuration d’un site tient dans `.env.production`. Le modèle documenté est [.env.production.example](.env.production.example).

Les valeurs à adapter en priorité sont :

- `NUMA_DOMAIN` et `NUMA_PUBLIC_URL` ;
- les origines Django/CORS/CSRF ;
- SMTP et adresse d’expédition ;
- rétention et destination des sauvegardes ;
- nombre de workers Gunicorn et Celery selon la capacité du serveur.

Le frontend lit sa configuration au démarrage depuis `runtime-config.js`. Une même image `numa-web` peut donc être déplacée vers un autre domaine sans reconstruction. Par défaut, `NUMA_OIDC_AUTHORITY` est dérivé de `NUMA_PUBLIC_URL`; `NUMA_API_URL`, `NUMA_DATA_MODE`, `NUMA_AUTH_MODE` et `NUMA_OIDC_CLIENT_ID` restent surchargeables.

L’installation utilise un certificat interne Caddy. Pour fournir un certificat de l’organisation, placez `fullchain.pem` et `privkey.pem` dans `/opt/numa/certificates`, puis configurez :

```dotenv
NUMA_TLS_CONFIG=tls /etc/numa/certificates/fullchain.pem /etc/numa/certificates/privkey.pem
```

Avec le certificat interne, exportez la CA générée et installez-la sur les postes clients :

```bash
cd /opt/numa
docker compose --env-file .env.production -f compose.production.yaml cp caddy:/data/caddy/pki/authorities/local/root.crt ./numa-local-ca.crt
```

Un autre fichier de configuration peut être utilisé sans modifier les scripts :

```bash
NUMA_ENV_FILE=config/site-a.env ./scripts/numa-status.sh
```

## Exploitation

```bash
cd /opt/numa
./scripts/numa-status.sh
./scripts/numa-backup.sh both
docker compose --env-file .env.production -f compose.production.yaml logs -f api worker
```

`numa-backup.sh` accepte `local`, `s3` ou `both`. Chaque bundle `.numa` contient le dump PostgreSQL, les documents et un manifeste d’intégrité; il est chiffré en AES-GCM et vérifié après création.

La restauration est volontairement hors ligne et demande une confirmation explicite :

```bash
./scripts/numa-restore.sh /var/lib/numa/backups/numa-YYYYMMDD-HHMMSS.numa
```

Le script crée d’abord une sauvegarde de sécurité, arrête les services applicatifs, authentifie et contrôle intégralement le bundle, prépare les documents sous des noms temporaires, restaure PostgreSQL, puis promeut les documents avec retour arrière en cas d’échec. Les chemins, types de fichiers, doublons, tailles et empreintes du manifeste sont contrôlés avant toute mutation persistante.

Pour une mise à jour hors ligne :

```bash
./scripts/numa-update.sh images/numa-images.tar.gz
```

Une sauvegarde est créée avant le chargement des nouvelles images et les contrôles Django de production sont exécutés après redémarrage.

## Vérifications de développement

```bash
docker compose run --rm --no-deps api ruff check --no-cache .
docker compose run --rm --no-deps api python manage.py check
docker compose run --rm --no-deps api python manage.py makemigrations --check --dry-run
docker compose run --rm --no-deps api pytest
npm run test:run
npm run build
npm run test:e2e:docker
npm run test:e2e:oidc
```

Le runtime Python de référence est Python 3.13 dans Docker. Pour l’analyse dans PyCharm, attachez un environnement WSL au module `backend` et utilisez `backend/manage.py`; ne placez pas l’environnement virtuel dans `/mnt/c`.

## Principes de sécurité

- Le bucket documentaire reste privé; les téléchargements passent par l’API authentifiée.
- Un fichier n’est téléchargeable qu’après validation antivirus.
- Les écritures sensibles utilisent `If-Match` pour éviter les écrasements concurrents.
- Les droits documentaires sont contrôlés par capacité et les événements sensibles alimentent une chaîne d’audit vérifiable.
- Les sauvegardes ne sont restaurées qu’après authentification cryptographique et validation du manifeste.
