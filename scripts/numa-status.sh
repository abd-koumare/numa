#!/usr/bin/env bash
set -euo pipefail
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${NUMA_ENV_FILE:-$ROOT_DIR/.env.production}"
[[ "$ENV_FILE" == /* ]] || ENV_FILE="$ROOT_DIR/$ENV_FILE"
export NUMA_ENV_FILE="$ENV_FILE"
docker compose --env-file "$ENV_FILE" -f "$ROOT_DIR/compose.production.yaml" ps
docker compose --env-file "$ENV_FILE" -f "$ROOT_DIR/compose.production.yaml" exec -T api python manage.py check --deploy
