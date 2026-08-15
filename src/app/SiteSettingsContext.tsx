import { createContext, type ReactNode, useContext, useEffect, useMemo, useState } from 'react'
import type { NumberingSettings, SiteBrandingSettings } from '../types/ui'

const STORAGE_KEY = 'numa.site-settings.v1'

export const defaultBrandingSettings: SiteBrandingSettings = {
  organizationName: 'ORGATECH',
  applicationName: 'NUMA',
  logoDataUrl: null,
  logoFileName: null,
  logoMimeType: null,
}

export const defaultNumberingSettings: NumberingSettings = {
  format: '{SERVICE}/{SEQUENCE:0000}/{ANNEE}',
  counterScope: 'service-year',
  resetPeriod: 'yearly',
  sharedAcrossRegistries: true,
  assignmentTrigger: 'submission',
  cancelledNumberPolicy: 'keep',
  nextSequence: 53,
}

type SiteSettingsState = {
  branding: SiteBrandingSettings
  numbering: NumberingSettings
}

type SiteSettingsContextValue = SiteSettingsState & {
  saveBranding: (settings: SiteBrandingSettings) => void
  resetLogo: () => void
  updateNumbering: (settings: NumberingSettings) => void
}

const defaultState: SiteSettingsState = {
  branding: defaultBrandingSettings,
  numbering: defaultNumberingSettings,
}

const SiteSettingsContext = createContext<SiteSettingsContextValue | null>(null)

function loadSettings(): SiteSettingsState {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY)
    if (!stored) return defaultState
    const parsed = JSON.parse(stored) as Partial<SiteSettingsState>
    return {
      branding: { ...defaultBrandingSettings, ...parsed.branding },
      numbering: { ...defaultNumberingSettings, ...parsed.numbering },
    }
  } catch {
    return defaultState
  }
}

export function SiteSettingsProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<SiteSettingsState>(loadSettings)

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  }, [state])

  const value = useMemo<SiteSettingsContextValue>(() => ({
    ...state,
    saveBranding: (branding) => setState((current) => ({ ...current, branding })),
    resetLogo: () => setState((current) => ({
      ...current,
      branding: {
        ...current.branding,
        logoDataUrl: null,
        logoFileName: null,
        logoMimeType: null,
      },
    })),
    updateNumbering: (numbering) => setState((current) => ({ ...current, numbering })),
  }), [state])

  return <SiteSettingsContext.Provider value={value}>{children}</SiteSettingsContext.Provider>
}

export function useSiteSettings() {
  const context = useContext(SiteSettingsContext)
  if (!context) throw new Error('useSiteSettings doit être utilisé dans SiteSettingsProvider')
  return context
}

const knownVariables = new Set(['ANNEE', 'MOIS', 'JOUR', 'LISTE', 'TYPE', 'DIRECTION', 'SERVICE', 'SITE', 'UTILISATEUR'])

export function validateNumberingFormat(format: string) {
  const errors: string[] = []
  if (!/\{SEQUENCE(?::0+)?\}/.test(format)) errors.push('Le format doit contenir la variable {SEQUENCE}.')
  const variables = format.match(/\{[^}]+\}/g) ?? []
  variables.forEach((variable) => {
    const name = variable.slice(1, -1)
    if (!/^SEQUENCE(?::0+)?$/.test(name) && !knownVariables.has(name) && !name.startsWith('CHAMP:')) {
      errors.push(`Variable inconnue : ${variable}`)
    }
  })
  if (format.includes('{') !== format.includes('}')) errors.push('Une accolade du format est incomplète.')
  return [...new Set(errors)]
}

export function formatCorrespondenceReference(
  settings: NumberingSettings,
  serviceCode: string,
  options: { year?: number; sequence?: number; direction?: string; type?: string; list?: string } = {},
) {
  const year = options.year ?? 2026
  const sequence = options.sequence ?? settings.nextSequence
  return settings.format
    .replace(/\{SEQUENCE(?::(0+))?\}/g, (_, padding: string | undefined) => String(sequence).padStart(padding?.length ?? 1, '0'))
    .replaceAll('{ANNEE}', String(year))
    .replaceAll('{MOIS}', '08')
    .replaceAll('{JOUR}', '15')
    .replaceAll('{SERVICE}', serviceCode)
    .replaceAll('{DIRECTION}', options.direction ?? 'DT')
    .replaceAll('{TYPE}', options.type ?? 'COURRIER')
    .replaceAll('{LISTE}', options.list ?? 'COURRIERS')
    .replaceAll('{SITE}', 'SIEGE')
    .replaceAll('{UTILISATEUR}', 'KY')
}
