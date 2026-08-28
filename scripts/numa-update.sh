#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${NUMA_ENV_FILE:-$ROOT_DIR/.env.production}"
[[ "$ENV_FILE" == /* ]] || ENV_FILE="$ROOT_DIR/$ENV_FILE"
export NUMA_ENV_FILE="$ENV_FILE"
IMAGE_ARCHIVE="${1:-$ROOT_DIR/images/numa-images.tar.gz}"

[[ -f "$IMAGE_ARCHIVE" ]] || { printf 'Archive d’images introuvable : %s\n' "$IMAGE_ARCHIVE" >&2; exit 2; }
"$ROOT_DIR/scripts/numa-backup.sh" both
gzip -dc "$IMAGE_ARCHIVE" | docker load
docker compose --env-file "$ENV_FILE" -f "$ROOT_DIR/compose.production.yaml" up -d --pull never
docker compose --env-file "$ENV_FILE" -f "$ROOT_DIR/compose.production.yaml" exec -T api python manage.py check --deploy
printf 'Mise à jour NUMA appliquée.\n'
