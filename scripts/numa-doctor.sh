#!/usr/bin/env bash
set -uo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${NUMA_ENV_FILE:-$ROOT_DIR/.env.production}"
[[ "$ENV_FILE" == /* ]] || ENV_FILE="$ROOT_DIR/$ENV_FILE"
export NUMA_ENV_FILE="$ENV_FILE"
ERRORS=0

ok() { printf 'OK   %s\n' "$1"; }
fail() { printf 'ERREUR %s\n' "$1" >&2; ERRORS=$((ERRORS + 1)); }

[[ "$(uname -m)" == "x86_64" ]] && ok "architecture x86_64" || fail "Ubuntu x86_64 est requis"
if [[ -r /etc/os-release ]]; then
  . /etc/os-release
  [[ "${ID:-}" == "ubuntu" && "${VERSION_ID:-}" == "24.04" ]] && ok "Ubuntu 24.04" || printf 'AVERTISSEMENT système détecté : %s %s\n' "${ID:-inconnu}" "${VERSION_ID:-}"
fi
command -v docker >/dev/null && docker info >/dev/null 2>&1 && ok "Docker opérationnel" || fail "Docker Engine est indisponible"
docker compose version >/dev/null 2>&1 && ok "Docker Compose disponible" || fail "docker compose est indisponible"
[[ -f "$ENV_FILE" ]] && ok "fichier de configuration présent" || fail "fichier de configuration absent : $ENV_FILE"

if [[ -f "$ENV_FILE" ]]; then
  mode="$(stat -c '%a' "$ENV_FILE" 2>/dev/null || true)"
  [[ "$mode" == "600" || "$mode" == "400" ]] && ok "permissions du fichier secret" || fail "le fichier de configuration doit être en mode 600"
  if grep -Eq 'CHANGE_ME|unsafe-development|numa_dev_password|DJANGO_DEBUG=true|OIDC_ALLOW_DEV_AUTH=true' "$ENV_FILE"; then
    fail "une valeur de développement ou un secret factice subsiste"
  else
    ok "secrets et modes de production"
  fi
  required_variables=(
    NUMA_PUBLIC_URL POSTGRES_DB POSTGRES_USER POSTGRES_PASSWORD DJANGO_SECRET_KEY
    NUMA_ENCRYPTION_KEY NUMA_BACKUP_ENCRYPTION_KEY MINIO_ROOT_USER MINIO_ROOT_PASSWORD
    MINIO_BUCKET NUMA_BOOTSTRAP_ADMIN_USERNAME NUMA_BOOTSTRAP_ADMIN_PASSWORD
  )
  for variable in "${required_variables[@]}"; do
    grep -Eq "^${variable}=.+" "$ENV_FILE" || fail "variable obligatoire absente : $variable"
  done
  grep -Eq '^NUMA_PUBLIC_URL=https://[^[:space:]]+$' "$ENV_FILE" && ok "URL publique HTTPS" || fail "NUMA_PUBLIC_URL doit être une URL HTTPS"
  grep -Eq '^NUMA_BACKUP_ENCRYPTION_KEY=[A-Za-z0-9_-]{43}=?$' "$ENV_FILE" && ok "clé de sauvegarde valide" || fail "NUMA_BACKUP_ENCRYPTION_KEY doit être une clé base64 URL-safe de 32 octets"
  docker compose --env-file "$ENV_FILE" -f "$ROOT_DIR/compose.production.yaml" config --quiet >/dev/null 2>&1 && ok "configuration Compose valide" || fail "configuration Compose invalide"
fi

memory_kib="$(awk '/MemTotal/ {print $2}' /proc/meminfo)"
(( memory_kib >= 8 * 1024 * 1024 )) && ok "mémoire >= 8 Gio" || printf 'AVERTISSEMENT mémoire recommandée : 8 Gio minimum\n'
available_kib="$(df -Pk "$ROOT_DIR" | awk 'NR==2 {print $4}')"
(( available_kib >= 20 * 1024 * 1024 )) && ok "espace libre >= 20 Gio" || fail "moins de 20 Gio libres pour l’installation"

if command -v ss >/dev/null; then
  ss -ltnH | awk '{print $4}' | grep -Eq '(:80|:443)$' && printf 'AVERTISSEMENT les ports 80 ou 443 sont déjà occupés\n' || ok "ports 80 et 443 disponibles"
fi

if (( ERRORS > 0 )); then
  printf '%s erreur(s) bloquante(s).\n' "$ERRORS" >&2
  exit 1
fi
printf 'Diagnostic prêt pour le déploiement NUMA.\n'
