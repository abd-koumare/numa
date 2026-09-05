import { test, expect } from '@playwright/test'
import { login } from './helpers'
import { root, api, publish, draftData, attachCleanDocument, type Definition } from './fixtures'

test('delegating a signature task grants the validator access to that correspondence', async ({ page, request, browser }) => {
  test.setTimeout(180_000)
  const token = await login(page)
  const client = api(request, token)
  let definition: Definition = (await client.get('configurations/?kind=workflow&page_size=100')).results.find((item: Definition) => item.slug === 'correspondence-validation')
  const original = definition.current_version!.data
  let item: any
  try {
    definition = await client.patch(`configurations/${definition.id}/`, { data: { ...original, steps: original.steps.map((step: any) => ({ ...step, actor: 'user:admin.numa' })) } }, definition.latest_version.version)
    definition = await publish(client, definition)
    item = await client.post('correspondences/', draftData(`Recette délégation signature ${Date.now()}`))
  } finally {
    definition = await client.get(`configurations/${definition.id}/`)
    definition = await client.patch(`configurations/${definition.id}/`, { data: original }, definition.latest_version.version)
    const restored = await publish(client, definition)
    expect(restored.current_version!.data).toEqual(original)
  }
  item = await attachCleanDocument(request, client, item)
  item = await client.post(`correspondences/${item.id}/submit/`, {}, item.row_version)
  item = await client.post(`correspondences/${item.id}/validate/`, {}, item.row_version)
  const tasks = await client.get('tasks/?page_size=100&ordering=-created_at')
  const signatureTask = tasks.results.find((task: any) => task.correspondence_id === item.id && task.kind === 'signature' && task.status === 'todo')
  expect(signatureTask).toBeTruthy()
  const context = await browser.newContext()
  try {
    const userPage = await context.newPage()
    const userToken = await login(userPage, 'kader')
    const userClient = api(request, userToken)
    const me = await userClient.get('me/')
    expect(me.roles).toContain('validateur')
    expect(me.capabilities).toContain('correspondence.sign')
    const access = await userClient.get(`correspondences/${item.id}/signature-access/`)
    expect(access.can_sign).toBe(false)
    expect(access.assignee_name).toBe('Admin NUMA')
    const denied = await request.post(`${root}/correspondences/${item.id}/sign/`, { headers: { ...userClient.headers, 'If-Match': `"${item.row_version}"` }, data: { level: 'graphic', document_version_id: item.documents[0].id, graphic_mark: 'Recette' } })
    expect(denied.status()).toBe(403)
    await userPage.goto(`/courriers/externes/${item.id}/signature`)
    await expect(userPage.getByText(/Votre rôle autorise la signature, mais/)).toBeVisible()
    await userPage.getByRole('checkbox', { name: /Je confirme avoir vérifié/ }).check()
    await expect(userPage.getByRole('button', { name: 'Apposer la signature' })).toBeDisabled()

    await client.post(`tasks/${signatureTask.id}/assign/`, { user_id: me.id, reason: 'Recette de transmission des habilitations à la délégation.' })
    expect((await userClient.get(`correspondences/${item.id}/signature-access/`)).can_sign).toBe(true)
    await userPage.evaluate(() => window.dispatchEvent(new Event('focus')))
    await expect(userPage.getByRole('button', { name: 'Apposer la signature' })).toBeEnabled()
    await userPage.getByRole('tab', { name: 'Taper mon nom' }).click()
    await userPage.getByRole('textbox', { name: 'Nom affiché' }).fill('Kader Yao — recette')
    await userPage.getByRole('button', { name: 'Apposer la signature' }).click()
    await userPage.getByRole('button', { name: 'Confirmer et signer' }).click()
    await expect(userPage.getByRole('heading', { name: 'Signature apposée et vérifiée' })).toBeVisible()
    const signed = await userClient.get(`correspondences/${item.id}/`)
    expect(signed.status).toBe('signed')
    expect(signed.signature_proofs[0].signer).toBe('Kader Yao')
    expect(signed.signature_proofs[0].document_hash).toBe(item.documents[0].sha256)
    const completed = await request.post(`${root}/tasks/${signatureTask.id}/assign/`, { headers: client.headers, data: { user_id: me.id } })
    expect(completed.status()).toBe(409)
    const audit = await client.get(`audit-events/?resource_id=${signatureTask.id}&action=workflow.task.assigned`)
    expect(audit.results.some((event: any) => event.after.assignee_id === me.id)).toBe(true)
  } finally { await context.close() }
})
