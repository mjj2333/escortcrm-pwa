import { useEffect } from 'react'

/**
 * Ref-counted body scroll lock.
 * Multiple overlays can request a lock simultaneously — scroll is only
 * restored when the last one unmounts or becomes inactive.
 */
let lockCount = 0

export function useScrollLock(active: boolean) {
  useEffect(() => {
    if (!active) return
    lockCount++
    document.body.style.overflow = 'hidden'
    return () => {
      lockCount--
      if (lockCount === 0) {
        document.body.style.overflow = ''
      }
    }
  }, [active])
}
