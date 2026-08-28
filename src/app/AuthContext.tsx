import { createContext, type ReactNode, useContext, useEffect, useMemo, useState } from 'react'
import { AuthProvider as OidcProvider, useAuth as useOidcAuth } from 'react-oidc-context'
import { currentUser } from '../data/dashboard'
import type { SessionUser, UserRole } from '../types/ui'
import { setApiAccessToken } from '../api/client'
import { apiFetch } from '../api/client'
import { NUMA_RUNTIME_CONFIG } from '../config/runtime'

export const AUTH_STORAGE_KEY = 'numa.auth.session.v1'
export const DEMO_MFA_CODE = '123456'
export const AUTH_MODE = NUMA_RUNTIME_CONFIG.authMode === 'oidc' ? 'oidc' : 'demo'

type AuthSession = {
  user: SessionUser
  authenticatedAt: string
}

type StoredAuthSession = {
  version: 1
  authenticatedAt: string
}

type AuthContextValue = {
  session: AuthSession | null
  isAuthenticated: boolean
  isLoading: boolean
  mode: 'demo' | 'oidc'
  login: () => void
  verifyMfa: (code: string) => boolean
  logout: () => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function serializeDemoAuthSession(authenticatedAt = new Date().toISOString()) {
  return JSON.stringify({ version: 1, authenticatedAt } satisfies StoredAuthSession)
}

function readStoredSession(): AuthSession | null {
  try {
    const rawSession = window.localStorage.getItem(AUTH_STORAGE_KEY)
    if (!rawSession) return null
    const storedSession = JSON.parse(rawSession) as Partial<StoredAuthSession>
    if (storedSession.version !== 1 || typeof storedSession.authenticatedAt !== 'string') {
      window.localStorage.removeItem(AUTH_STORAGE_KEY)
      return null
    }
    return { user: currentUser, authenticatedAt: storedSession.authenticatedAt }
  } catch {
    window.localStorage.removeItem(AUTH_STORAGE_KEY)
    return null
  }
}

export function sanitizeReturnTo(value: string | null) {
  if (!value || !value.startsWith('/') || value.startsWith('//') || value.includes('://')) return '/'
  const pathname = value.split(/[?#]/, 1)[0]
  if (['/connexion', '/mfa', '/acces-refuse', '/session-expiree'].includes(pathname)) return '/'
  return value
}

export function restoreOidcReturnTo(state: unknown) {
  const candidate = typeof state === 'object' && state !== null && 'returnTo' in state
    ? (state as { returnTo?: unknown }).returnTo
    : null
  const returnTo = sanitizeReturnTo(typeof candidate === 'string' ? candidate : null)
  window.history.replaceState({}, document.title, returnTo)
  window.dispatchEvent(new PopStateEvent('popstate'))
}

function DemoAuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<AuthSession | null>(readStoredSession)
  const value = useMemo<AuthContextValue>(() => ({
    session,
    isAuthenticated: Boolean(session),
    isLoading: false,
    mode: 'demo',
    login: () => {
      window.localStorage.removeItem(AUTH_STORAGE_KEY)
      setSession(null)
    },
    verifyMfa: (code: string) => {
      if (code !== DEMO_MFA_CODE) return false
      const authenticatedAt = new Date().toISOString()
      window.localStorage.setItem(AUTH_STORAGE_KEY, serializeDemoAuthSession(authenticatedAt))
      setSession({ user: currentUser, authenticatedAt })
      return true
    },
    logout: () => {
      window.localStorage.removeItem(AUTH_STORAGE_KEY)
      setSession(null)
    },
  }), [session])
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

const roleLabels: Record<UserRole, string> = {
  'super-admin': 'Super administrateur', admin: 'Administrateur', configurateur: 'Configurateur',
  gestionnaire: 'Gestionnaire', validateur: 'Validateur', utilisateur: 'Utilisateur',
  lecteur: 'Lecteur', auditeur: 'Auditeur',
}
const knownRoles = Object.keys(roleLabels) as UserRole[]

function OidcAuthBridge({ children }: { children: ReactNode }) {
  const oidc = useOidcAuth()
  const [apiIdentity, setApiIdentity] = useState<{
    first_name: string
    last_name: string
    roles: string[]
    capabilities: string[]
    access_pending: boolean
    organization_unit: { name: string } | null
  } | null>(null)
  const [identityLoading, setIdentityLoading] = useState(false)
  useEffect(() => {
    const token = oidc.user?.access_token ?? null
    setApiAccessToken(token)
    if (!token) {
      setApiIdentity(null)
      setIdentityLoading(false)
      return
    }
    let active = true
    setIdentityLoading(true)
    apiFetch<{
      first_name: string
      last_name: string
      roles: string[]
      capabilities: string[]
      access_pending: boolean
      organization_unit: { name: string } | null
    }>('/me/')
      .then((identity) => { if (active) setApiIdentity(identity) })
      .catch(() => { if (active) setApiIdentity(null) })
      .finally(() => { if (active) setIdentityLoading(false) })
    return () => { active = false }
  }, [oidc.user?.access_token])
  const profile = oidc.user?.profile
  const tokenRoles = (profile?.realm_access as { roles?: string[] } | undefined)?.roles ?? []
  const effectiveRoles = apiIdentity?.roles ?? tokenRoles
  const role = knownRoles.find((item) => effectiveRoles.includes(item)) ?? 'utilisateur'
  const apiName = `${apiIdentity?.first_name ?? ''} ${apiIdentity?.last_name ?? ''}`.trim()
  const name = apiName || String(profile?.name ?? profile?.preferred_username ?? 'Utilisateur NUMA')
  const initials = name.split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase()
  const session = oidc.user ? {
    user: {
      name,
      initials,
      role,
      roleLabel: roleLabels[role],
      organization: apiIdentity?.organization_unit?.name ?? 'NUMA',
      capabilities: apiIdentity?.capabilities ?? [],
      accessPending: apiIdentity?.access_pending ?? false,
    },
    authenticatedAt: new Date(oidc.user.expires_at ? oidc.user.expires_at * 1000 : Date.now()).toISOString(),
  } satisfies AuthSession : null
  const value: AuthContextValue = {
    session,
    isAuthenticated: oidc.isAuthenticated,
    isLoading: oidc.isLoading || identityLoading,
    mode: 'oidc',
    login: () => {
      const returnTo = sanitizeReturnTo(new URLSearchParams(window.location.search).get('returnTo'))
      void oidc.signinRedirect({ state: { returnTo } })
    },
    verifyMfa: () => false,
    logout: () => { void oidc.signoutRedirect({ post_logout_redirect_uri: window.location.origin }) },
  }
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function AuthProvider({ children }: { children: ReactNode }) {
  if (AUTH_MODE === 'demo') return <DemoAuthProvider>{children}</DemoAuthProvider>
  return (
    <OidcProvider
      authority={NUMA_RUNTIME_CONFIG.oidcAuthority}
      client_id={NUMA_RUNTIME_CONFIG.oidcClientId}
      redirect_uri={window.location.origin}
      post_logout_redirect_uri={window.location.origin}
      response_type="code"
      scope="openid profile email"
      automaticSilentRenew
      onSigninCallback={(user) => {
        restoreOidcReturnTo(user?.state)
      }}
    >
      <OidcAuthBridge>{children}</OidcAuthBridge>
    </OidcProvider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used within an AuthProvider')
  return context
}
