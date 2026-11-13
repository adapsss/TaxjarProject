// Read models for the Tax Jar screens: totals and the deadline come from GET /tax/summary,
// the per-month split (still in the jar vs already paid) and the lists come from the transactions.
import type { Country, TaxPart, TaxProfile, TaxSummary, Transaction } from '../api/client'

export const DISCLAIMER = 'An estimate for setting money aside, not tax advice.'
export const TAX_AUTHORITY = 'Tax authority (demo)'
/** Offered for the jar everywhere; the backend supports every engine country's currency too (app/fx.py). */
export const TAX_CURRENCIES = ['EUR', 'USD', 'GBP']

/** The tax-currency choices for a country: its own currency first, then the three common ones. */
export function currencyChoices(countryCurrency: string | null | undefined, current?: string): string[] {
  return [...new Set([countryCurrency, ...TAX_CURRENCIES, current].filter((c): c is string => !!c))]
}

export interface MonthBar {
  month: string // YYYY-MM
  held: number
  paid: number
}

export interface Summary {
  currency: string
  held: number
  paid: number
  estimatedDue: number
  nextDeadline: Date | null
  /** Exact split of `held` into its taxes (income tax, social tax, ...); null when the regime defines none. */
  breakdown: TaxPart[] | null
  /** The regime's taxes in words, e.g. "20% of each payment: 8% income tax, 12% social tax". */
  breakdownRule: string
  byMonth: MonthBar[]
  /** Every transaction that has (or had) a reservation, newest first. */
  reservations: Transaction[]
  /** Incoming payments still waiting for "Is this payment for work?". */
  pending: Transaction[]
}

export function buildSummary(profile: TaxProfile, transactions: Transaction[], server: TaxSummary | null, now = new Date()): Summary {
  const currency = server?.taxCurrency ?? profile.taxCurrency
  // Like the backend, only reservations in the current tax currency add up.
  const counted = transactions.filter((t) => t.reservation && t.reservation.status !== 'undone' && t.reservation.taxCurrency === currency)
  const sum = (status: 'reserved' | 'paid') =>
    counted.filter((t) => t.reservation!.status === status).reduce((s, t) => s + t.reservation!.reservedAmount, 0)

  const byMonth: MonthBar[] = []
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    byMonth.push({ month: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`, held: 0, paid: 0 })
  }
  for (const t of counted) {
    const bar = byMonth.find((b) => t.createdAt.startsWith(b.month))
    if (!bar) continue
    if (t.reservation!.status === 'paid') bar.paid += t.reservation!.reservedAmount
    else bar.held += t.reservation!.reservedAmount
  }

  return {
    currency,
    held: server ? server.totalReserved : sum('reserved'),
    paid: server ? server.totalPaid : sum('paid'),
    estimatedDue: server ? server.estimatedDue : sum('reserved'),
    // "2026-12-10" as a local date, so it never shifts a day across time zones.
    nextDeadline: server?.nextDeadline ? new Date(`${server.nextDeadline}T00:00:00`) : null,
    breakdown: server?.breakdown ?? null,
    breakdownRule: server?.breakdownRule ?? '',
    byMonth,
    reservations: transactions.filter((t) => t.reservation),
    pending: profile.enabled ? transactions.filter((t) => t.direction === 'in' && t.classification.label === 'unknown') : [],
  }
}

// ---------- countries and regimes (80 countries plus "*" = Other, from the tax engine) ----------

export const countryName = (countries: Country[], code: string) => countries.find((c) => c.code === code)?.name ?? code

/** "Entrepreneur account (ettevotluskonto), simplified business income taxation" → "Entrepreneur account". */
export const shortRegimeName = (name: string) => name.split(/\s*[(,]/)[0].trim() || name

export const regimeName = (countries: Country[], code: string, regime: string) => {
  const found = countries.find((c) => c.code === code)?.regimes.find((r) => r.id === regime)
  return found ? shortRegimeName(found.name) : regime
}

/**
 * A country as text ("EE"; "ALL" for "*" Other). Not an emoji flag: regional-indicator
 * flags need an emoji font, and without one (Windows, headless browsers) they show as boxes.
 */
export function countryBadge(code: string): string {
  return code === '*' ? 'ALL' : code
}

/** The regime's taxes in words, e.g. "10% income tax + 8% social contributions"; "" when unknown. */
export const regimeRule = (countries: Country[], country: string, regime: string): string =>
  countries.find((c) => c.code === country)?.regimes.find((r) => r.id === regime)?.breakdownRule ?? ''
