#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${NUMA_ENV_FILE:-$ROOT_DIR/.env.production}"
[[ "$ENV_FILE" == /* ]] || ENV_FILE="$ROOT_DIR/$ENV_FILE"
export NUMA_ENV_FILE="$ENV_FILE"
BACKUP_PATH="${1:-}"

if [[ -z "$BACKUP_PATH" || "$BACKUP_PATH" != /var/lib/numa/backups/*.numa ]]; then
  printf 'Usage : %s /var/lib/numa/backups/nom-de-sauvegarde.numa\n' "$0" >&2
  exit 2
fi

printf 'Une sauvegarde de sécurité va être créée avant tout changement.\n'
"$ROOT_DIR/scripts/numa-backup.sh" local
read -r -p 'Saisissez RESTORE-NUMA pour arrêter les services et restaurer : ' confirmation
[[ "$confirmation" == "RESTORE-NUMA" ]] || { printf 'Restauration annulée.\n'; exit 1; }

compose=(docker compose --env-file "$ENV_FILE" -f "$ROOT_DIR/compose.production.yaml")
restart_services() { "${compose[@]}" up -d >/dev/null; }
trap restart_services EXIT

"${compose[@]}" stop caddy frontend worker beat api keycloak
"${compose[@]}" run --rm --no-deps api python manage.py numa_restore "$BACKUP_PATH" --confirm RESTORE-NUMA
"${compose[@]}" up -d
trap - EXIT

for attempt in $(seq 1 90); do
  if "${compose[@]}" exec -T api python manage.py check >/dev/null 2>&1; then
    "${compose[@]}" exec -T api python manage.py check --deploy
    printf 'Restauration terminée.\n'
    exit 0
  fi
  sleep 5
done
printf 'Les services ont redémarré mais les contrôles n’ont pas abouti. Consultez les journaux.\n' >&2
exit 1
