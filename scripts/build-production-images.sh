#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VERSION="${NUMA_VERSION:-1.0.0}"
[[ "$VERSION" =~ ^[A-Za-z0-9_][A-Za-z0-9_.-]{0,127}$ ]] || { printf 'Version Docker invalide.\n' >&2; exit 2; }

docker build --platform linux/amd64 -t "numa-api:${VERSION}" "$ROOT_DIR/backend"
docker build \
  --platform linux/amd64 \
  -f "$ROOT_DIR/docker/frontend/Dockerfile.production" \
  -t "numa-web:${VERSION}" "$ROOT_DIR"

for image in \
  postgres:17.6-alpine redis:8.2-alpine \
  minio/minio:RELEASE.2025-04-22T22-12-26Z minio/mc:RELEASE.2025-04-16T18-13-26Z \
  clamav/clamav:1.4.3 quay.io/keycloak/keycloak:26.3.2 caddy:2.10.2-alpine; do
  docker pull --platform linux/amd64 "$image"
done
