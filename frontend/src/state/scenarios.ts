import { useEffect, useState } from 'react'
import { ApiError, getDemoScenarios, type DemoScenario, type SimulateIncoming } from '../api/client'

export type Scenario = DemoScenario

let pending: Promise<Scenario[]> | null = null

/**
 * Role D's demo payments, stored in the database (GET /api/demo/scenarios). The first three are
 * the golden path. One request is shared by every caller; a failed request is retried next time.
 */
export function loadScenarios(): Promise<Scenario[]> {
  if (!pending) {
    pending = getDemoScenarios().catch((e) => {
      pending = null
      throw e
    })
  }
  return pending
}

export function useScenarios(): { scenarios: Scenario[]; loading: boolean; error: string | null } {
  const [state, setState] = useState<{ scenarios: Scenario[]; loading: boolean; error: string | null }>({
    scenarios: [],
    loading: true,
    error: null,
  })
  useEffect(() => {
    let live = true
    loadScenarios().then(
      (scenarios) => live && setState({ scenarios, loading: false, error: null }),
      (e: unknown) =>
        live && setState({ scenarios: [], loading: false, error: e instanceof ApiError ? e.message : String(e) }),
    )
    return () => {
      live = false
    }
  }, [])
  return state
}

/** Exactly the fields POST /simulate/incoming takes. */
export const toPayment = (s: SimulateIncoming): SimulateIncoming => ({
  senderName: s.senderName,
  senderKind: s.senderKind ?? null,
  amount: s.amount,
  currency: s.currency,
  reference: s.reference ?? '',
})
