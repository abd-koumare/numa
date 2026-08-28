import { useCallback, useEffect, useMemo, useState } from 'react'
import type { Correspondence } from '../types/ui'
import { API_DATA_ENABLED, apiFetch, apiFetchBlob, ifMatch } from './client'

export type ApiDocumentVersion = {
  id: string
  document_id: string | null
  version: number
  filename: string
  mime_type: string
  detected_mime_type: string
  size: number
  sha256: string
  scan_status: 'pending' | 'clean' | 'infected' | 'error'
  scan_status_label: string
  extraction_status: 'pending' | 'complete' | 'unsupported' | 'error'
  extraction_status_label: string
  author: string
  created_at: string
  download_url: string | null
}

export type ApiDocument = {
  id: string
  title: string
  kind: string
  active_version_number: number
  created_at: string
  updated_at: string
  versions: ApiDocumentVersion[]
}

export type ApiWorkflowEvent = {
  id: string
  event: string
  from_status: string
  to_status: string
  actor: string
  comment: string
  metadata: Record<string, unknown>
  created_at: string
}

export type ApiSignatureProof = {
  id: string
  document_version_id: string
  level: 'electronic-validation' | 'graphic' | 'digital'
  status: 'requested' | 'verified' | 'failed' | 'cancelled'
  signer: string
  signer_role: string
  document_hash: string
  evidence: Record<string, unknown>
  ip_address: string | null
  signed_at: string | null
  created_at: string
}

export type ApiCorrespondence = {
  id: string
  reference: string | null
  registry: 'internal' | 'external'
  sender: string
  origin_reference: string
  received_at: string
  channel: 'email' | 'paper' | 'portal' | 'hand'
  subject: string
  direction_code: string
  responsible_service_code: string
  priority: 'low' | 'normal' | 'high' | 'urgent'
  priority_label: Correspondence['priority']
  confidentiality: 'standard' | 'restricted' | 'confidential'
  confidentiality_label: Correspondence['confidentiality']
  status: 'draft' | 'registered' | 'to_process' | 'in_validation' | 'validated' | 'rejected' | 'cancelled' | 'signed' | 'archived'
  status_label: Correspondence['status']
  due_at: string | null
  summary: string
  custom_data: Record<string, unknown>
  configuration_version_id: string | null
  attachment_count: number
  documents: ApiDocumentVersion[]
  files: ApiDocument[]
  workflow_events: ApiWorkflowEvent[]
  signature_proofs: ApiSignatureProof[]
  created_by: { id: number; name: string }
  row_version: number
  etag: string
  created_at: string
  updated_at: string
  archived_at: string | null
  reopened_at: string | null
}

export type Paginated<T> = { count: number; next: string | null; previous: string | null; results: T[] }

export type CorrespondenceQuery = {
  page?: number
  pageSize?: number
  search?: string
  ordering?: string
  status?: string
  priority?: string
  confidentiality?: string
  direction?: string
  service?: string
  statuses?: string
  mine?: boolean
  receivedFrom?: string
  receivedTo?: string
}

export function mapCorrespondence(item: ApiCorrespondence): Correspondence {
  return {
    id: item.id,
    reference: item.reference ?? 'Brouillon',
    receivedAt: item.received_at,
    subject: item.subject,
    sender: item.sender,
    direction: item.direction_code,
    priority: item.priority_label,
    status: item.status_label,
    confidentiality: item.confidentiality_label,
    attachmentCount: item.attachment_count,
  }
}

function correspondenceSearchParams(registry: 'internal' | 'external', query: CorrespondenceQuery) {
  const parameters = new URLSearchParams({
    registry,
    page: String(query.page ?? 1),
    page_size: String(query.pageSize ?? 25),
    ordering: query.ordering ?? '-received_at',
  })
  if (query.search) parameters.set('search', query.search)
  if (query.status) parameters.set('status', query.status)
  if (query.priority) parameters.set('priority', query.priority)
  if (query.confidentiality) parameters.set('confidentiality', query.confidentiality)
  if (query.direction) parameters.set('direction__code', query.direction)
  if (query.service) parameters.set('responsible_service__code', query.service)
  if (query.statuses) parameters.set('statuses', query.statuses)
  if (query.mine) parameters.set('mine', 'true')
  if (query.receivedFrom) parameters.set('received_from', query.receivedFrom)
  if (query.receivedTo) parameters.set('received_to', query.receivedTo)
  return parameters
}

export function useCorrespondences(
  registry: 'internal' | 'external',
  fallback: Correspondence[],
  initialQuery: CorrespondenceQuery = {},
) {
  const [items, setItems] = useState(fallback)
  const [apiItems, setApiItems] = useState<ApiCorrespondence[]>([])
  const [count, setCount] = useState(fallback.length)
  const [query, setQuery] = useState<CorrespondenceQuery>({ page: 1, pageSize: 25, ordering: '-received_at', ...initialQuery })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(API_DATA_ENABLED)
  const [revision, setRevision] = useState(0)
  const parameters = useMemo(() => correspondenceSearchParams(registry, query).toString(), [registry, query])
  const reload = useCallback(() => setRevision((current) => current + 1), [])

  useEffect(() => {
    if (!API_DATA_ENABLED) return
    const controller = new AbortController()
    setLoading(true)
    apiFetch<Paginated<ApiCorrespondence>>(`/correspondences/?${parameters}`, { signal: controller.signal })
      .then((response) => {
        setApiItems(response.results)
        setItems(response.results.map(mapCorrespondence))
        setCount(response.count)
        setError('')
      })
      .catch((reason: unknown) => {
        if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : 'Chargement impossible')
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })
    return () => controller.abort()
  }, [parameters, revision])

  return { items, apiItems, count, query, setQuery, error, loading, reload }
}

export function useCorrespondence(id: string, fallback: Correspondence) {
  const [item, setItem] = useState(fallback)
  const [apiItem, setApiItem] = useState<ApiCorrespondence | null>(null)
  const [loading, setLoading] = useState(API_DATA_ENABLED)
  const [error, setError] = useState('')
  const [revision, setRevision] = useState(0)
  const reload = useCallback(() => setRevision((current) => current + 1), [])
  useEffect(() => {
    if (!API_DATA_ENABLED) return
    const controller = new AbortController()
    setLoading(true)
    apiFetch<ApiCorrespondence>(`/correspondences/${id}/`, { signal: controller.signal })
      .then((response) => {
        setApiItem(response)
        setItem(mapCorrespondence(response))
        setError('')
      })
      .catch((reason: unknown) => {
        if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : 'Chargement impossible')
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })
    return () => controller.abort()
  }, [id, revision])
  return { item, apiItem, loading, error, reload }
}

export type CorrespondenceDraft = {
  registry: 'internal' | 'external'
  sender: string
  origin_reference: string
  received_at: string
  channel: string
  subject: string
  direction_code: string
  responsible_service_code: string
  priority: string
  confidentiality: string
  due_at: string | null
  summary: string
  custom_data?: Record<string, unknown>
}

export async function getCorrespondence(id: string) {
  return apiFetch<ApiCorrespondence>(`/correspondences/${id}/`)
}

export async function saveCorrespondenceDraft(data: CorrespondenceDraft, id?: string, etag?: string | number) {
  if (id && etag === undefined) throw new Error('La version du courrier est nécessaire pour enregistrer les modifications.')
  return apiFetch<ApiCorrespondence>(id ? `/correspondences/${id}/` : '/correspondences/', {
    method: id ? 'PATCH' : 'POST',
    headers: id ? ifMatch(etag as string | number) : undefined,
    body: JSON.stringify(data),
  })
}

export type DocumentUploadResponse = {
  document: ApiDocumentVersion
  row_version: number
  etag: string
}

export async function uploadCorrespondenceDocument(
  id: string,
  file: File,
  etag: string | number,
  options: { documentId?: string; title?: string; kind?: string } = {},
) {
  const body = new FormData()
  body.append('file', file)
  if (options.documentId) body.append('document_id', options.documentId)
  if (options.title) body.append('title', options.title)
  if (options.kind) body.append('kind', options.kind)
  return apiFetch<DocumentUploadResponse>(`/correspondences/${id}/documents/`, {
    method: 'POST',
    headers: ifMatch(etag),
    body,
  })
}

export async function waitForCleanDocuments(id: string, signal?: AbortSignal) {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const item = await apiFetch<ApiCorrespondence>(`/correspondences/${id}/`, { signal })
    const documents = item.documents ?? []
    if (documents.length && documents.every((document) => document.scan_status === 'clean')) return item
    if (documents.some((document) => ['infected', 'error'].includes(document.scan_status))) {
      throw new Error('Un document a été refusé par le contrôle antivirus.')
    }
    await new Promise((resolve) => window.setTimeout(resolve, 1000))
  }
  throw new Error('Le contrôle antivirus prend plus de temps que prévu. Le brouillon a été conservé.')
}

export async function transitionCorrespondence(
  id: string,
  action: 'submit' | 'validate' | 'reject' | 'cancel' | 'reopen' | 'archive',
  etag: string | number,
  comment = '',
) {
  return apiFetch<ApiCorrespondence>(`/correspondences/${id}/${action}/`, {
    method: 'POST',
    headers: ifMatch(etag),
    body: JSON.stringify({ comment }),
  })
}

export async function submitCorrespondence(id: string) {
  const latest = await waitForCleanDocuments(id)
  return transitionCorrespondence(id, 'submit', latest.etag || latest.row_version)
}

export async function signCorrespondence(
  id: string,
  etag: string | number,
  request: { documentVersionId: string; level: 'electronic-validation' | 'graphic'; graphicMark?: string },
) {
  return apiFetch<ApiCorrespondence>(`/correspondences/${id}/sign/`, {
    method: 'POST',
    headers: ifMatch(etag),
    body: JSON.stringify({
      document_version_id: request.documentVersionId,
      level: request.level,
      graphic_mark: request.graphicMark ?? '',
    }),
  })
}

export async function downloadCorrespondenceDocument(path: string, fallbackFilename: string) {
  const response = await apiFetchBlob(path)
  const url = URL.createObjectURL(response.blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = response.filename ?? fallbackFilename
  anchor.click()
  URL.revokeObjectURL(url)
}
