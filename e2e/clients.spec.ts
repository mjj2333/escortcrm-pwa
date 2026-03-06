import { test, expect } from '@playwright/test'
import { setupApp, navigateToTab, waitForToast } from './helpers'

test.describe('Clients Tab', () => {
  test('add a new client', async ({ page }) => {
    await setupApp(page)
    await navigateToTab(page, 'Clients')

    // Click add client button
    await page.getByRole('button', { name: 'Add client' }).click()

    // Wait for the modal to appear
    await expect(page.getByRole('dialog')).toBeVisible()

    // Fill in the alias (Name field — required)
    await page.getByLabel('Name').fill('Test Client Alice')

    // Save
    await page.getByRole('button', { name: 'Save client' }).click()

    // Verify toast
    await waitForToast(page, 'Client added')

    // Verify client appears in the list
    await expect(page.getByText('Test Client Alice')).toBeVisible()
  })

  test('search filters clients', async ({ page }) => {
    await setupApp(page)
    await navigateToTab(page, 'Clients')

    // Add two clients
    for (const name of ['Alpha One', 'Beta Two']) {
      await page.getByRole('button', { name: 'Add client' }).click()
      await expect(page.getByRole('dialog')).toBeVisible()
      await page.getByLabel('Name').fill(name)
      await page.getByRole('button', { name: 'Save client' }).click()
      await waitForToast(page, 'Client added')
    }

    // Both should be visible
    await expect(page.getByText('Alpha One')).toBeVisible()
    await expect(page.getByText('Beta Two')).toBeVisible()

    // Search for "Alpha"
    await page.getByPlaceholder('Search').fill('Alpha')

    // Alpha visible, Beta hidden
    await expect(page.getByText('Alpha One')).toBeVisible()
    await expect(page.getByText('Beta Two')).not.toBeVisible()
  })
})
