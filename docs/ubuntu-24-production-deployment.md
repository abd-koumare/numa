# Procédure de déploiement de NUMA sur Ubuntu Server 24.04 LTS

Cette procédure décrit une installation de production neuve de NUMA sur **Ubuntu Server 24.04 LTS x86_64**. Elle utilise le kit hors ligne fourni par le projet : le serveur reçoit des images déjà construites et ne compile pas le code source.

Le déploiement de référence utilise :

- `/opt/numa` comme répertoire d’installation ;
- Docker Engine et le plugin Docker Compose ;
- Caddy comme point d’entrée HTTPS ;
- un nom DNS dédié, par exemple `numa.exemple.local` ;
- le compte applicatif initial `numa.admin` avec un mot de passe temporaire généré à l’installation.

Pour comprendre le rôle de chaque conteneur, consultez aussi le [guide des images Docker](docker-images-and-setup.md).

## 1. Informations à préparer

Avant de commencer, réunissez les informations suivantes :

| Information | Exemple | Obligatoire |
|---|---|---|
| Nom DNS de NUMA | `numa.exemple.local` | Oui |
| Adresse IP fixe du serveur | `192.0.2.20` | Oui |
| Méthode HTTPS | CA interne Caddy ou certificat de l’organisation | Oui |
| Serveur SMTP | `smtp.exemple.local:25` | Non pour démarrer, oui pour envoyer des courriels |
| Relais/NAT/pare-feu | ports autorisés depuis les postes clients | Oui |
| Gestionnaire de secrets | coffre-fort de l’organisation | Fortement recommandé |
| Politique de sauvegarde | locale, MinIO et copie externe | Oui en production |

Le DNS doit résoudre le nom choisi vers l’adresse du serveur depuis tous les postes qui utiliseront NUMA.

## 2. Architecture et ports

Le serveur cible doit disposer au minimum de :

- Ubuntu Server 24.04 LTS x86_64 ;
- 8 Gio de mémoire vive ;
- 4 vCPU recommandés ;
- 20 Gio d’espace libre au minimum, davantage selon le volume de documents ;
- une adresse IP stable ;
- une horloge synchronisée ;
- les ports TCP `80` et `443` disponibles ;
- le port UDP `443` si HTTP/3 est autorisé ;
- le port SSH de l’organisation, généralement TCP `22`, limité aux administrateurs.

En production, Docker ne publie pas PostgreSQL, Redis, MinIO, ClamAV, Keycloak ou Django directement. Seul Caddy publie `80` et `443`.

## 3. Construire le kit sur une machine connectée

Cette étape se fait sur une machine de construction x86_64 disposant de Docker et d’un accès Internet, jamais sur le serveur de production isolé.

### 3.1 Récupérer la version à livrer

Depuis le dépôt NUMA :

```bash
git status
git pull --ff-only
git log -1 --oneline
```

Le répertoire doit être propre et positionné sur le commit ou le tag validé pour la livraison.

### 3.2 Choisir le numéro de version

Exemple avec la version `1.0.0` :

```bash
export NUMA_VERSION=1.0.0
```

Le même numéro identifie les images `numa-api` et `numa-web`.

### 3.3 Construire l’archive complète

```bash
./scripts/build-offline-kit.sh
```

Les fichiers produits se trouvent sous `offline-kit/` :

```text
offline-kit/
├── numa-1.0.0-linux-x86_64.tar.gz
└── numa-1.0.0-linux-x86_64.tar.gz.sha256
```

Vérifiez immédiatement l’archive :

```bash
cd offline-kit
sha256sum -c numa-1.0.0-linux-x86_64.tar.gz.sha256
```

Le résultat doit se terminer par `OK`.

## 4. Préparer Ubuntu Server 24.04

Connectez-vous avec un compte autorisé à utiliser `sudo`.

### 4.1 Vérifier le système

```bash
cat /etc/os-release
uname -m
free -h
df -h /
timedatectl status
```

Les valeurs attendues sont :

- version Ubuntu `24.04` ;
- architecture `x86_64` ;
- heure synchronisée ;
- mémoire et espace disque conformes aux prérequis.

Mettez les paquets système à jour avant la fenêtre de déploiement :

```bash
sudo apt update
sudo apt upgrade -y
sudo reboot
```

Reconnectez-vous après le redémarrage.

### 4.2 Configurer le nom de la machine

Exemple :

```bash
sudo hostnamectl set-hostname numa-prod-01
hostnamectl
```

Le nom Linux de la machine peut être différent du nom DNS public de NUMA.

### 4.3 Vérifier le DNS

```bash
getent ahostsv4 numa.exemple.local
```

La commande doit afficher l’adresse IP attendue. Testez également la résolution depuis un poste client.

## 5. Installer Docker Engine

Les commandes suivantes suivent la méthode recommandée par la [documentation officielle Docker pour Ubuntu](https://docs.docker.com/engine/install/ubuntu/). N’utilisez pas le script rapide `get.docker.com` pour une production.

Si Docker est déjà installé et utilisé par d’autres applications, arrêtez-vous et faites d’abord un inventaire. Ne supprimez pas une installation existante ni `/var/lib/docker` sans étude d’impact.

### 5.1 Ajouter la clé officielle Docker

```bash
sudo apt update
sudo apt install -y ca-certificates curl
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg \
  -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc
```

### 5.2 Ajouter le dépôt APT Docker

```bash
sudo tee /etc/apt/sources.list.d/docker.sources >/dev/null <<EOF
Types: deb
URIs: https://download.docker.com/linux/ubuntu
Suites: $(. /etc/os-release && echo "${UBUNTU_CODENAME:-$VERSION_CODENAME}")
Components: stable
Architectures: $(dpkg --print-architecture)
Signed-By: /etc/apt/keyrings/docker.asc
EOF

sudo apt update
```

### 5.3 Installer Docker et Compose

```bash
sudo apt install -y \
  docker-ce \
  docker-ce-cli \
  containerd.io \
  docker-buildx-plugin \
  docker-compose-plugin

sudo systemctl enable --now docker
```

### 5.4 Vérifier Docker

```bash
sudo docker version
sudo docker compose version
sudo systemctl --no-pager --full status docker
```

Il n’est pas nécessaire d’ajouter l’administrateur au groupe `docker` : ce groupe donne pratiquement les mêmes privilèges que `root`. Les commandes de production de cette procédure utilisent `sudo`.

Pour un serveur totalement isolé, téléchargez au préalable les paquets `.deb` Docker et leurs dépendances comme décrit dans la section « Install from a package » de la documentation officielle.

## 6. Configurer le réseau et le pare-feu

Autorisez au minimum :

- SSH uniquement depuis le réseau d’administration ;
- TCP `80` et `443` depuis les réseaux clients ;
- UDP `443` depuis les réseaux clients si HTTP/3 est souhaité.

Exemple UFW simple, à adapter avant activation pour ne pas perdre l’accès SSH :

```bash
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow from 192.0.2.0/24 to any port 22 proto tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw allow 443/udp
sudo ufw enable
sudo ufw status verbose
```

Remplacez `192.0.2.0/24` par le véritable réseau d’administration.

Attention : Docker crée ses propres règles de filtrage et les ports publiés par un conteneur peuvent contourner certaines règles UFW. La [documentation Docker sur les pare-feu](https://docs.docker.com/engine/network/packet-filtering-firewalls/) recommande de contrôler ces flux dans la chaîne `DOCKER-USER` ou dans un pare-feu réseau externe. Dans la stack NUMA fournie, seuls `80` et `443` sont publiés, mais cette propriété doit être vérifiée après chaque modification de Compose.

Contrôlez les ports déjà occupés :

```bash
sudo ss -lntup
```

N’installez pas Nginx, Apache, PostgreSQL ou Redis directement sur l’hôte pour NUMA : ces composants sont déjà fournis par les conteneurs.

## 7. Transférer le kit sur le serveur

Depuis la machine de construction :

```bash
scp \
  offline-kit/numa-1.0.0-linux-x86_64.tar.gz \
  offline-kit/numa-1.0.0-linux-x86_64.tar.gz.sha256 \
  administrateur@numa-prod-01:/tmp/
```

Sur le serveur :

```bash
cd /tmp
sha256sum -c numa-1.0.0-linux-x86_64.tar.gz.sha256
```

N’installez rien si le contrôle n’affiche pas `OK`. Retransférez l’archive depuis une source de confiance.

## 8. Installer NUMA

### 8.1 Extraire le kit

```bash
sudo mkdir -p /opt/numa
sudo tar --strip-components=1 \
  -xzf /tmp/numa-1.0.0-linux-x86_64.tar.gz \
  -C /opt/numa
sudo chown -R root:root /opt/numa
```

Vérifiez les fichiers principaux :

```bash
sudo ls -la /opt/numa
sudo test -x /opt/numa/scripts/numa-install.sh
```

### 8.2 Lancer l’installateur

```bash
sudo env NUMA_VERSION=1.0.0 /opt/numa/scripts/numa-install.sh numa.exemple.local
```

Remplacez `numa.exemple.local` par le nom DNS réel et `1.0.0` par la version des images du kit. Lors d’une première installation, cette version est enregistrée dans `.env.production`.

L’installateur effectue automatiquement les opérations suivantes :

1. création de secrets cryptographiques uniques ;
2. création de `/opt/numa/.env.production` en mode `600` ;
3. vérification de l’archive d’images ;
4. chargement des images Docker ;
5. diagnostic d’Ubuntu, Docker, Compose, mémoire, disque et configuration ;
6. démarrage de PostgreSQL, Redis, MinIO, ClamAV et Keycloak ;
7. application des migrations Django ;
8. démarrage de l’API, des workers, du frontend et de Caddy ;
9. création du compte applicatif `numa.admin` ;
10. activation de la sauvegarde quotidienne à `03:00 UTC`.

Pendant cette commande, copiez immédiatement dans le gestionnaire de secrets :

- le nom du compte initial : `numa.admin` ;
- le mot de passe temporaire affiché ;
- une copie protégée de `/opt/numa/.env.production`, particulièrement la clé de sauvegarde.

Le mot de passe initial n’est affiché que lors de la création du fichier. Relancer l’installateur conserve une configuration existante.

## 9. Configurer HTTPS

### Option A — Certificat interne Caddy

C’est l’option créée automatiquement par l’installateur :

```dotenv
NUMA_TLS_CONFIG=tls internal
```

Exportez l’autorité de certification Caddy :

```bash
cd /opt/numa
sudo docker compose --env-file .env.production -f compose.production.yaml \
  cp caddy:/data/caddy/pki/authorities/local/root.crt ./numa-local-ca.crt
sudo chmod 0644 ./numa-local-ca.crt
```

Distribuez `numa-local-ca.crt` par un canal de confiance et installez-le dans le magasin de certificats des postes clients. Ne distribuez jamais une clé privée Caddy.

### Option B — Certificat fourni par l’organisation

Copiez le certificat et sa clé privée :

```bash
sudo install -d -m 0750 /opt/numa/certificates
sudo install -m 0644 fullchain.pem /opt/numa/certificates/fullchain.pem
sudo install -m 0600 privkey.pem /opt/numa/certificates/privkey.pem
```

Modifiez ensuite la ligne suivante avec `sudoedit /opt/numa/.env.production` :

```dotenv
NUMA_TLS_CONFIG=tls /etc/numa/certificates/fullchain.pem /etc/numa/certificates/privkey.pem
```

Appliquez la modification :

```bash
cd /opt/numa
sudo ./scripts/numa-doctor.sh
sudo docker compose --env-file .env.production -f compose.production.yaml up -d --pull never
```

Prévoyez le renouvellement du certificat avant son expiration, puis recréez ou redémarrez Caddy après remplacement.

## 10. Configurer le serveur SMTP

Cette étape est facultative pour ouvrir l’application, mais obligatoire pour envoyer réellement les notifications par courriel.

Ouvrez le fichier secret :

```bash
sudoedit /opt/numa/.env.production
```

Adaptez les variables :

```dotenv
EMAIL_BACKEND=django.core.mail.backends.smtp.EmailBackend
EMAIL_HOST=smtp.exemple.local
EMAIL_PORT=25
EMAIL_HOST_USER=
EMAIL_HOST_PASSWORD=
EMAIL_USE_TLS=false
DEFAULT_FROM_EMAIL=NUMA <numa@exemple.local>
```

Appliquez ensuite la configuration :

```bash
cd /opt/numa
sudo ./scripts/numa-doctor.sh
sudo docker compose --env-file .env.production -f compose.production.yaml up -d --pull never
```

## 11. Vérifier le déploiement

### 11.1 Contrôler les conteneurs

```bash
cd /opt/numa
sudo ./scripts/numa-status.sh
sudo docker compose --env-file .env.production -f compose.production.yaml ps -a
```

Le résultat attendu est :

- `postgres`, `redis`, `minio`, `clamav`, `keycloak`, `api`, `worker`, `beat`, `frontend` et `caddy` sont actifs ;
- `minio-init` et `migrate` peuvent être `Exited (0)`, ce qui est normal ;
- `python manage.py check --deploy` ne remonte aucune erreur bloquante.

### 11.2 Contrôler les journaux

```bash
sudo docker compose --env-file .env.production -f compose.production.yaml \
  logs --tail=200 api worker beat keycloak caddy
```

### 11.3 Tester HTTPS depuis le serveur

Avec le certificat interne avant installation de la CA :

```bash
curl -k https://numa.exemple.local/api/v1/health/
```

Après export de la CA :

```bash
curl --cacert /opt/numa/numa-local-ca.crt \
  https://numa.exemple.local/api/v1/health/
```

Avec un certificat reconnu par le système :

```bash
curl https://numa.exemple.local/api/v1/health/
```

La réponse doit indiquer que les composants contrôlés sont opérationnels.

### 11.4 Vérifier les ports publiés

```bash
sudo docker ps --format 'table {{.Names}}\t{{.Ports}}'
sudo ss -lntup | grep -E ':(80|443)\b'
```

Aucun port PostgreSQL `5432`, Redis `6379`, MinIO `9000/9001`, ClamAV `3310`, Keycloak `8080` ou Django `8000` ne doit être publié par la stack de production.

## 12. Première connexion

1. Ouvrez `https://numa.exemple.local` depuis un poste client.
2. Si Caddy utilise sa CA interne, installez d’abord `numa-local-ca.crt` sur le poste.
3. Connectez-vous avec `numa.admin` et le mot de passe temporaire conservé.
4. Keycloak exige le changement du mot de passe temporaire.
5. Enregistrez le nouveau mot de passe dans le gestionnaire de secrets.
6. Vérifiez l’accès aux écrans de configuration et créez les autres comptes nécessaires selon la politique de l’organisation.

Le compte `numa-keycloak-admin` contenu dans `.env.production` sert à administrer Keycloak. Il ne doit pas être utilisé comme compte métier quotidien.

## 13. Sauvegardes

### 13.1 Vérifier la planification

```bash
sudo systemctl status numa-backup.timer
sudo systemctl list-timers numa-backup.timer
```

### 13.2 Lancer une sauvegarde manuelle

```bash
cd /opt/numa
sudo ./scripts/numa-backup.sh both
```

Destinations acceptées :

- `local` : volume local de sauvegarde ;
- `s3` : bucket MinIO `numa-backups` ;
- `both` : les deux destinations.

Testez périodiquement une restauration sur une machine isolée. Une sauvegarde non testée ne garantit pas une reprise possible.

### 13.3 Restaurer

La restauration arrête temporairement les services applicatifs et demande une confirmation explicite :

```bash
cd /opt/numa
sudo ./scripts/numa-restore.sh \
  /var/lib/numa/backups/numa-YYYYMMDD-HHMMSS.numa
```

Le chemin correspond au chemin vu dans le conteneur API et son volume de sauvegarde.

## 14. Exploitation courante

Afficher l’état :

```bash
cd /opt/numa
sudo ./scripts/numa-status.sh
```

Suivre les journaux :

```bash
sudo docker compose --env-file .env.production -f compose.production.yaml \
  logs -f api worker caddy
```

Redémarrer proprement les services :

```bash
sudo docker compose --env-file .env.production -f compose.production.yaml restart
```

Arrêter sans supprimer les données :

```bash
sudo docker compose --env-file .env.production -f compose.production.yaml down
```

Redémarrer après un arrêt :

```bash
sudo docker compose --env-file .env.production -f compose.production.yaml up -d --pull never
```

N’utilisez **jamais** `docker compose down -v` en production : l’option `-v` supprime les volumes de données.

## 15. Mise à jour de NUMA

Avant la fenêtre de mise à jour :

1. construisez un nouveau kit depuis la version validée ;
2. vérifiez sa somme SHA-256 ;
3. conservez l’ancien kit et son archive d’images pour un éventuel retour arrière ;
4. copiez le nouveau kit sur le serveur ;
5. vérifiez que la dernière sauvegarde est exploitable.

Pour remplacer des images portant le même numéro de version que celui enregistré dans `.env.production`, le script de mise à jour crée lui-même une sauvegarde avant de charger les images :

```bash
cd /opt/numa
sudo ./scripts/numa-update.sh /chemin/vers/numa-images.tar.gz
```

Si le nouveau kit utilise un autre numéro de version, le script ne modifie pas automatiquement `NUMA_VERSION`. Effectuez la sauvegarde avec la version courante, chargez les nouvelles images, puis sélectionnez leur version :

```bash
cd /opt/numa
sudo ./scripts/numa-backup.sh both
sudo docker load --input /chemin/vers/numa-images.tar.gz
sudoedit /opt/numa/.env.production
```

Dans le fichier, remplacez uniquement `NUMA_VERSION` par le numéro du nouveau kit, puis appliquez la configuration :

```bash
sudo ./scripts/numa-doctor.sh
sudo docker compose --env-file .env.production -f compose.production.yaml up -d --pull never
```

Après la mise à jour :

```bash
sudo ./scripts/numa-status.sh
curl -k https://numa.exemple.local/api/v1/health/
```

Si une version modifie `compose.production.yaml`, les scripts ou les fichiers `docker/`, préparez d’abord une copie de sécurité de `/opt/numa`, puis déployez aussi ces fichiers depuis le nouveau kit selon les notes de version. Ne remplacez jamais `.env.production` par le fichier d’exemple.

## 16. Contrôles de sécurité après installation

- `/opt/numa/.env.production` appartient à `root` et possède le mode `600`.
- Les ports internes des conteneurs ne sont pas publiés.
- Le certificat est approuvé par les postes clients et sa date d’expiration est suivie.
- SSH est limité au réseau d’administration.
- Le mot de passe temporaire `numa.admin` a été remplacé.
- Les secrets et la clé de sauvegarde sont conservés hors du serveur.
- Une sauvegarde manuelle a réussi.
- Une restauration a été testée sur une machine isolée.
- Les journaux ne contiennent pas d’erreur répétée.
- Le système et Docker sont intégrés au processus de correctifs de sécurité de l’organisation.

Vérification des permissions :

```bash
sudo stat -c '%U:%G %a %n' /opt/numa/.env.production
```

Résultat attendu :

```text
root:root 600 /opt/numa/.env.production
```

## 17. Diagnostic rapide

### L’installateur refuse Ubuntu ou l’architecture

```bash
cat /etc/os-release
uname -m
```

La cible actuellement validée est Ubuntu 24.04 x86_64.

### Les ports 80 ou 443 sont occupés

```bash
sudo ss -lntup | grep -E ':(80|443)\b'
```

Arrêtez ou reconfigurez le service concerné avant de démarrer Caddy.

### L’API ne trouve pas PostgreSQL

```bash
cd /opt/numa
sudo docker compose --env-file .env.production -f compose.production.yaml ps -a
sudo docker compose --env-file .env.production -f compose.production.yaml \
  logs --tail=200 postgres api
```

La stack doit être démarrée avec le projet Compose complet, pas conteneur par conteneur depuis une interface graphique.

### ClamAV reste en démarrage

Le premier démarrage peut être long pendant l’initialisation des signatures :

```bash
sudo docker compose --env-file .env.production -f compose.production.yaml \
  logs --tail=200 clamav
```

### Le navigateur refuse le certificat

Avec `tls internal`, installez `numa-local-ca.crt` dans le magasin des autorités de confiance du poste. Ne désactivez pas durablement la vérification TLS dans le navigateur.

## 18. Fiche de recette finale

| Contrôle | Résultat attendu |
|---|---|
| DNS | le domaine retourne l’IP du serveur |
| HTTPS | aucune alerte après installation de la CA ou du certificat officiel |
| Santé API | réponse HTTP `200` |
| Conteneurs permanents | actifs et sains |
| `migrate` et `minio-init` | `Exited (0)` accepté |
| Connexion | `numa.admin` connecté et mot de passe changé |
| Configuration | écrans accessibles au super-administrateur |
| Courriel | message de test reçu si SMTP activé |
| Sauvegarde | création `both` réussie |
| Planification | `numa-backup.timer` actif |
| Ports internes | non publiés |
| Secrets | fichier `600` et copie externe protégée |
