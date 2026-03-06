import { test, expect } from '@playwright/test'
import { setupApp, navigateToTab, waitForToast, fillCurrency } from './helpers'

test.describe('Finances Tab', () => {
  test('add income transaction', async ({ page }) => {
    await setupApp(page, { pro: true })
    await navigateToTab(page, 'Finances')

    // Click add transaction
    await page.getByRole('button', { name: 'Add transaction' }).click()
    await expect(page.getByRole('dialog')).toBeVisible()

    // Income is selected by default; fill amount
    await fillCurrency(page, 'Amount', '500')

    // Save
    await page.getByRole('button', { name: 'Save transaction' }).click()

    // Verify toast
    await waitForToast(page, 'Income recorded')
  })

  test('add expense transaction', async ({ page }) => {
    await setupApp(page, { pro: true })
    await navigateToTab(page, 'Finances')

    // Click add transaction
    await page.getByRole('button', { name: 'Add transaction' }).click()
    await expect(page.getByRole('dialog')).toBeVisible()

    // Switch to expense type
    await page.getByRole('button', { name: 'Expense' }).click()

    // Fill amount
    await fillCurrency(page, 'Amount', '75')

    // Save
    await page.getByRole('button', { name: 'Save transaction' }).click()

    // Verify toast
    await waitForToast(page, 'Expense recorded')
  })
})
