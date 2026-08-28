/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_DATA_MODE?: 'demo' | 'api'
  readonly VITE_AUTH_MODE?: 'demo' | 'oidc'
  readonly VITE_API_URL?: string
  readonly VITE_OIDC_AUTHORITY?: string
  readonly VITE_OIDC_CLIENT_ID?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

interface Window {
  readonly __NUMA_CONFIG__?: import('./config/runtime').NumaRuntimeConfig
}
