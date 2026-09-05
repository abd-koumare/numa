import { expect, test } from '@playwright/test'

test('Keycloak authenticates the demo user and the API registry is displayed', async ({ page }) => {
  await page.goto('/courriers/externes')
  await expect(page).toHaveURL(/\/connexion\?returnTo=/)
  await page.getByRole('button', { name: 'Se connecter avec ORGATECH' }).click()
  await expect(page.locator('#username')).toBeVisible({ timeout: 60_000 })
  await page.locator('#username').fill('kader')
  await page.locator('#password').fill('numa-demo')
  await page.locator('#kc-login').click()
  await expect(page).toHaveURL(/localhost:5173\/courriers\/externes/)
  await expect(page.getByRole('heading', { name: 'Courriers externes 2026' })).toBeVisible()
  const registry = page.getByRole('table', { name: 'Courriers externes 2026' })
  await page.getByRole('searchbox', { name: 'Rechercher dans le registre' }).fill('Demande de partenariat technique')
  await expect(registry.getByText('Demande de partenariat technique', { exact: true }).first()).toBeVisible()
})
