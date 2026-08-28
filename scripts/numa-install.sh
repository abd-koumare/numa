#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${NUMA_ENV_FILE:-$ROOT_DIR/.env.production}"
[[ "$ENV_FILE" == /* ]] || ENV_FILE="$ROOT_DIR/$ENV_FILE"
export NUMA_ENV_FILE="$ENV_FILE"
DOMAIN="${1:-numa.local}"
VERSION="${NUMA_VERSION:-1.0.0}"

random_hex() { openssl rand -hex "$1"; }
fernet_key() { openssl rand -base64 32 | tr '+/' '-_' | tr -d '\n'; }

if [[ ! -f "$ENV_FILE" ]]; then
  umask 077
  POSTGRES_PASSWORD="$(random_hex 32)"
  DJANGO_SECRET_KEY="$(random_hex 48)"
  SETUP_TOKEN="$(random_hex 32)"
  ENCRYPTION_KEY="$(fernet_key)"
  MINIO_PASSWORD="$(random_hex 32)"
  KEYCLOAK_PASSWORD="$(random_hex 32)"
  BOOTSTRAP_PASSWORD="$(random_hex 12)Aa!"
  cat > "$ENV_FILE" <<EOF
NUMA_VERSION=$VERSION
NUMA_DOMAIN=$DOMAIN
NUMA_PUBLIC_URL=https://$DOMAIN
NUMA_TLS_CONFIG=tls internal
NUMA_CERT_DIR=./certificates
NUMA_DATA_MODE=api
NUMA_AUTH_MODE=oidc
NUMA_API_URL=/api/v1
NUMA_OIDC_CLIENT_ID=numa-web
POSTGRES_DB=numa
POSTGRES_USER=numa
POSTGRES_PASSWORD=$POSTGRES_PASSWORD
DJANGO_SECRET_KEY=$DJANGO_SECRET_KEY
DJANGO_DEBUG=false
DJANGO_ALLOWED_HOSTS=$DOMAIN,api
CSRF_TRUSTED_ORIGINS=https://$DOMAIN
CORS_ALLOWED_ORIGINS=https://$DOMAIN
DJANGO_SECURE_SSL_REDIRECT=true
DJANGO_SESSION_COOKIE_SECURE=true
DJANGO_CSRF_COOKIE_SECURE=true
NUMA_SETUP_TOKEN=$SETUP_TOKEN
NUMA_ENCRYPTION_KEY=$ENCRYPTION_KEY
NUMA_BACKUP_ENCRYPTION_KEY=$ENCRYPTION_KEY
NUMA_BACKUP_DIR=/var/lib/numa/backups
NUMA_BACKUP_S3_BUCKET=numa-backups
NUMA_BACKUP_S3_PREFIX=backups/
NUMA_BACKUP_KEEP_LOCAL_AFTER_S3=true
MINIO_ROOT_USER=numa
MINIO_ROOT_PASSWORD=$MINIO_PASSWORD
MINIO_BUCKET=numa-documents
USE_S3=true
KC_BOOTSTRAP_ADMIN_USERNAME=numa-keycloak-admin
KC_BOOTSTRAP_ADMIN_PASSWORD=$KEYCLOAK_PASSWORD
KEYCLOAK_ADMIN_USERNAME=numa-keycloak-admin
KEYCLOAK_ADMIN_PASSWORD=$KEYCLOAK_PASSWORD
KEYCLOAK_REALM=numa
KEYCLOAK_ADMIN_VERIFY_TLS=false
NUMA_BOOTSTRAP_ADMIN_USERNAME=numa.admin
NUMA_BOOTSTRAP_ADMIN_PASSWORD=$BOOTSTRAP_PASSWORD
OIDC_AUDIENCE=numa-api
OIDC_WEB_CLIENT_ID=numa-web
OIDC_ALLOW_DEV_AUTH=false
NUMA_SEED_DEMO=false
NUMA_USE_RUNSERVER=false
GUNICORN_WORKERS=4
GUNICORN_THREADS=2
GUNICORN_TIMEOUT=120
CELERY_WORKER_CONCURRENCY=4
NUMA_TIMEZONE=UTC
LOG_LEVEL=INFO
MAX_UPLOAD_SIZE=26214400
OCR_LANGUAGES=fra+eng
EMAIL_BACKEND=django.core.mail.backends.console.EmailBackend
DEFAULT_FROM_EMAIL=NUMA <numa@$DOMAIN>
EOF
  chmod 600 "$ENV_FILE"
  printf 'Compte initial : numa.admin\nMot de passe temporaire : %s\n' "$BOOTSTRAP_PASSWORD"
else
  printf 'Configuration existante conservée : %s\n' "$ENV_FILE"
fi

if [[ -f "$ROOT_DIR/images/numa-images.tar.gz" ]]; then
  (cd "$ROOT_DIR" && sha256sum -c SHA256SUMS)
  gzip -dc "$ROOT_DIR/images/numa-images.tar.gz" | docker load
fi

mkdir -p "$ROOT_DIR/certificates"
"$ROOT_DIR/scripts/numa-doctor.sh"
docker compose --env-file "$ENV_FILE" -f "$ROOT_DIR/compose.production.yaml" up -d --pull never

for attempt in $(seq 1 90); do
  if docker compose --env-file "$ENV_FILE" -f "$ROOT_DIR/compose.production.yaml" exec -T api python manage.py check >/dev/null 2>&1; then
    printf 'NUMA est prêt : https://%s\n' "$DOMAIN"
    printf 'Avec le certificat interne, installez la CA Caddy depuis le volume caddy_data sur les postes clients.\n'
    if [[ "${EUID:-$(id -u)}" -eq 0 && "$ROOT_DIR" == "/opt/numa" ]] && command -v systemctl >/dev/null; then
      install -m 0644 "$ROOT_DIR/docker/systemd/numa-backup.service" /etc/systemd/system/numa-backup.service
      install -m 0644 "$ROOT_DIR/docker/systemd/numa-backup.timer" /etc/systemd/system/numa-backup.timer
      systemctl daemon-reload
      systemctl enable --now numa-backup.timer
      printf 'Sauvegarde quotidienne activée à 03:00 UTC.\n'
    else
      printf 'Pour activer la sauvegarde planifiée, installez le kit dans /opt/numa et relancez cet installateur en root.\n'
    fi
    exit 0
  fi
  sleep 5
done

docker compose --env-file "$ENV_FILE" -f "$ROOT_DIR/compose.production.yaml" ps
printf 'Le délai de démarrage est dépassé. Consultez : docker compose -f compose.production.yaml logs\n' >&2
exit 1
