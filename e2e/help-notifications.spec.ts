import { expect, test } from '@playwright/test'

test('help opens from the toolbar and fits the viewport', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('link', { name: 'Aide', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Aide et guide d’utilisation' })).toBeVisible()
  await page.getByRole('navigation', { name: 'Sommaire de l’aide' }).getByRole('link', { name: 'Signer un courrier' }).click()
  await expect(page.getByRole('heading', { name: 'Signer un courrier', exact: true })).toBeInViewport()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  await page.getByRole('link', { name: 'Voir mes notifications' }).click()
  await expect(page.getByRole('heading', { name: 'Notifications', exact: true })).toBeVisible()
})

test('an old notification opens the correspondence from the bell', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('numa.prototype-data.v1', JSON.stringify({ notifications: [{
      id: 'legacy', title: 'Ancienne validation', detail: 'Courrier à vérifier', createdAt: 'Hier',
      kind: 'validation', read: false, path: '/courriers/externals/ext-0040-2026',
    }] }))
  })
  await page.goto('/')
  await page.getByRole('button', { name: 'Notifications', exact: true }).click()
  await page.getByRole('menuitem', { name: /Ancienne validation/ }).click()
  await expect(page).toHaveURL(/\/courriers\/externes\/ext-0040-2026$/)
  await expect(page.getByRole('heading', { name: 'Page introuvable' })).toHaveCount(0)
  await expect(page.getByText('Notification de livraison — Lot 3', { exact: true }).first()).toBeVisible()
})
