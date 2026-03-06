import { test, expect } from '@playwright/test'
import { setupApp } from './helpers'

test.describe('Settings', () => {
  test('open settings and verify sections', async ({ page }) => {
    await setupApp(page)

    // Click settings button on home page
    await page.getByRole('button', { name: 'Settings' }).click()

    // Wait for settings overlay
    await expect(page.getByRole('dialog')).toBeVisible()

    // Verify key section headers are present (CSS text-transform: uppercase, but DOM text is titlecase)
    await expect(page.getByText('Security').first()).toBeVisible()
    await expect(page.getByText('Appearance').first()).toBeVisible()
    await expect(page.getByText('Data').first()).toBeVisible()
  })
})
