import { useCallback, useEffect, useState } from 'react'
import { API_DATA_ENABLED, apiFetch, apiFetchBlob, apiFetchWithMeta, ifMatch } from './client'
import type { ApiCorrespondence, Paginated } from './correspondences'

export type ApiTask = {
  id: string
  correspondence_id: string
  correspondence_row_version: number
  registry: 'internal' | 'external'
  reference: string | null
  subject: string
  requester: string
  priority: 'low' | 'normal' | 'high' | 'urgent'
  step_key: string
  label: string
  kind: 'processing' | 'validation' | 'signature'
  kind_label: string
  status: 'todo' | 'in_progress' | 'completed' | 'rejected' | 'cancelled'
  status_label: string
  assignee_id: number | null
  assignee_group_id: string | null
  assignee_name: string
  due_at: string | null
  comment: string
  created_at: string
  completed_at: string | null
}

export type ApiActivity = {
  id: string
  event: string
  reference: string | null
  correspondence_id: string
  registry: 'internal' | 'external'
  subject: string
  actor: string
  from_status: string
  to_status: string
  comment: string
  metadata: Record<string, unknown>
  created_at: string
}

export type DashboardData = {
  period: DashboardPeriod
  metrics: { total: number; to_process: number; in_validation: number; validated: number; overdue: number }
  recent: ApiCorrespondence[]
  tasks: ApiTask[]
  activity: ApiActivity[]
  series: { key: string; label: string; month: string; internal: number; external: number }[]
  registries: { internal: number; external: number }
}

export type DashboardPeriod = '7d' | '4w' | '12m'

export type OperationalStatus = {
  version: string
  database: { status: string; size: number }
  cache: { status: string }
  storage: { status: string }
  workers: { status: string; broker: string }
  counts: { users: number; correspondences: number; documents: number; pending_tasks: number }
  server_time: string
}

export type BackupJob = {
  id: string
  status: 'pending' | 'running' | 'complete' | 'failed'
  destination: 'local' | 's3' | 'both'
  encrypted: boolean
  location: string
  checksum: string
  size: number
  error: string
  created_at: string
  completed_at: string | null
}

export type AuditEvent = {
  id: string
  actor_name: string
  action: string
  resource_type: string
  resource_id: string
  metadata: Record<string, unknown>
  request_id: string
  ip_address: string | null
  event_hash: string
  integrity_valid: boolean
  created_at: string
}

export type WebhookEndpoint = {
  id: string
  name: string
  url: string
  events: string[]
  active: boolean
  created_at: string
  updated_at: string
}

export type IdentityProviderConfiguration = {
  id: string
  alias: string
  display_name: string
  provider: 'oidc' | 'saml' | 'ldap' | 'active_directory'
  enabled: boolean
  config: Record<string, unknown>
  status: 'untested' | 'ready' | 'error'
  last_error: string
  keycloak_resource_id: string
  last_tested_at: string | null
  created_at: string
  updated_at: string
}

export type UserPreference = {
  locale: string
  timezone: string
  default_home: 'dashboard' | 'tasks' | 'correspondence'
  theme: 'system' | 'light' | 'dark'
  page_size: 10 | 25 | 50 | 100
  compact_mode: boolean
  web_notifications: boolean
  email_notifications: boolean
  settings: Record<string, unknown>
  row_version: number
  updated_at: string
}

export type SystemSetting = {
  section: 'general' | 'security' | 'files' | 'notifications' | 'internationalization' | 'search' | 'retention' | 'backups'
  values: Record<string, unknown>
  row_version: number
  created_at: string
  updated_at: string
}

export type ListInstance = {
  id: string
  definition: string
  period_key: string
  label: string
  active: boolean
  status: 'planned' | 'active' | 'reopened' | 'closed' | 'archived'
  configuration_version: string
  registry: 'internal' | 'external' | 'custom'
  item_count: number
  scheduled_open_at: string | null
  opened_at: string | null
  scheduled_close_at: string | null
  closed_at: string | null
  reopened_at: string | null
  archived_at: string | null
  row_version: number
  created_at: string
  updated_at: string
}

function useReloadable<T>(loader: () => Promise<T>, initial: T, dependency = '') {
  const [data, setData] = useState(initial)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [revision, setRevision] = useState(0)
  const reload = useCallback(() => setRevision((value) => value + 1), [])
  useEffect(() => {
    let active = true
    setLoading(true)
    loader().then((value) => { if (active) { setData(value); setError('') } })
      .catch((reason) => { if (active) setError(reason instanceof Error ? reason.message : 'Chargement impossible.') })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [dependency, revision])
  return { data, loading, error, reload }
}

export function useDashboard(period: DashboardPeriod = '12m') {
  return useReloadable(() => apiFetch<DashboardData>(`/dashboard/?period=${period}`), {
    period, metrics: { total: 0, to_process: 0, in_validation: 0, validated: 0, overdue: 0 }, recent: [], tasks: [], activity: [], series: [], registries: { internal: 0, external: 0 },
  }, period)
}

export function useTasks(parameters = '') {
  return useReloadable(() => apiFetch<Paginated<ApiTask>>(`/tasks/?page_size=100${parameters ? `&${parameters}` : ''}`), { count: 0, next: null, previous: null, results: [] })
}

export function useActivity() {
  return useReloadable(() => apiFetch<{ count: number; results: ApiActivity[] }>('/activity/'), { count: 0, results: [] })
}

export async function actOnTask(task: ApiTask, action: 'validate' | 'reject', comment = '') {
  return apiFetch<ApiCorrespondence>(`/tasks/${task.id}/act/`, { method: 'POST', headers: ifMatch(task.correspondence_row_version), body: JSON.stringify({ action, comment }) })
}

export async function assignTask(taskId: string, userId: string, reason: string) {
  return apiFetch<ApiTask>(`/tasks/${taskId}/assign/`, { method: 'POST', body: JSON.stringify({ user_id: userId, reason }) })
}

export async function searchNuma(parameters: URLSearchParams) {
  return apiFetch<{ query: string; count: number; truncated: boolean; results: ApiCorrespondence[] }>(`/search/?${parameters}`)
}

export async function createTransfer(form: FormData) {
  return apiFetch<{ id: string; status: string }>('/transfers/', { method: 'POST', body: form })
}

export async function downloadTransfer(id: string) {
  return apiFetchBlob(`/transfers/${id}/download/`)
}

export function useOperationsStatus() {
  return useReloadable(() => apiFetch<OperationalStatus>('/operations/status/'), null as OperationalStatus | null)
}

export function useBackups() {
  return useReloadable(() => apiFetch<Paginated<BackupJob>>('/backups/?page_size=100'), { count: 0, next: null, previous: null, results: [] })
}

export function useAuditEvents() {
  return useReloadable(() => apiFetch<Paginated<AuditEvent>>('/audit-events/?page_size=100&ordering=-created_at'), { count: 0, next: null, previous: null, results: [] })
}

export function useWebhooks() {
  return useReloadable(() => apiFetch<Paginated<WebhookEndpoint>>('/webhooks/?page_size=100'), { count: 0, next: null, previous: null, results: [] })
}

export function useIdentityProviders() {
  return useReloadable(() => apiFetch<Paginated<IdentityProviderConfiguration>>('/identity/providers/?page_size=100'), { count: 0, next: null, previous: null, results: [] })
}

export function useSystemSettings() {
  const empty = { count: 0, next: null, previous: null, results: [] } as Paginated<SystemSetting>
  return useReloadable(() => API_DATA_ENABLED ? apiFetch<Paginated<SystemSetting>>('/system-settings/?page_size=100') : Promise.resolve(empty), empty)
}

export async function saveSystemSetting(setting: SystemSetting, values: Record<string, unknown>) {
  return apiFetch<SystemSetting>(`/system-settings/${setting.section}/`, {
    method: 'PATCH', headers: ifMatch(setting.row_version), body: JSON.stringify({ values }),
  })
}

export async function getUserPreferences() {
  return apiFetchWithMeta<UserPreference>('/me/preferences/')
}

export async function saveUserPreferences(preferences: UserPreference, patch: Partial<UserPreference>) {
  return apiFetchWithMeta<UserPreference>('/me/preferences/', {
    method: 'PATCH', headers: ifMatch(preferences.row_version), body: JSON.stringify(patch),
  })
}

export function useListInstances(status = '') {
  const empty = { count: 0, next: null, previous: null, results: [] } as Paginated<ListInstance>
  const suffix = status ? `&status=${encodeURIComponent(status)}` : ''
  return useReloadable(() => API_DATA_ENABLED ? apiFetch<Paginated<ListInstance>>(`/list-instances/?page_size=100&ordering=-period_key${suffix}`) : Promise.resolve(empty), empty, status)
}

export async function transitionListInstance(instance: ListInstance, action: 'activate' | 'close' | 'reopen' | 'archive', reason = '') {
  return apiFetch<ListInstance>(`/list-instances/${instance.id}/${action}/`, {
    method: 'POST', headers: ifMatch(instance.row_version), body: JSON.stringify({ reason }),
  })
}

export async function rolloverListInstance(instance: ListInstance, periodKey: string, label: string, scheduledOpenAt?: string) {
  return apiFetch<ListInstance>(`/list-instances/${instance.id}/rollover/`, {
    method: 'POST', headers: ifMatch(instance.row_version),
    body: JSON.stringify({ period_key: periodKey, label, scheduled_open_at: scheduledOpenAt ?? null }),
  })
}

export async function createBackup(destination: BackupJob['destination'] = 'both') {
  return apiFetch<BackupJob>('/backups/', { method: 'POST', body: JSON.stringify({ destination, encrypted: true }) })
}

export async function verifyBackup(id: string) {
  return apiFetch<{ valid: boolean; sha256: string }>(`/backups/${id}/verify/`, { method: 'POST', body: JSON.stringify({}) })
}

export async function createWebhook(payload: { name: string; url: string; events: string[]; secret?: string; active?: boolean }) {
  return apiFetch<WebhookEndpoint>('/webhooks/', { method: 'POST', body: JSON.stringify(payload) })
}

export async function saveIdentityProvider(payload: Partial<IdentityProviderConfiguration> & { alias: string; display_name: string; provider: IdentityProviderConfiguration['provider']; config: Record<string, unknown> }, id?: string) {
  return apiFetch<IdentityProviderConfiguration>(id ? `/identity/providers/${id}/` : '/identity/providers/', { method: id ? 'PATCH' : 'POST', body: JSON.stringify(payload) })
}

export async function testIdentityProvider(id: string) {
  return apiFetch<{ status: string; result: Record<string, unknown> }>(`/identity/providers/${id}/test/`, { method: 'POST', body: JSON.stringify({}) })
}

export async function applyIdentityProvider(id: string) {
  return apiFetch<IdentityProviderConfiguration>(`/identity/providers/${id}/apply/`, { method: 'POST', body: JSON.stringify({}) })
}
