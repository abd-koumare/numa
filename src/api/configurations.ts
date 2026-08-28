import { useCallback, useEffect, useState } from 'react'
import { API_DATA_ENABLED, ApiError, apiFetch, ifMatch } from './client'

export type ConfigurationKind = 'list' | 'form' | 'view' | 'numbering' | 'rule' | 'workflow' | 'page' | 'template' | 'navigation' | 'branding' | 'system' | 'signature_policy'
export type ConfigurationState = 'draft' | 'published' | 'archived'

export type ConfigurationVersion = {
  id: string
  version: number
  state: ConfigurationState
  data: Record<string, unknown>
  validation_errors: { path: string; message: string }[]
  created_at: string
  published_at: string | null
}

export type ConfigurationDefinition = {
  id: string
  kind: ConfigurationKind
  slug: string
  name: string
  description: string
  active: boolean
  current_version: ConfigurationVersion | null
  latest_version: ConfigurationVersion | null
  created_at: string
  updated_at: string
}

type ConfigurationPage = {
  count: number
  next: string | null
  results: ConfigurationDefinition[]
}

export async function listConfigurations(kind?: ConfigurationKind) {
  if (!API_DATA_ENABLED) return []
  const results: ConfigurationDefinition[] = []
  let page = 1
  while (page <= 100) {
    const query = new URLSearchParams({ page: String(page), page_size: '100', ordering: 'name' })
    if (kind) query.set('kind', kind)
    const response = await apiFetch<ConfigurationPage>(`/configurations/?${query}`)
    results.push(...response.results)
    if (!response.next) break
    page += 1
  }
  return results
}

export async function resolveConfiguration(kind: ConfigurationKind, idOrSlug: string) {
  if (!API_DATA_ENABLED) return null
  try {
    const definition = await apiFetch<ConfigurationDefinition>(`/configurations/${encodeURIComponent(idOrSlug)}/`)
    return definition.kind === kind ? definition : null
  } catch (reason) {
    if (!(reason instanceof ApiError) || reason.status !== 404) throw reason
  }
  const definitions = await listConfigurations(kind)
  return definitions.find((item) => item.slug === idOrSlug) ?? null
}

export async function createConfiguration(input: {
  kind: ConfigurationKind
  slug: string
  name: string
  description?: string
  data: Record<string, unknown>
}) {
  return apiFetch<ConfigurationDefinition>('/configurations/', {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export async function createConfigurationDraft(
  definition: ConfigurationDefinition,
  input: { name?: string; description?: string; active?: boolean; data: Record<string, unknown> },
) {
  if (!definition.latest_version) throw new Error('Cette configuration ne possède aucune version.')
  return apiFetch<ConfigurationDefinition>(`/configurations/${definition.id}/`, {
    method: 'PATCH',
    headers: ifMatch(definition.latest_version.version),
    body: JSON.stringify(input),
  })
}

export async function publishConfiguration(definition: ConfigurationDefinition) {
  if (!definition.latest_version) throw new Error('Cette configuration ne possède aucune version à publier.')
  if (definition.latest_version.state === 'published') return definition
  return apiFetch<ConfigurationDefinition>(`/configurations/${definition.id}/publish/`, {
    method: 'POST',
    headers: ifMatch(definition.latest_version.version),
    body: JSON.stringify({}),
  })
}

export async function saveConfiguration(input: {
  kind: ConfigurationKind
  slug: string
  name: string
  description?: string
  data: Record<string, unknown>
  publish?: boolean
}) {
  const definitions = await listConfigurations(input.kind)
  const existing = definitions.find((item) => item.slug === input.slug)
  let definition = existing
    ? await createConfigurationDraft(existing, { name: input.name, description: input.description, data: input.data })
    : await createConfiguration(input)
  if (input.publish) definition = await publishConfiguration(definition)
  return definition
}

export async function configurationVersions(definitionId: string) {
  return apiFetch<ConfigurationVersion[]>(`/configurations/${definitionId}/versions/`)
}

export async function rollbackConfiguration(definition: ConfigurationDefinition, version: number) {
  if (!definition.latest_version) throw new Error('Cette configuration ne possède aucune version.')
  return apiFetch<ConfigurationVersion>(`/configurations/${definition.id}/rollback/`, {
    method: 'POST',
    headers: ifMatch(definition.latest_version.version),
    body: JSON.stringify({ version }),
  })
}

export function useConfigurations(kind: ConfigurationKind) {
  const [data, setData] = useState<ConfigurationDefinition[]>([])
  const [loading, setLoading] = useState(API_DATA_ENABLED)
  const [error, setError] = useState('')
  const reload = useCallback(() => {
    if (!API_DATA_ENABLED) return
    setLoading(true)
    setError('')
    listConfigurations(kind)
      .then(setData)
      .catch((reason) => setError(reason instanceof Error ? reason.message : 'Chargement des configurations impossible.'))
      .finally(() => setLoading(false))
  }, [kind])
  useEffect(reload, [reload])
  return { data, loading, error, reload }
}
