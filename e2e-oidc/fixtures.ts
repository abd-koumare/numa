import { expect, type APIRequestContext } from '@playwright/test'

export const root = 'http://localhost:8000/api/v1'
export type Definition = { id: string; kind: string; slug: string; name: string; current_version: { id: string; data: any; version: number } | null; latest_version: { id: string; version: number; state: string; data: any } }
export function api(request: APIRequestContext, token: string) {
  const headers = { Authorization: `Bearer ${token}` }
  return {
    get: async (path: string) => { const response = await request.get(`${root}/${path}`, { headers }); expect(response.ok(), `${path}: ${await response.text()}`).toBeTruthy(); return response.json() },
    post: async (path: string, data: unknown, version?: number) => { const response = await request.post(`${root}/${path}`, { headers: { ...headers, ...(version !== undefined ? { 'If-Match': `"${version}"` } : {}) }, data }); expect(response.ok(), `${path}: ${await response.text()}`).toBeTruthy(); return response.json() },
    patch: async (path: string, data: unknown, version: number) => { const response = await request.patch(`${root}/${path}`, { headers: { ...headers, 'If-Match': `"${version}"` }, data }); expect(response.ok(), `${path}: ${await response.text()}`).toBeTruthy(); return response.json() },
    headers,
  }
}
export async function publish(client: ReturnType<typeof api>, definition: Definition) {
  return client.post(`configurations/${definition.id}/publish/`, {}, definition.latest_version.version) as Promise<Definition>
}
export async function create(client: ReturnType<typeof api>, kind: string, slug: string, data: unknown) {
  return client.post('configurations/', { kind, slug, name: `Recette ${slug}`, data }) as Promise<Definition>
}
export function letterPdf() {
  const text = 'BT /F1 12 Tf 72 720 Td (NUMA connected acceptance test) Tj ET'
  const objects = ['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R] /Count 1 >>', '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>', '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>', `<< /Length ${text.length} >>\nstream\n${text}\nendstream`]
  let pdf = '%PDF-1.4\n'; const offsets = [0]
  objects.forEach((object, i) => { offsets.push(Buffer.byteLength(pdf)); pdf += `${i + 1} 0 obj\n${object}\nendobj\n` })
  const xref = Buffer.byteLength(pdf)
  pdf += `xref\n0 6\n0000000000 65535 f \n${offsets.slice(1).map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`
  return Buffer.from(pdf)
}
export const draftData = (subject: string) => ({ registry: 'external', sender: 'Recette NUMA', origin_reference: '', received_at: new Date().toISOString().slice(0, 10), channel: 'paper', subject, direction_code: 'DT', responsible_service_code: 'DSI', priority: 'normal', confidentiality: 'standard', summary: 'Donnée de recette connectée' })

export async function attachCleanDocument(request: APIRequestContext, client: ReturnType<typeof api>, item: any) {
  const upload = await request.post(`${root}/correspondences/${item.id}/documents/`, {
    headers: { ...client.headers, 'If-Match': `"${item.row_version}"` },
    multipart: { file: { name: 'recette.pdf', mimeType: 'application/pdf', buffer: letterPdf() } },
  })
  expect(upload.ok(), await upload.text()).toBeTruthy()
  await expect.poll(async () => {
    item = await client.get(`correspondences/${item.id}/`)
    return item.documents[0]?.scan_status
  }, { timeout: 100_000, intervals: [1000, 2000, 4000] }).toBe('clean')
  return item
}
