import { createContext, useContext, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'

export interface LeaveGuard {
  /** Plain-language reason shown in the "Are you sure?" sheet. */
  body: string
}

interface LeaveGuardApi {
  /** Set while a screen has unsaved changes; null otherwise. */
  guard: LeaveGuard | null
  setGuard: (g: LeaveGuard | null) => void
  /** Ask to go somewhere; the shell shows "Are you sure?" first when a guard is set. */
  request: (to: string) => void
}

export const LeaveGuardContext = createContext<LeaveGuardApi>({ guard: null, setGuard: () => {}, request: () => {} })

/**
 * For a screen with unsaved changes. While `body` is set, every in-app way out goes through
 * "Are you sure?" and closing or reloading the page asks the browser to confirm.
 */
export function useLeaveGuard(body: string | null) {
  const { setGuard } = useContext(LeaveGuardContext)
  useEffect(() => {
    if (!body) return
    setGuard({ body })
    const warn = (e: BeforeUnloadEvent) => e.preventDefault()
    window.addEventListener('beforeunload', warn)
    return () => {
      setGuard(null)
      window.removeEventListener('beforeunload', warn)
    }
  }, [body, setGuard])
}

/** Like `navigate`, but asks first when the current screen has unsaved changes. */
export function useGuardedNavigate() {
  const { request } = useContext(LeaveGuardContext)
  return request
}

/** Plain `navigate`, for leaving after the changes were saved. */
export const useSavedNavigate = useNavigate
