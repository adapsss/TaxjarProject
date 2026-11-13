import demoScenarios from '../../../demo/scenarios.json'
import type { SimulateIncoming } from '../api/client'

export interface Scenario extends SimulateIncoming {
  id: string
  label: string
  expect: 'income' | 'personal' | 'unknown'
}

/** Role D's demo payments (demo/scenarios.json). The first three are the golden path. */
export const scenarios = demoScenarios as Scenario[]

/** Exactly the fields POST /simulate/incoming takes. */
export const toPayment = (s: SimulateIncoming): SimulateIncoming => ({
  senderName: s.senderName,
  senderKind: s.senderKind ?? null,
  amount: s.amount,
  currency: s.currency,
  reference: s.reference ?? '',
})
