export type NumaRuntimeConfig = {
  apiUrl?: string
  dataMode?: 'demo' | 'api'
  authMode?: 'demo' | 'oidc'
  oidcAuthority?: string
  oidcClientId?: string
}

const runtimeConfig = window.__NUMA_CONFIG__ ?? {}

export const NUMA_RUNTIME_CONFIG = {
  apiUrl: runtimeConfig.apiUrl ?? import.meta.env.VITE_API_URL ?? '/api/v1',
  dataMode: runtimeConfig.dataMode ?? import.meta.env.VITE_DATA_MODE ?? 'demo',
  authMode: runtimeConfig.authMode ?? import.meta.env.VITE_AUTH_MODE ?? 'demo',
  oidcAuthority: runtimeConfig.oidcAuthority ?? import.meta.env.VITE_OIDC_AUTHORITY ?? 'http://localhost:8080/realms/numa',
  oidcClientId: runtimeConfig.oidcClientId ?? import.meta.env.VITE_OIDC_CLIENT_ID ?? 'numa-web',
} as const
