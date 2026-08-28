import { NUMA_RUNTIME_CONFIG } from '../config/runtime'

let accessToken: string | null = null

export const API_URL = NUMA_RUNTIME_CONFIG.apiUrl.replace(/\/$/, '')
export const API_DATA_ENABLED = NUMA_RUNTIME_CONFIG.dataMode === 'api'

export function setApiAccessToken(token: string | null) {
  accessToken = token
}

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public errors?: unknown,
    public requestId?: string,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

type ApiProblem = { code?: string; detail?: string; errors?: unknown }

function requestHeaders(init: RequestInit) {
  const headers = new Headers(init.headers)
  if (accessToken) headers.set('Authorization', `Bearer ${accessToken}`)
  if (init.body && !(init.body instanceof FormData)) headers.set('Content-Type', 'application/json')
  if (!headers.has('Accept')) headers.set('Accept', 'application/json')
  return headers
}

async function checkedResponse(path: string, init: RequestInit = {}) {
  const response = await fetch(`${API_URL}${path}`, { ...init, headers: requestHeaders(init) })
  if (!response.ok) {
    const problem = await response.json().catch(() => ({})) as ApiProblem
    throw new ApiError(
      response.status,
      problem.code ?? 'request_error',
      problem.detail ?? `Erreur HTTP ${response.status}`,
      problem.errors,
      response.headers.get('X-Request-ID') ?? undefined,
    )
  }
  return response
}

export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await checkedResponse(path, init)
  return response.status === 204 ? undefined as T : response.json() as Promise<T>
}

export async function apiFetchWithMeta<T>(path: string, init: RequestInit = {}) {
  const response = await checkedResponse(path, init)
  const data = response.status === 204 ? undefined as T : await response.json() as T
  return {
    data,
    etag: response.headers.get('ETag'),
    requestId: response.headers.get('X-Request-ID'),
  }
}

export async function apiFetchBlob(path: string, init: RequestInit = {}) {
  const response = await checkedResponse(path, { ...init, headers: new Headers(init.headers) })
  return {
    blob: await response.blob(),
    filename: parseContentDispositionFilename(response.headers.get('Content-Disposition')),
    contentType: response.headers.get('Content-Type') ?? 'application/octet-stream',
  }
}

function parseContentDispositionFilename(value: string | null) {
  if (!value) return null
  const encoded = value.match(/filename\*=UTF-8''([^;]+)/i)?.[1]
  if (encoded) return decodeURIComponent(encoded)
  return value.match(/filename="?([^";]+)"?/i)?.[1] ?? null
}

export function ifMatch(etag: string | number) {
  const value = String(etag)
  return { 'If-Match': value.startsWith('"') || value.startsWith('W/') ? value : `"${value}"` }
}
