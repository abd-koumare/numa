#!/usr/bin/env bash
set -euo pipefail

: "${NUMA_PUBLIC_URL:?NUMA_PUBLIC_URL est obligatoire}"
: "${NUMA_BOOTSTRAP_ADMIN_USERNAME:?NUMA_BOOTSTRAP_ADMIN_USERNAME est obligatoire}"
: "${NUMA_BOOTSTRAP_ADMIN_PASSWORD:?NUMA_BOOTSTRAP_ADMIN_PASSWORD est obligatoire}"

mkdir -p /opt/keycloak/data/import
sed \
  -e "s|__NUMA_PUBLIC_URL__|${NUMA_PUBLIC_URL}|g" \
  -e "s|__NUMA_BOOTSTRAP_ADMIN_USERNAME__|${NUMA_BOOTSTRAP_ADMIN_USERNAME}|g" \
  -e "s|__NUMA_BOOTSTRAP_ADMIN_PASSWORD__|${NUMA_BOOTSTRAP_ADMIN_PASSWORD}|g" \
  /opt/keycloak/numa/numa-realm.template.json > /opt/keycloak/data/import/numa-realm.json

exec /opt/keycloak/bin/kc.sh start --import-realm
