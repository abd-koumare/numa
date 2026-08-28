#!/bin/sh
set -eu

data_mode="${NUMA_DATA_MODE:-api}"
auth_mode="${NUMA_AUTH_MODE:-oidc}"
environment="${NUMA_ENVIRONMENT:-development}"
api_url="${NUMA_API_URL:-/api/v1}"
oidc_authority="${NUMA_OIDC_AUTHORITY:-}"
oidc_client_id="${NUMA_OIDC_CLIENT_ID:-${OIDC_WEB_CLIENT_ID:-numa-web}}"

if [ -z "$oidc_authority" ] && [ -n "${NUMA_PUBLIC_URL:-}" ]; then
  oidc_authority="${NUMA_PUBLIC_URL%/}/auth/realms/numa"
fi

case "$data_mode" in demo|api) ;; *) printf 'NUMA_DATA_MODE invalide\n' >&2; exit 1 ;; esac
case "$auth_mode" in demo|oidc) ;; *) printf 'NUMA_AUTH_MODE invalide\n' >&2; exit 1 ;; esac
if [ "$environment" = "production" ] && { [ "$data_mode" != "api" ] || [ "$auth_mode" != "oidc" ]; }; then
  printf 'Le mode production exige NUMA_DATA_MODE=api et NUMA_AUTH_MODE=oidc\n' >&2
  exit 1
fi
case "$api_url" in /*|http://*|https://*) ;; *) printf 'NUMA_API_URL invalide\n' >&2; exit 1 ;; esac
if [ "$auth_mode" = "oidc" ]; then
  case "$oidc_authority" in http://*|https://*) ;; *) printf 'NUMA_OIDC_AUTHORITY est obligatoire en mode OIDC\n' >&2; exit 1 ;; esac
fi

for value in "$api_url" "$oidc_authority" "$oidc_client_id"; do
  if printf '%s' "$value" | grep -q '["\\[:cntrl:]]'; then
    printf 'La configuration frontend contient un caractère interdit\n' >&2
    exit 1
  fi
done

umask 022
tmp_file="/usr/share/nginx/html/runtime-config.js.tmp"
{
  printf 'window.__NUMA_CONFIG__ = {\n'
  printf '  apiUrl: "%s",\n' "$api_url"
  printf '  dataMode: "%s",\n' "$data_mode"
  printf '  authMode: "%s",\n' "$auth_mode"
  printf '  oidcAuthority: "%s",\n' "$oidc_authority"
  printf '  oidcClientId: "%s"\n' "$oidc_client_id"
  printf '};\n'
} > "$tmp_file"
mv "$tmp_file" /usr/share/nginx/html/runtime-config.js
