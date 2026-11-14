import { useEffect, type RefObject } from 'react'

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

/**
 * For a modal panel: moves focus into it on open, keeps Tab and Shift+Tab inside it,
 * and gives focus back to whatever had it before when the panel closes.
 */
export function useFocusTrap(ref: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const panel = ref.current
    if (!panel) return
    const before = document.activeElement as HTMLElement | null
    // preventScroll: the panel starts off-screen (it slides up), and focusing it would otherwise scroll
    // the screen's overflow:hidden container to bring it into view, throwing the whole UI out of place.
    panel.focus({ preventScroll: true })
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return
      const items = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => el.offsetParent !== null)
      if (items.length === 0) return e.preventDefault()
      const first = items[0]
      const last = items[items.length - 1]
      if (e.shiftKey && (document.activeElement === first || document.activeElement === panel)) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }
    panel.addEventListener('keydown', onKey)
    return () => {
      panel.removeEventListener('keydown', onKey)
      before?.focus?.({ preventScroll: true })
    }
  }, [ref])
}
