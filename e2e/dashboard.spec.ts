import { expect, test } from '@playwright/test'

test('anonymous user completes MFA, keeps the requested destination, and can sign out', async ({ page }) => {
  await page.goto('/')
  await page.evaluate(() => window.localStorage.removeItem('numa.auth.session.v1'))
  await page.goto('/courriers/externes?view=drafts')

  await expect(page).toHaveURL(/\/connexion\?returnTo=/)
  await expect(page.getByRole('heading', { name: 'Connexion à NUMA' })).toBeVisible()
  await page.getByRole('button', { name: 'Se connecter avec ORGATECH' }).click()

  await expect(page.getByRole('heading', { name: 'Vérification renforcée' })).toBeVisible()
  const code = page.getByLabel('Code de vérification')
  await code.fill('000000')
  await page.getByRole('button', { name: 'Vérifier' }).click()
  await expect(page.getByRole('alert')).toContainText('Code incorrect')

  await code.fill('123456')
  await page.getByRole('button', { name: 'Vérifier' }).click()
  await expect(page).toHaveURL(/\/courriers\/externes\?view=drafts$/)
  await expect(page.getByRole('heading', { name: 'Courriers externes 2026' })).toBeVisible()

  await page.reload()
  await expect(page.getByRole('heading', { name: 'Courriers externes 2026' })).toBeVisible()
  await page.getByRole('button', { name: 'Ouvrir le menu du profil' }).click()
  await page.getByRole('menuitem', { name: 'Se déconnecter' }).click()
  await expect(page).toHaveURL(/\/connexion(?:\?|$)/)
  await expect(page.getByRole('heading', { name: 'Connexion à NUMA' })).toBeVisible()
})

test('dashboard is usable and captures the approved direction', async ({ page }, testInfo) => {
  await page.goto('/')

  await expect(page.getByRole('heading', { name: 'Bonjour, Kader' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Mes tâches' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Activité récente' })).toBeVisible()
  await expect(page.getByText('© 2026 NUMA — Tous droits réservés à Koogin SAS')).toBeVisible()

  const monday = page.getByRole('img', { name: 'Lun : 4 courriers internes, 5 courriers externes, total 9' })
  await monday.focus()
  await expect(page.getByText('Total : 9')).toBeVisible()
  await page.getByRole('button', { name: '4 semaines' }).click()
  await expect(page.getByRole('img', { name: 'Sem. 1 : 28 courriers internes, 34 courriers externes, total 62' })).toBeVisible()

  await page.screenshot({
    path: `test-results/screenshots/dashboard-${testInfo.project.name}.png`,
    fullPage: true,
  })
})

test('page header actions keep their standard height', async ({ page }) => {
  await page.goto('/courriers/nouveau?type=externe')
  await expect(page.getByRole('link', { name: 'Annuler', exact: true })).toHaveCSS('height', '40px')
  await expect(page.getByRole('button', { name: 'Enregistrer le brouillon', exact: true })).toHaveCSS('height', '40px')
  await expect(page.getByRole('button', { name: 'Soumettre', exact: true })).toHaveCSS('height', '40px')

  const actionScreens = [
    ['/courriers/externes/import', 'Étape suivante'],
    ['/courriers/externes/ext-0040-2026/signature', 'Apposer la signature'],
    ['/administration/listes/courriers-externes', 'Publier'],
    ['/administration/pages/accueil-dt', 'Publier'],
    ['/administration/templates', 'Nouveau template'],
    ['/administration/workflows/courrier-externe', 'Publier'],
    ['/administration/sauvegardes', 'Lancer une sauvegarde'],
  ] as const

  for (const [path, actionName] of actionScreens) {
    await page.goto(path)
    await expect(page.getByRole('button', { name: actionName, exact: true })).toHaveCSS('height', '40px')
  }

  await page.goto('/courriers/externes/ext-0040-2026')
  await page.getByRole('tab', { name: /Documents/ }).click()
  await expect(page.getByRole('button', { name: 'Nouvelle version', exact: true })).toHaveCSS('height', '40px')
})

test('organization branding can be published and survives reload', async ({ page }) => {
  await page.goto('/administration/site')
  await expect(page.getByRole('heading', { name: 'Identité visuelle', level: 1 })).toBeVisible()

  await page.getByLabel('Choisir un logo PNG ou SVG').setInputFiles({
    name: 'orgatech.svg',
    mimeType: 'image/svg+xml',
    buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="160" height="48"><rect width="160" height="48" fill="#123E7C"/></svg>'),
  })
  await expect(page.getByText('orgatech.svg')).toBeVisible()
  await page.getByRole('button', { name: 'Enregistrer', exact: true }).click()
  await expect(page.locator('header').getByTestId('brand-logo')).toHaveAttribute('src', /^data:image\/svg\+xml/)

  await page.reload()
  await expect(page.locator('header').getByTestId('brand-logo')).toHaveAttribute('src', /^data:image\/svg\+xml/)
  await page.evaluate(() => window.localStorage.removeItem('numa.auth.session.v1'))
  await page.goto('/connexion')
  await expect(page.getByAltText('Logo ORGATECH')).toBeVisible()
})

test('numbering is configured and previewed by responsible service', async ({ page }) => {
  await page.goto('/administration/listes/courriers-externes')
  await page.getByRole('button', { name: 'Numérotation' }).click()
  await expect(page.getByTestId('numbering-preview')).toHaveText('DSI/0053/2026')

  await page.getByRole('combobox', { name: 'Service responsable' }).click()
  await page.getByRole('option', { name: /RH — Ressources humaines/ }).click()
  await expect(page.getByTestId('numbering-preview')).toHaveText('RH/0053/2026')
  await page.getByRole('button', { name: 'Enregistrer la numérotation' }).click()
  await expect(page.getByText(/Configuration enregistrée/)).toBeVisible()

  await page.goto('/courriers/nouveau?type=externe')
  await expect(page.getByTestId('creation-numbering-preview')).toHaveText('DSI/0053/2026')
})

test('navigation reaches the prepared external registry route', async ({ page }) => {
  await page.goto('/')

  const menuButton = page.getByRole('button', { name: 'Ouvrir le menu', exact: true })
  if (await menuButton.isVisible()) {
    await menuButton.click()
    await page.getByRole('link', { name: 'Courriers externes' }).click()
  } else {
    await page.getByRole('button', { name: 'Courriers' }).click()
    await page.getByRole('menuitem', { name: 'Courriers externes' }).click()
  }

  await expect(page.getByRole('heading', { name: 'Courriers externes 2026' })).toBeVisible()
  await expect(page.getByText('Affichage 1–10 sur 18 résultats')).toBeVisible()
  if (await page.getByText('Externe 2026 · Active').isVisible()) {
    await expect(page.getByText('Externe 2026 · Active')).toBeVisible()
  } else {
    await expect(page.locator('[aria-label="Fil d’Ariane"]').getByText('Externes')).toBeVisible()
  }
})

test('external registry can be searched and paginated', async ({ page }, testInfo) => {
  await page.goto('/courriers/externes')
  await expect(page.getByTestId('registry-loading-slot')).toHaveCSS('height', '4px')

  await page.getByRole('searchbox', { name: 'Rechercher dans le registre' }).fill('Ambassade')
  await expect(page.getByText('Affichage 1–1 sur 1 résultat')).toBeVisible()
  const matchingSubject = page.viewportSize()!.width < 900
    ? page.locator('article').getByText('Invitation à la réunion COP30')
    : page.getByRole('table').getByText('Invitation à la réunion COP30')
  await expect(matchingSubject).toBeVisible()
  await expect(page).toHaveURL(/q=Ambassade/)
  await expect(page.getByTestId('registry-loading-slot')).toHaveCSS('height', '4px')

  await page.screenshot({
    path: `test-results/screenshots/registry-search-${testInfo.project.name}.png`,
    fullPage: true,
  })

  await page.getByRole('button', { name: 'Réinitialiser' }).click()
  await page.getByRole('button', { name: 'Aller à la page 2' }).click()
  await expect(page.getByText('Affichage 11–18 sur 18 résultats')).toBeVisible()
  await expect(page).toHaveURL(/page=2/)
})

test('internal registry matches the external registry experience', async ({ page }, testInfo) => {
  await page.goto('/courriers/internes')
  await expect(page.getByTestId('registry-loading-slot')).toHaveCSS('height', '4px')

  await expect(page.getByRole('heading', { name: 'Courriers internes 2026' })).toBeVisible()
  await expect(page.getByRole('tab', { name: 'À traiter' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Importer' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Exporter' })).toBeVisible()

  await page.getByRole('searchbox', { name: 'Rechercher dans le registre interne' }).fill('Congés')
  await expect(page.getByText('Affichage 1–1 sur 1 résultat')).toBeVisible()
  const matchingSubject = page.viewportSize()!.width < 900
    ? page.locator('article').getByText('Note de service — Congés août')
    : page.getByRole('table').getByText('Note de service — Congés août')
  await expect(matchingSubject).toBeVisible()
  await expect(page).toHaveURL(/q=Cong/)
  await expect(page.getByTestId('registry-loading-slot')).toHaveCSS('height', '4px')

  await page.screenshot({
    path: `test-results/screenshots/internal-registry-${testInfo.project.name}.png`,
    fullPage: true,
  })

  const referenceLink = page.viewportSize()!.width < 900
    ? page.locator('article').getByRole('link', { name: 'INT-0187/2026', exact: true })
    : page.getByRole('table').getByRole('link', { name: 'INT-0187/2026', exact: true })
  await referenceLink.click()
  await expect(page.getByRole('heading', { name: 'INT-0187/2026' })).toBeVisible()
  await expect(page).toHaveURL(/courriers\/internes\/int-0187-2026/)
})

test('navigation, grouped correspondence rows and notifications keep their natural layout', async ({ page }) => {
  await page.goto('/courriers/internes?view=grouped')

  if (page.viewportSize()!.width >= 900) {
    const toolbar = page.locator('header .MuiToolbar-root').first()
    const navigationButton = page.getByRole('button', { name: 'Courriers', exact: true })
    const [toolbarBox, navigationBox] = await Promise.all([toolbar.boundingBox(), navigationButton.boundingBox()])
    expect(toolbarBox).not.toBeNull()
    expect(navigationBox).not.toBeNull()
    expect(navigationBox!.height).toBeGreaterThan(40)
    expect(Math.abs((navigationBox!.y + navigationBox!.height) - (toolbarBox!.y + toolbarBox!.height))).toBeLessThanOrEqual(1)
  }

  const groupedRows = page.getByTestId('grouped-correspondence-row')
  await expect(groupedRows.first()).toBeVisible()
  expect(await groupedRows.count()).toBeGreaterThan(1)
  const firstGroupedBox = await groupedRows.nth(0).boundingBox()
  const secondGroupedBox = await groupedRows.nth(1).boundingBox()
  expect(firstGroupedBox).not.toBeNull()
  expect(secondGroupedBox).not.toBeNull()
  expect(firstGroupedBox!.height).toBeGreaterThanOrEqual(78)
  expect(secondGroupedBox!.y).toBeGreaterThanOrEqual(firstGroupedBox!.y + firstGroupedBox!.height)

  await page.evaluate(() => window.localStorage.removeItem('numa.prototype-data.v1'))
  await page.goto('/notifications')
  const notificationRows = page.getByTestId('notification-row')
  await expect(notificationRows.first()).toBeVisible()
  expect(await notificationRows.count()).toBe(4)
  const firstNotificationBox = await notificationRows.nth(0).boundingBox()
  const secondNotificationBox = await notificationRows.nth(1).boundingBox()
  expect(firstNotificationBox).not.toBeNull()
  expect(secondNotificationBox).not.toBeNull()
  expect(firstNotificationBox!.height).toBeGreaterThanOrEqual(86)
  expect(secondNotificationBox!.y).toBeGreaterThanOrEqual(firstNotificationBox!.y + firstNotificationBox!.height)
  await expect(page.getByTestId('notification-icon-unread').first()).toHaveCSS('color', 'rgb(255, 255, 255)')
  await expect(page.getByTestId('notification-icon-read')).not.toHaveCSS('color', 'rgb(255, 255, 255)')
})

test('creation journey reaches a verified signature proof', async ({ page }, testInfo) => {
  await page.goto('/courriers/nouveau?type=externe')

  await expect(page.getByRole('heading', { name: 'Nouveau courrier' })).toBeVisible()
  await page.getByRole('button', { name: 'Soumettre' }).click()
  await expect(page.getByText('Courrier soumis au Chef de service')).toBeVisible()
  await page.getByRole('button', { name: 'Ouvrir la fiche' }).click()

  await expect(page.getByRole('heading', { name: 'EXT-0042/2026' })).toBeVisible()
  await page.getByRole('link', { name: 'Signer' }).click()
  await expect(page.getByRole('heading', { name: 'Signature électronique' })).toBeVisible()

  await page.screenshot({
    path: `test-results/screenshots/signature-editor-${testInfo.project.name}.png`,
    fullPage: true,
  })

  await page.getByRole('checkbox').check()
  await page.getByRole('button', { name: 'Apposer la signature' }).click()
  await page.getByRole('button', { name: 'Confirmer et signer' }).click()
  await expect(page.getByRole('heading', { name: 'Signature apposée et vérifiée' })).toBeVisible()

  await page.screenshot({
    path: `test-results/screenshots/signature-proof-${testInfo.project.name}.png`,
    fullPage: true,
  })
})

test('all approved prototype modules expose their primary screen', async ({ page }) => {
  const protectedScreens = [
    ['/courriers', 'Courriers'],
    ['/courriers/internes', 'Courriers internes 2026'],
    ['/courriers/internes/import', 'Importer des courriers internes'],
    ['/archives', 'Archives des courriers'],
    ['/taches', 'Mes tâches'],
    ['/recherche?q=Ambassade', 'Recherche globale'],
    ['/courriers/externes/import', 'Importer des courriers externes'],
    ['/administration', 'Administration'],
    ['/administration/site', 'Identité visuelle'],
    ['/administration/listes', 'Listes métier'],
    ['/administration/pages', 'Pages'],
    ['/administration/templates', 'Templates'],
    ['/administration/workflows', 'Workflows'],
    ['/administration/audit', 'Journal d’audit'],
    ['/administration/sauvegardes', 'Sauvegardes et restauration'],
    ['/administration/exploitation', 'État de la plateforme'],
    ['/administration/etats-systeme', 'États système transversaux'],
  ] as const

  for (const [path, heading] of protectedScreens) {
    await page.goto(path)
    await expect(page.getByRole('heading', { name: heading, level: 1 })).toBeVisible()
    await expect(page.getByTestId('app-footer')).toBeVisible()
  }

  await page.evaluate(() => window.localStorage.removeItem('numa.auth.session.v1'))
  const publicScreens = [
    ['/connexion', 'Connexion à NUMA'],
    ['/mfa', 'Vérification renforcée'],
    ['/acces-refuse', 'Accès non autorisé'],
    ['/session-expiree', 'Session expirée'],
  ] as const

  for (const [path, heading] of publicScreens) {
    await page.goto(path)
    await expect(page.getByRole('heading', { name: heading, level: 1 })).toBeVisible()
    await expect(page.getByTestId('app-footer')).toBeVisible()
  }
})
