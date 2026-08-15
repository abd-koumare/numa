import { createContext, type ReactNode, useContext, useMemo, useState } from 'react'
import { currentUser } from '../data/dashboard'
import type { SessionUser } from '../types/ui'

export const AUTH_STORAGE_KEY = 'numa.auth.session.v1'
export const DEMO_MFA_CODE = '123456'

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

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<AuthSession | null>(readStoredSession)

  const value = useMemo<AuthContextValue>(() => ({
    session,
    isAuthenticated: Boolean(session),
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

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used within an AuthProvider')
  return context
}
