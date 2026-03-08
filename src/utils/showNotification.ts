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
    // navigator.serviceWorker.ready never rejects — add a timeout to avoid hanging forever
    const reg = navigator.serviceWorker
      ? await Promise.race([
          navigator.serviceWorker.ready,
          new Promise<undefined>(r => setTimeout(r, 3000)),
        ])
      : undefined
    if (reg) {
      await reg.showNotification(title, options)
    } else {
      new Notification(title, options)
    }
  } catch {
    // Notification API unavailable (e.g. insecure context, permission revoked)
  }
}
