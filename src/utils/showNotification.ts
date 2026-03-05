/**
 * Show a notification via the Service Worker registration when available,
 * falling back to `new Notification()` otherwise.
 *
 * Using `registration.showNotification()` is required for:
 * - iOS/iPadOS PWAs (new Notification() is not supported)
 * - Handling `notificationclick` events in the service worker
 * - Notifications surviving when the page is backgrounded
 */
export async function showAppNotification(title: string, options?: NotificationOptions) {
  try {
    const reg = await navigator.serviceWorker?.ready
    if (reg) {
      await reg.showNotification(title, options)
    } else {
      new Notification(title, options)
    }
  } catch {
    // Notification API unavailable (e.g. insecure context, permission revoked)
  }
}
