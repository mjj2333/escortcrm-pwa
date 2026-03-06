import { test, expect } from '@playwright/test'
import { setupApp, navigateToTab, waitForToast } from './helpers'

test.describe('Safety Tab', () => {
  test('add a safety contact', async ({ page }) => {
    await setupApp(page)
    await navigateToTab(page, 'Safety')

    // Click the Contacts sub-tab
    await page.getByRole('tab', { name: 'Contacts' }).click()

    // Click add safety contact
    await page.getByRole('button', { name: 'Add safety contact' }).click()
    await expect(page.getByRole('dialog')).toBeVisible()

    // Fill name and phone
    await page.getByLabel('Name').fill('Emergency Contact Jane')
    await page.getByLabel('Phone').fill('5551234567')

    // Save
    await page.getByRole('button', { name: 'Save contact' }).click()

    // Verify toast
    await waitForToast(page, 'Contact added')

    // Verify contact appears in list
    await expect(page.getByText('Emergency Contact Jane')).toBeVisible()
  })
})
