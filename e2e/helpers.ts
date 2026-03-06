import { type Page, expect } from '@playwright/test'

/** Click a main navigation tab by its label text */
export async function navigateToTab(page: Page, tabName: 'Home' | 'Schedule' | 'Clients' | 'Finances' | 'Safety') {
  await page.getByRole('tab', { name: tabName }).click()
  // Wait for lazy-loaded content to appear
  await page.waitForTimeout(300)
}

/** Set localStorage to bypass the Pro paywall (beta tester mode) */
export async function activatePro(page: Page) {
  await page.evaluate(() => {
    localStorage.setItem('_cstate_v2', JSON.stringify({
      activated: true,
      isBetaTester: true,
      activatedAt: new Date().toISOString(),
    }))
  })
}

/** Wait for a toast notification containing the given text */
export async function waitForToast(page: Page, text: string) {
  const toast = page.locator('div[role="status"][aria-live="polite"]')
  await expect(toast).toContainText(text, { timeout: 5000 })
}

/** Fill a FieldCurrency input by its label. Handles the focus/blur commit lifecycle. */
export async function fillCurrency(page: Page, label: string, value: string) {
  const input = page.locator(`label:has-text("${label}") + div input, label:has-text("${label}") ~ div input`).first()
  // Fall back to finding within the parent container
  const container = page.locator(`text="${label}"`).locator('..').locator('input').first()
  const target = await input.isVisible() ? input : container
  await target.click()
  await target.fill(value)
  await target.blur()
}

/** Seed a pre-screened client via Dexie (needed because BookingEditor requires screened clients) */
export async function seedScreenedClient(page: Page, alias: string): Promise<string> {
  return await page.evaluate(async (name) => {
    const { db, createClient } = await import('/src/db/index.ts')
    const client = createClient({
      alias: name,
      screeningStatus: 'Screened',
      riskLevel: 'Low Risk',
      phone: '555-000-1234',
    })
    await db.clients.add(client)
    return client.id
  }, alias)
}

/** Intercept service worker registration to avoid caching in tests */
export async function disableServiceWorker(page: Page) {
  await page.route('**/sw.js', route =>
    route.fulfill({ status: 200, contentType: 'application/javascript', body: '// noop' })
  )
}

/** Standard test setup: disable SW, go to app, wait for it to be ready */
export async function setupApp(page: Page, options?: { pro?: boolean }) {
  await disableServiceWorker(page)
  await page.goto('/', { waitUntil: 'networkidle' })
  // Wait for the tab bar to be present (indicates app has loaded)
  await expect(page.getByRole('tablist')).toBeVisible({ timeout: 10000 })
  if (options?.pro) {
    await activatePro(page)
    await page.reload({ waitUntil: 'networkidle' })
    await expect(page.getByRole('tablist')).toBeVisible({ timeout: 10000 })
  }
}
