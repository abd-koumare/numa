import { createContext, type ReactNode, useContext, useEffect, useMemo, useState } from 'react'
import { API_DATA_ENABLED, apiFetch, apiFetchWithMeta, ifMatch } from '../api/client'
import type { NumberingSettings, SiteBrandingSettings } from '../types/ui'

const STORAGE_KEY = 'numa.site-settings.v1'

export const defaultBrandingSettings: SiteBrandingSettings = {
  organizationName: 'ORGATECH', applicationName: 'NUMA', logoDataUrl: null, logoFileName: null,
  logoMimeType: null, faviconDataUrl: null, primaryColor: '#123E7C', accentColor: '#20C4C7',
  bannerUrl: '', fontFamily: 'NUMA', footerText: 'Tous droits réservés à Koogin SAS', defaultHome: 'dashboard',
}

export const defaultNumberingSettings: NumberingSettings = {
  format: '{SERVICE}/{SEQUENCE:0000}/{ANNEE}', counterScope: 'service-year', resetPeriod: 'yearly',
  sharedAcrossRegistries: true, assignmentTrigger: 'submission', cancelledNumberPolicy: 'keep', nextSequence: 53,
}

type SiteSettingsState = { branding: SiteBrandingSettings; numbering: NumberingSettings }
type SiteSettingsContextValue = SiteSettingsState & {
  loading: boolean
  saveBranding: (settings: SiteBrandingSettings) => Promise<void>
  resetLogo: () => Promise<void>
  updateNumbering: (settings: NumberingSettings) => Promise<void>
}

type PublicConfiguration = {
  organization: {
    name: string; application_name: string; primary_color: string; accent_color: string
    logo_data_url: string | null; favicon_data_url: string | null; footer_text: string
    default_home: SiteBrandingSettings['defaultHome']; logo_file_name?: string | null
    logo_mime_type?: SiteBrandingSettings['logoMimeType']; banner_url?: string
    font_family?: SiteBrandingSettings['fontFamily']
    home_page_slug?: string
  }
  numbering?: Partial<NumberingSettings>
}

type OrganizationSettingsApi = {
  organization_name: string; application_name: string; primary_color: string; accent_color: string
  logo_data_url: string; favicon_data_url: string; footer_text: string; default_home: string
  settings: Record<string, unknown>; row_version: number
}
type ConfigurationDefinitionApi = { id: string; slug: string; latest_version: { version: number; data: NumberingSettings } | null }

const defaultState: SiteSettingsState = { branding: defaultBrandingSettings, numbering: defaultNumberingSettings }
const SiteSettingsContext = createContext<SiteSettingsContextValue | null>(null)

function loadDemoSettings(): SiteSettingsState {
  if (API_DATA_ENABLED) return defaultState
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY)
    if (!stored) return defaultState
    const parsed = JSON.parse(stored) as Partial<SiteSettingsState>
    return {
      branding: { ...defaultBrandingSettings, ...parsed.branding },
      numbering: { ...defaultNumberingSettings, ...parsed.numbering },
    }
  } catch { return defaultState }
}

function brandingFromPublic(data: PublicConfiguration): SiteBrandingSettings {
  const organization = data.organization
  return {
    organizationName: organization.name, applicationName: organization.application_name,
    logoDataUrl: organization.logo_data_url, logoFileName: organization.logo_file_name ?? null,
    logoMimeType: organization.logo_mime_type ?? null, faviconDataUrl: organization.favicon_data_url,
    primaryColor: organization.primary_color, accentColor: organization.accent_color,
    bannerUrl: organization.banner_url ?? '', fontFamily: organization.font_family ?? 'NUMA',
    footerText: organization.footer_text, defaultHome: organization.default_home,
    homePageSlug: organization.home_page_slug ?? '',
  }
}

export function SiteSettingsProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<SiteSettingsState>(loadDemoSettings)
  const [loading, setLoading] = useState(API_DATA_ENABLED)

  useEffect(() => {
    if (!API_DATA_ENABLED) window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  }, [state])

  useEffect(() => {
    if (!API_DATA_ENABLED) return
    let active = true
    apiFetch<PublicConfiguration>('/public-config/')
      .then((configuration) => {
        if (active) setState({ branding: brandingFromPublic(configuration), numbering: { ...defaultNumberingSettings, ...(configuration.numbering ?? {}) } })
      })
      .catch(() => undefined)
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [])

  useEffect(() => {
    document.title = `${state.branding.applicationName} — ${state.branding.organizationName}`
    document.documentElement.style.setProperty('--numa-primary', state.branding.primaryColor)
    document.documentElement.style.setProperty('--numa-accent', state.branding.accentColor)
    let favicon = document.querySelector<HTMLLinkElement>('link[rel="icon"]')
    if (state.branding.faviconDataUrl) {
      if (!favicon) { favicon = document.createElement('link'); favicon.rel = 'icon'; document.head.appendChild(favicon) }
      favicon.href = state.branding.faviconDataUrl
    }
  }, [state.branding])

  const saveBranding = async (branding: SiteBrandingSettings) => {
    if (API_DATA_ENABLED) {
      const current = await apiFetchWithMeta<OrganizationSettingsApi>('/organization-settings/')
      const existingBranding = (current.data.settings.branding ?? {}) as Record<string, unknown>
      await apiFetch('/organization-settings/', {
        method: 'PATCH', headers: ifMatch(current.etag ?? current.data.row_version),
        body: JSON.stringify({
          organization_name: branding.organizationName, application_name: branding.applicationName,
          primary_color: branding.primaryColor, accent_color: branding.accentColor,
          logo_data_url: branding.logoDataUrl ?? '', favicon_data_url: branding.faviconDataUrl ?? '',
          footer_text: branding.footerText, default_home: branding.defaultHome,
          settings: { ...current.data.settings, branding: { ...existingBranding, logoFileName: branding.logoFileName, logoMimeType: branding.logoMimeType, bannerUrl: branding.bannerUrl, fontFamily: branding.fontFamily, homePageSlug: branding.homePageSlug ?? '' } },
        }),
      })
    }
    setState((current) => ({ ...current, branding }))
  }

  const updateNumbering = async (numbering: NumberingSettings) => {
    if (API_DATA_ENABLED) {
      const page = await apiFetch<{ results: ConfigurationDefinitionApi[] }>('/configurations/?kind=numbering&search=correspondence-numbering')
      const definition = page.results.find((item) => item.slug === 'correspondence-numbering')
      if (!definition?.latest_version) throw new Error('Configuration de numérotation introuvable.')
      const draft = await apiFetch<ConfigurationDefinitionApi>(`/configurations/${definition.id}/`, {
        method: 'PATCH', headers: ifMatch(definition.latest_version.version), body: JSON.stringify({ data: numbering }),
      })
      const draftVersion = draft.latest_version?.version
      if (!draftVersion) throw new Error('Le brouillon de numérotation n’a pas été créé.')
      await apiFetch(`/configurations/${definition.id}/publish/`, { method: 'POST', headers: ifMatch(draftVersion), body: JSON.stringify({}) })
    }
    setState((current) => ({ ...current, numbering }))
  }

  const value = useMemo<SiteSettingsContextValue>(() => ({
    ...state, loading, saveBranding,
    resetLogo: () => saveBranding({ ...state.branding, logoDataUrl: null, logoFileName: null, logoMimeType: null }),
    updateNumbering,
  }), [loading, state])

  return <SiteSettingsContext.Provider value={value}>{children}</SiteSettingsContext.Provider>
}

export function useSiteSettings() {
  const context = useContext(SiteSettingsContext)
  if (!context) throw new Error('useSiteSettings doit être utilisé dans SiteSettingsProvider')
  return context
}

const knownVariables = new Set(['ANNEE', 'MOIS', 'JOUR', 'LISTE', 'TYPE', 'DIRECTION', 'SERVICE', 'SITE', 'UTILISATEUR', 'REGISTRE'])

export function validateNumberingFormat(format: string) {
  const errors: string[] = []
  if (!/\{SEQUENCE(?::0+)?\}/.test(format)) errors.push('Le format doit contenir la variable {SEQUENCE}.')
  for (const variable of format.match(/\{[^}]+\}/g) ?? []) {
    const name = variable.slice(1, -1)
    if (!/^SEQUENCE(?::0+)?$/.test(name) && !knownVariables.has(name) && !name.startsWith('CHAMP:')) errors.push(`Variable inconnue : ${variable}`)
  }
  if (format.includes('{') !== format.includes('}')) errors.push('Une accolade du format est incomplète.')
  return [...new Set(errors)]
}

export function formatCorrespondenceReference(settings: NumberingSettings, serviceCode: string, options: { year?: number; sequence?: number; direction?: string; type?: string; list?: string } = {}) {
  const now = new Date(); const year = options.year ?? now.getFullYear(); const sequence = options.sequence ?? settings.nextSequence
  return settings.format
    .replace(/\{SEQUENCE(?::(0+))?\}/g, (_, padding: string | undefined) => String(sequence).padStart(padding?.length ?? 1, '0'))
    .replaceAll('{ANNEE}', String(year)).replaceAll('{MOIS}', String(now.getMonth() + 1).padStart(2, '0')).replaceAll('{JOUR}', String(now.getDate()).padStart(2, '0'))
    .replaceAll('{SERVICE}', serviceCode).replaceAll('{DIRECTION}', options.direction ?? 'DT').replaceAll('{TYPE}', options.type ?? 'COURRIER')
    .replaceAll('{LISTE}', options.list ?? 'COURRIERS').replaceAll('{REGISTRE}', 'EXT').replaceAll('{SITE}', 'SIEGE').replaceAll('{UTILISATEUR}', 'KY')
}
