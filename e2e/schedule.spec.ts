import { test, expect } from '@playwright/test'
import { setupApp, navigateToTab, waitForToast, seedScreenedClient, fillCurrency } from './helpers'
import { format, addDays } from 'date-fns'

test.describe('Schedule Tab', () => {
  test('create a booking', async ({ page }) => {
    await setupApp(page, { pro: true })

    // Seed a screened client (BookingEditor requires screeningStatus === 'Screened')
    // Dexie live queries will pick this up reactively — no reload needed
    await seedScreenedClient(page, 'Screened Client')

    await navigateToTab(page, 'Schedule')

    // Click add booking
    await page.getByRole('button', { name: 'Add booking' }).click()
    await expect(page.getByRole('dialog')).toBeVisible()

    // Open client picker and select the seeded client
    await page.getByText('Select Client').click()
    await expect(page.getByText('Screened Client')).toBeVisible({ timeout: 3000 })
    await page.getByText('Screened Client').click()

    // Set date/time to tomorrow at 2pm
    const tomorrow = format(addDays(new Date(), 1), "yyyy-MM-dd'T'14:00")
    await page.locator('input[type="datetime-local"]').fill(tomorrow)

    // Set base rate
    await fillCurrency(page, 'Base Rate', '200')

    // Save
    await page.getByRole('button', { name: 'Save booking' }).click()

    // Verify toast
    await waitForToast(page, 'Booking created')
  })
})
