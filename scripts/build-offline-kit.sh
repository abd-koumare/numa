#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VERSION="${NUMA_VERSION:-1.0.0}"
KIT_DIR="${1:-$ROOT_DIR/offline-kit/numa-${VERSION}-linux-x86_64}"

"$ROOT_DIR/scripts/build-production-images.sh"
mkdir -p "$KIT_DIR/images"
docker save \
  "numa-api:${VERSION}" "numa-web:${VERSION}" \
  postgres:17.6-alpine redis:8.2-alpine \
  minio/minio:RELEASE.2025-04-22T22-12-26Z minio/mc:RELEASE.2025-04-16T18-13-26Z \
  clamav/clamav:1.4.3 quay.io/keycloak/keycloak:26.3.2 caddy:2.10.2-alpine \
  | gzip -1 > "$KIT_DIR/images/numa-images.tar.gz"

cp "$ROOT_DIR/compose.production.yaml" "$ROOT_DIR/.env.production.example" "$ROOT_DIR/README.md" "$KIT_DIR/"
cp -R "$ROOT_DIR/docker" "$ROOT_DIR/scripts" "$KIT_DIR/"
(
  cd "$KIT_DIR"
  sha256sum images/numa-images.tar.gz > SHA256SUMS
)
ARCHIVE="${KIT_DIR}.tar.gz"
tar -C "$(dirname "$KIT_DIR")" -czf "$ARCHIVE" "$(basename "$KIT_DIR")"
(
  cd "$(dirname "$ARCHIVE")"
  sha256sum "$(basename "$ARCHIVE")" > "$(basename "$ARCHIVE").sha256"
)
printf 'Kit créé : %s.tar.gz\n' "$KIT_DIR"
