#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VERSION="${NUMA_VERSION:-1.0.0}"
KIT_DIR="${1:-$ROOT_DIR/offline-kit/numa-${VERSION}-linux-x86_64}"
[[ ! -e "$KIT_DIR" && ! -e "${KIT_DIR}.tar.gz" ]] || { printf 'Destination déjà existante : %s\n' "$KIT_DIR" >&2; exit 2; }

"$ROOT_DIR/scripts/build-production-images.sh"
mkdir -p "$KIT_DIR/images" "$KIT_DIR/docs"
docker save \
  "numa-api:${VERSION}" "numa-web:${VERSION}" \
  postgres:17.6-alpine redis:8.2-alpine \
  minio/minio:RELEASE.2025-04-22T22-12-26Z minio/mc:RELEASE.2025-04-16T18-13-26Z \
  clamav/clamav:1.4.3 quay.io/keycloak/keycloak:26.3.2 caddy:2.10.2-alpine \
  | gzip -1 > "$KIT_DIR/images/numa-images.tar.gz"

cp "$ROOT_DIR/compose.production.yaml" "$ROOT_DIR/.env.production.example" "$ROOT_DIR/README.md" "$KIT_DIR/"
cp \
  "$ROOT_DIR/docs/docker-images-and-setup.md" \
  "$ROOT_DIR/docs/ubuntu-24-production-deployment.md" \
  "$ROOT_DIR/docs/configuration-audit.md" \
  "$ROOT_DIR/docs/connected-acceptance.md" \
  "$KIT_DIR/docs/"
cp -R "$ROOT_DIR/docker" "$ROOT_DIR/scripts" "$KIT_DIR/"
docker image inspect --format '{"id":{{json .Id}},"tags":{{json .RepoTags}},"digests":{{json .RepoDigests}},"os":{{json .Os}},"architecture":{{json .Architecture}}}' \
  "numa-api:${VERSION}" "numa-web:${VERSION}" \
  postgres:17.6-alpine redis:8.2-alpine \
  minio/minio:RELEASE.2025-04-22T22-12-26Z minio/mc:RELEASE.2025-04-16T18-13-26Z \
  clamav/clamav:1.4.3 quay.io/keycloak/keycloak:26.3.2 caddy:2.10.2-alpine \
  > "$KIT_DIR/IMAGES.jsonl"
{
  printf 'version=%s\nplatform=linux/amd64\nbuilt_at=%s\n' "$VERSION" "$(date -u +%FT%TZ)"
  printf 'source_commit=%s\n' "$(git -C "$ROOT_DIR" rev-parse HEAD)"
  if [[ -n "$(git -C "$ROOT_DIR" status --porcelain --untracked-files=normal)" ]]; then
    printf 'source_worktree=modified\n'
  else
    printf 'source_worktree=clean\n'
  fi
} > "$KIT_DIR/BUILD-INFO.txt"
(
  cd "$KIT_DIR"
  find . -type f ! -name SHA256SUMS -print0 | sort -z | xargs -0 sha256sum > SHA256SUMS
  sha256sum -c SHA256SUMS
)
ARCHIVE="${KIT_DIR}.tar.gz"
tar -C "$(dirname "$KIT_DIR")" -czf "$ARCHIVE" "$(basename "$KIT_DIR")"
(
  cd "$(dirname "$ARCHIVE")"
  sha256sum "$(basename "$ARCHIVE")" > "$(basename "$ARCHIVE").sha256"
)
printf 'Kit créé : %s.tar.gz\n' "$KIT_DIR"
