import type { Transaction } from '../api/client'

/** "Why: company sender · invoice in reference"; "" when the classifier gave no reasons. */
export function whyLine(reasons: string[]): string {
  return reasons.length ? `Why: ${reasons.join(' · ')}` : ''
}

export type Tag = 'Tax set aside' | 'Tax paid' | 'Income' | 'Personal' | 'Needs your answer' | null

/**
 * The label shown on a transaction row.
 * "Needs your answer" only appears once the Tax Jar is set up (plan Review Focus 2).
 */
export function tagFor(t: Transaction, profileEnabled: boolean): Tag {
  if (t.reservation?.status === 'reserved') return 'Tax set aside'
  if (t.reservation?.status === 'paid') return 'Tax paid'
  if (t.direction !== 'in') return null
  if (t.classification.label === 'unknown') return profileEnabled ? 'Needs your answer' : null
  if (t.classification.label === 'personal') return 'Personal'
  // Income with nothing reserved: it arrived before the Tax Jar was set up.
  if (t.classification.label === 'income') return 'Income'
  return null
}
