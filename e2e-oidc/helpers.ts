import { expect, type Page } from '@playwright/test'
import { readFileSync } from 'node:fs'

export async function login(page: Page, username = 'admin.numa') {
  const realm = JSON.parse(readFileSync('docker/keycloak/numa-realm.json', 'utf8'))
  const password = process.env[username === 'kader' ? 'NUMA_E2E_USER_PASSWORD' : 'NUMA_E2E_ADMIN_PASSWORD']
    ?? realm.users.find((user: { username: string }) => user.username === username)?.credentials[0].value
  await page.goto('/connexion')
  await page.getByRole('button', { name: /Se connecter avec/ }).click()
  await expect(page.locator('#username')).toBeVisible({ timeout: 60_000 })
  await page.locator('#username').fill(username)
  await page.locator('#password').fill(password)
  await page.locator('#kc-login').click()
  await expect(page.getByRole('button', { name: 'Ouvrir le menu du profil' })).toBeVisible({ timeout: 60_000 })
  return page.evaluate(() => {
    for (const storage of [window.sessionStorage, window.localStorage]) {
      for (const key of Object.keys(storage)) {
        if (key.startsWith('oidc.user:')) {
          const user = JSON.parse(storage.getItem(key) ?? '{}')
          if (user.access_token) return user.access_token as string
        }
      }
    }
    throw new Error('Session OIDC introuvable')
  })
}
