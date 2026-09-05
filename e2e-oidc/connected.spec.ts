import { expect, test, type Page } from '@playwright/test'
import { login } from './helpers'

import { root, api, publish, create, draftData, letterPdf, attachCleanDocument, type Definition } from './fixtures'

async function userToken(page: Page) { return login(page, 'kader') }

test('published pages use real data, preserve drafts and enforce audience permissions', async ({ page, request, browser }) => {
  const token = await login(page); const client = api(request, token)
  const slug = `recette-page-${Date.now()}`
  let definition = await create(client, 'page', slug, { blocks: [
    { type: 'heading', text: 'Titre publié de recette' }, { type: 'metric', source: 'dashboard.metrics' },
    { type: 'chart', source: 'dashboard.series' }, { type: 'list-view', source: 'correspondences.recent' },
    { type: 'button', text: 'Ouvrir les courriers', path: '/courriers' },
  ] })
  expect((await request.get(`${root}/runtime/pages/${slug}/`, { headers: client.headers })).status()).toBe(404)
  definition = await publish(client, definition)
  await page.goto(`/pages/${slug}`)
  await expect(page.getByRole('heading', { name: 'Titre publié de recette' })).toBeVisible()
  await expect(page.getByText('Courriers accessibles', { exact: true })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Ouvrir les courriers' })).toHaveAttribute('href', '/courriers')
  const data = { blocks: [{ type: 'heading', text: 'Titre encore en brouillon' }], audience: ['super-admin'] }
  definition = await client.patch(`configurations/${definition.id}/`, { data }, definition.latest_version.version)
  expect((await client.get(`runtime/pages/${slug}/`)).data.blocks[0].text).toBe('Titre publié de recette')
  definition = await publish(client, definition)
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Titre encore en brouillon' })).toBeVisible()
  const context = await browser.newContext(); const userPage = await context.newPage()
  const tokenUser = await userToken(userPage)
  expect((await request.get(`${root}/runtime/pages/${slug}/`, { headers: { Authorization: `Bearer ${tokenUser}` } })).status()).toBe(403)
  expect((await request.patch(`${root}/organization-settings/`, { headers: { Authorization: `Bearer ${tokenUser}` }, data: { organization_name: 'Interdit' } })).status()).toBe(403)
  expect((await request.get(`${root}/runtime/pages/${slug}/`)).status()).toBe(401)
  await context.close()
  await client.patch(`configurations/${definition.id}/`, { active: false, data }, definition.latest_version.version)
})

test('template creation, duplication, publication, instantiation and DOCX rendering are connected', async ({ page, request }) => {
  const token = await login(page); const client = api(request, token)
  const name = `Modèle recette ${Date.now()}`
  await page.goto('/administration/templates')
  await page.getByRole('button', { name: 'Nouveau template', exact: true }).click()
  await page.getByRole('textbox', { name: 'Nom', exact: true }).fill(name)
  await page.getByRole('button', { name: 'Créer le brouillon', exact: true }).click()
  await expect(page.getByRole('heading', { name, exact: true })).toBeVisible()
  const id = page.url().split('/').pop()!
  await page.getByRole('button', { name: 'Enregistrer et publier' }).click()
  await expect(page.getByText('Template publié.', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Créer depuis ce template', exact: true }).click()
  await page.getByRole('dialog').getByRole('textbox', { name: 'Nom', exact: true }).fill(`Formulaire ${name}`)
  await page.getByRole('button', { name: 'Créer le brouillon', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Field & Form Builder' })).toBeVisible()
  const formId = page.url().split('/').pop()!
  const createdForm = await client.get(`configurations/${formId}/`)
  expect(createdForm.kind).toBe('form'); expect(createdForm.latest_version.state).toBe('draft')
  expect(createdForm.latest_version.data.fields[0].key).toBe('subject')
  await page.goto('/administration/templates')
  const card = page.getByRole('heading', { name, exact: true }).locator('..')
  await card.getByRole('button', { name: 'Dupliquer', exact: true }).click()
  await page.getByRole('button', { name: 'Créer le brouillon', exact: true }).click()
  await expect(page.getByRole('heading', { name: `${name} — copie`, exact: true })).toBeVisible()
  const copied = await client.get(`configurations/${page.url().split('/').pop()}/`)
  expect(copied.latest_version.state).toBe('draft')
  expect(copied.latest_version.data).toEqual((await client.get(`configurations/${id}/`)).current_version.data)
  let document = await create(client, 'template', `recette-doc-${Date.now()}`, { template_type: 'document', format: 'docx', variables: ['subject'], body: 'Objet : {{ subject }}' })
  const notPublished = await request.post(`${root}/configurations/${document.id}/render-document/`, { headers: client.headers, data: { context: { subject: 'Recette' } } })
  expect(notPublished.status()).toBe(400)
  document = await publish(client, document)
  const result = await request.post(`${root}/configurations/${document.id}/render-document/`, { headers: client.headers, data: { context: { subject: 'Recette' } } })
  expect(result.ok()).toBeTruthy(); expect((await result.body()).subarray(0, 2).toString()).toBe('PK')
  expect((await request.post(`${root}/configurations/${document.id}/render-document/`, { headers: client.headers, data: { context: {} } })).status()).toBe(400)
})

test('published forms apply custom fields, calculations and visibility while existing drafts keep their version', async ({ page, request }) => {
  const token = await login(page); const client = api(request, token)
  const all = await client.get('configurations/?kind=form&page_size=100')
  let definition: Definition = all.results.find((item: Definition) => item.slug === 'correspondence-form')
  const original = definition.current_version!.data
  const oldDraft = await client.post('correspondences/', draftData(`Recette ancienne configuration ${Date.now()}`))
  const oldSchema = await client.get(`runtime/forms/courriers-externes/?item=${oldDraft.id}`)
  try {
    definition = await client.patch(`configurations/${definition.id}/`, { data: { ...original, fields: [...original.fields,
      { key: 'quantity', label: 'Quantité de recette', type: 'number', required: true },
      { key: 'unit_price', label: 'Prix de recette', type: 'number', required: true },
      { key: 'total', label: 'Total de recette', type: 'computed', expression: { operator: 'multiply', operands: [{ field: 'quantity' }, { field: 'unit_price' }] } },
      { key: 'justification', label: 'Justification urgente', type: 'text', required: true, visible_when: { operator: 'eq', field: 'priority', value: 'urgent' } },
    ] } }, definition.latest_version.version)
    expect((await client.get('runtime/forms/courriers-externes/')).form.fields.some((field: any) => field.key === 'quantity')).toBe(false)
    definition = await publish(client, definition)
    await page.goto('/courriers/nouveau')
    await page.getByRole('textbox', { name: 'Expéditeur', exact: true }).fill('Recette UI')
    await page.getByRole('textbox', { name: 'Objet', exact: true }).fill(`Recette champs ${Date.now()}`)
    await page.getByRole('combobox', { name: /^Direction/ }).click(); await page.getByRole('option', { name: /^DT —/ }).click()
    await page.getByRole('combobox', { name: /^Service responsable/ }).click(); await page.getByRole('option', { name: /^DSI —/ }).click()
    await page.getByLabel('Quantité de recette').fill('4')
    await page.getByLabel('Prix de recette').fill('25')
    await expect(page.getByLabel('Total de recette')).toHaveValue('100')
    await expect(page.getByLabel('Justification urgente')).toHaveCount(0)
    await page.getByRole('combobox', { name: /^Priorité/ }).click(); await page.getByRole('option', { name: 'Urgente', exact: true }).click()
    await expect(page.getByLabel('Justification urgente')).toBeVisible()
    await page.getByLabel('Justification urgente').fill('Recette conditionnelle')
    await page.getByRole('button', { name: 'Enregistrer le brouillon', exact: true }).click()
    await expect(page).toHaveURL(/\/modifier$/)
    const newId = page.url().split('/').at(-2)!
    const current = await client.get(`correspondences/${newId}/`)
    expect(current.custom_data.total).toBe('100'); expect(current.custom_data.justification).toBe('Recette conditionnelle')
    expect(current.configuration_bundle_id).not.toBe(oldDraft.configuration_bundle_id)
    const pinned = await client.get(`runtime/forms/courriers-externes/?item=${oldDraft.id}`)
    expect(pinned.form_version).toBe(oldSchema.form_version)
    expect(pinned.form.fields.some((field: any) => field.key === 'quantity')).toBe(false)
    await page.goto(`/courriers/externes/${oldDraft.id}/modifier`)
    await expect(page.getByRole('textbox', { name: 'Expéditeur', exact: true })).toBeVisible()
    await expect(page.getByLabel('Quantité de recette')).toHaveCount(0)
  } finally {
    definition = await client.get(`configurations/${definition.id}/`)
    definition = await client.patch(`configurations/${definition.id}/`, { data: original }, definition.latest_version.version)
    await publish(client, definition)
  }
})

test('real documents are scanned, submitted, validated, signed and audited with version and permission checks', async ({ page, request }) => {
  test.setTimeout(180_000)
  const token = await login(page); const client = api(request, token)
  let item = await client.post('correspondences/', draftData(`Recette signature ${Date.now()}`))
  const stale = await request.patch(`${root}/correspondences/${item.id}/`, { headers: { ...client.headers, 'If-Match': '"0"' }, data: { subject: 'Modification obsolète' } })
  expect(stale.status()).toBe(409)
  const upload = await request.post(`${root}/correspondences/${item.id}/documents/`, { headers: { ...client.headers, 'If-Match': `"${item.row_version}"` }, multipart: { file: { name: 'recette.pdf', mimeType: 'application/pdf', buffer: letterPdf() } } })
  expect(upload.ok(), await upload.text()).toBeTruthy()
  await expect.poll(async () => { item = await client.get(`correspondences/${item.id}/`); return item.documents[0]?.scan_status }, { timeout: 100_000, intervals: [1000, 2000, 4000] }).toBe('clean')
  item = await client.post(`correspondences/${item.id}/submit/`, {}, item.row_version)
  expect(item.reference).toBeTruthy(); expect(item.status).toBe('in_validation')
  const tasks = await client.get('tasks/?page_size=100')
  expect(tasks.results.some((task: any) => task.correspondence_id === item.id)).toBe(true)
  item = await client.post(`correspondences/${item.id}/validate/`, { comment: 'Recette de validation' }, item.row_version)
  expect(item.status).toBe('validated')
  const anonymous = await request.post(`${root}/correspondences/${item.id}/sign/`, { data: { level: 'electronic-validation', document_version_id: item.documents[0].id } })
  expect(anonymous.status()).toBe(401)
  const digital = await request.post(`${root}/correspondences/${item.id}/sign/`, { headers: { ...client.headers, 'If-Match': `"${item.row_version}"` }, data: { level: 'digital', document_version_id: item.documents[0].id } })
  expect(digital.status()).toBe(409)
  expect((await digital.json()).detail).toContain('signature numérique')
  item = await client.post(`correspondences/${item.id}/sign/`, { level: 'electronic-validation', document_version_id: item.documents[0].id }, item.row_version)
  expect(item.status).toBe('signed'); expect(item.signature_proof.status).toBe('verified')
  expect(item.signature_proof.document_hash).toBe(item.documents[0].sha256)
  await page.goto(`/courriers/externes/${item.id}`)
  await expect(page.getByRole('heading', { name: item.reference, exact: true })).toBeVisible()
  await expect(page.getByText(item.subject, { exact: true }).first()).toBeVisible()
  const audit = await client.get(`audit-events/?resource_id=${item.id}&page_size=100`)
  expect(audit.results.some((event: any) => event.action === 'correspondence.sign' && event.resource_id === item.id)).toBe(true)
  expect((await client.get('audit-events/verify/')).valid).toBe(true)
})

test('conditional workflows retain pending approvals and allow graphic signatures only after validation', async ({ page, request }) => {
  test.setTimeout(240_000)
  const token = await login(page); const client = api(request, token)
  const all = await client.get('configurations/?kind=workflow&page_size=100')
  let definition: Definition = all.results.find((item: Definition) => item.slug === 'correspondence-validation')
  const original = definition.current_version!.data
  try {
    definition = await client.patch(`configurations/${definition.id}/`, { data: {
      steps: [
        { key: 'review', label: 'Première validation', kind: 'validation', actor: 'creator' },
        { key: 'second', label: 'Seconde validation urgente', kind: 'approval', actor: 'creator' },
        { key: 'signature', label: 'Signature de recette', kind: 'signature', actor: 'creator' },
        { key: 'archive', label: 'Archivage de recette', kind: 'archive', actor: 'creator' },
      ],
      transitions: [
        { key: 'urgent', from: 'review', to: 'second', action: 'validate', condition: { operator: 'eq', field: 'priority', value: 'urgent' } },
        { key: 'normal', from: 'review', to: 'signature', action: 'validate', condition: { operator: 'neq', field: 'priority', value: 'urgent' } },
        { key: 'approved', from: 'second', to: 'signature', action: 'validate' },
        { key: 'signed', from: 'signature', to: 'archive', action: 'sign' },
      ],
    } }, definition.latest_version.version)
    definition = await publish(client, definition)
    for (const priority of ['urgent', 'normal']) {
      let item = await client.post('correspondences/', { ...draftData(`Recette branches ${priority} ${Date.now()}`), priority })
      const missingAttachment = await request.post(`${root}/correspondences/${item.id}/submit/`, { headers: { ...client.headers, 'If-Match': `"${item.row_version}"` }, data: {} })
      expect(missingAttachment.status()).toBe(400)
      if (priority === 'urgent') expect((await missingAttachment.json()).errors.documents).toContain('règle métier')
      item = await attachCleanDocument(request, client, item)
      item = await client.post(`correspondences/${item.id}/submit/`, {}, item.row_version)
      const earlySign = await request.post(`${root}/correspondences/${item.id}/sign/`, { headers: { ...client.headers, 'If-Match': `"${item.row_version}"` }, data: { level: 'graphic', document_version_id: item.documents[0].id, graphic_mark: 'Recette' } })
      expect(earlySign.status()).toBe(409)
      item = await client.post(`correspondences/${item.id}/validate/`, {}, item.row_version)
      if (priority === 'urgent') {
        expect(item.status).toBe('in_validation')
        const tasks = await client.get('tasks/?status=todo&page_size=100&ordering=-created_at')
        const pending = tasks.results.filter((task: any) => task.correspondence_id === item.id)
        expect(pending).toHaveLength(1)
        expect(pending[0].step_key).toBe('second')
        const premature = await request.post(`${root}/correspondences/${item.id}/sign/`, { headers: { ...client.headers, 'If-Match': `"${item.row_version}"` }, data: { level: 'graphic', document_version_id: item.documents[0].id, graphic_mark: 'Recette' } })
        expect(premature.status()).toBe(409)
        item = await client.post(`tasks/${pending[0].id}/act/`, { action: 'validate' }, item.row_version)
      }
      expect(item.status).toBe('validated')
      const noMark = await request.post(`${root}/correspondences/${item.id}/sign/`, { headers: { ...client.headers, 'If-Match': `"${item.row_version}"` }, data: { level: 'graphic', document_version_id: item.documents[0].id } })
      expect(noMark.status()).toBe(400)
      item = await client.post(`correspondences/${item.id}/sign/`, { level: 'graphic', document_version_id: item.documents[0].id, graphic_mark: 'Signature graphique de recette' }, item.row_version)
      expect(item.status).toBe('signed')
      expect(item.signature_proof.level).toBe('graphic')
      expect(item.signature_proof.document_hash).toBe(item.documents[0].sha256)
      item = await client.post(`correspondences/${item.id}/archive/`, {}, item.row_version)
      expect(item.status).toBe('archived')
    }
  } finally {
    definition = await client.get(`configurations/${definition.id}/`)
    definition = await client.patch(`configurations/${definition.id}/`, { data: original }, definition.latest_version.version)
    await publish(client, definition)
  }
})
