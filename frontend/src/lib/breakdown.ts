import type { TaxReservation, Transaction } from '../api/client'
import { formatMoney, formatRate } from './money'

export interface TaxShare {
  id: string
  name: string
  /** Share of the whole payment, in basis points: 800 = 8% of what arrived. */
  rateBp: number
  /** In the payment's currency (what left the balance). */
  source: number
  /** In the Tax Jar's currency (what landed in the jar). */
  reserved: number
}

const TAX_ORDER = ['Income tax', 'Social tax', 'Funded pension']
/** Position of a tax in every list: known taxes first, in a fixed order; anything else after, as given. */
function taxRank(raw: string): number {
  const i = TAX_ORDER.indexOf(taxName(raw))
  return i === -1 ? TAX_ORDER.length : i
}

export interface PaymentSplit {
  received: number
  currency: string
  taxCurrency: string
  /** Every tax in the reserve, in the same order everywhere. One "Tax" row when the regime defines no exact split. */
  taxes: TaxShare[]
  /** The whole reserve: rate of the payment, taken from the balance, and what reached the jar. */
  total: TaxShare
  /** What stays with the freelancer, in the payment's currency. */
  keep: { rateBp: number; amount: number }
  /** True when the split into taxes is exact (the backend sent a breakdown). */
  exact: boolean
}

/**
 * Splits one payment into each tax and what's left, as the backend reserved it.
 *
 * The backend sends the split of the reserved amount (in the jar's currency). Each tax's share of
 * the whole payment follows from it: income tax €110.40 of €276 reserved at 20% is 8% of the payment.
 * Source amounts are split in the same proportion; the last tax takes any rounding remainder, so
 * the rows always add up to exactly what left the balance.
 */
export function paymentSplit(tx: Transaction): PaymentSplit | null {
  const r: TaxReservation | null = tx.reservation
  if (!r || r.reservedAmount <= 0) return null
  const parts = r.breakdown && r.breakdown.length > 0 ? r.breakdown : null

  const taxes: TaxShare[] = []
  if (parts) {
    let sourceLeft = r.sourceAmount
    let rateLeft = r.rate
    parts.forEach((p, i) => {
      const last = i === parts.length - 1
      const source = last ? sourceLeft : Math.round((r.sourceAmount * p.amount) / r.reservedAmount)
      const rateBp = last ? rateLeft : Math.round((r.rate * p.amount) / r.reservedAmount)
      sourceLeft -= source
      rateLeft -= rateBp
      taxes.push({ id: p.id, name: p.name, rateBp, source, reserved: p.amount })
    })
    // The same order in every country: income tax, social tax, funded pension, anything else.
    taxes.sort((a, b) => taxRank(a.name) - taxRank(b.name))
  } else {
    taxes.push({ id: 'tax', name: 'Tax', rateBp: r.rate, source: r.sourceAmount, reserved: r.reservedAmount })
  }

  return {
    received: tx.amount,
    currency: tx.currency,
    taxCurrency: r.taxCurrency,
    taxes,
    total: { id: 'total', name: 'Set aside', rateBp: r.rate, source: r.sourceAmount, reserved: r.reservedAmount },
    keep: { rateBp: 10_000 - r.rate, amount: tx.amount - r.sourceAmount },
    exact: !!parts,
  }
}

// ---------------------------------------------------------------------------------------------
// One shape for every country. The law only fixes a per-payment split in money for a few regimes
// (Estonia's entrepreneur account); everywhere else it gives rates on yearly profit. Both become the
// same list of lines, so the screens look identical and only the amount cell differs:
// "€110.40" where the split is exact, "On your return" where it is worked out later.
// ---------------------------------------------------------------------------------------------

export interface TaxLine {
  id: string
  /** The same few names in every country: "Income tax", "Social tax", "Funded pension", or "Tax". */
  name: string
  /** What the amount is based on: "8% of this payment", "10% rate", "8% to 30% rates". */
  basis: string
  /** Exact money for this line, in the jar's currency; absent when the law gives no per-payment split. */
  amount?: number
}

/** The same label for the same kind of tax, whatever the country's own data calls it. */
export function taxName(raw: string): string {
  if (/pension/i.test(raw)) return 'Funded pension'
  if (/income/i.test(raw)) return 'Income tax'
  if (/social|contribution|insurance/i.test(raw)) return 'Social tax'
  const t = raw.trim()
  return t ? t[0].toUpperCase() + t.slice(1) : 'Tax'
}

const PERCENT = String.raw`\d+(?:\.\d+)?%`

/**
 * Reads the backend's rule text ("10% income tax + 8% social contributions",
 * "income tax from 8% to 30% + social contributions") into lines without amounts.
 * Text it cannot read becomes one line called "Tax", so nothing is ever dropped.
 */
export function ruleLines(rule: string | undefined | null): TaxLine[] {
  const text = (rule ?? '').replace(/^.*?\bof each payment:\s*/i, '').trim()
  if (!text) return []
  return text.split(/\s+\+\s+|,\s+/).map((piece, i) => {
    const flat = piece.match(new RegExp(`^(about )?(${PERCENT})\\s+(.+?)(?:\\s+on\\s+.+)?$`, 'i'))
    const range = piece.match(new RegExp(`^(.+?)\\s+from\\s+(${PERCENT})\\s+to\\s+(${PERCENT})$`, 'i'))
    if (flat && !/^of income$/i.test(flat[3])) {
      return { id: `rule-${i}`, name: taxName(flat[3]), basis: `${flat[1] ? 'About ' : ''}${flat[2]} rate` }
    }
    if (flat) return { id: `rule-${i}`, name: 'Tax', basis: `About ${flat[2]} of income` }
    if (range) return { id: `rule-${i}`, name: taxName(range[1]), basis: `${range[2]} to ${range[3]} rates` }
    return { id: `rule-${i}`, name: taxName(piece), basis: 'Rate set on your return' }
  })
}

/** Lines for one payment: exact amounts where the backend sent a split, the regime's rule otherwise. */
export function paymentLines(tx: Transaction, rule?: string): TaxLine[] {
  const s = paymentSplit(tx)
  if (!s) return []
  if (s.exact) {
    return s.taxes.map((t) => ({ id: t.id, name: taxName(t.name), basis: `${formatRate(t.rateBp)} of this payment`, amount: t.reserved }))
  }
  return ruleLines(rule).length > 0 ? ruleLines(rule) : [{ id: 'tax', name: 'Tax', basis: `${formatRate(s.total.rateBp)} of this payment` }]
}

/** Lines for a total (the Tax Jar page): the backend's summed split, or the regime's rule. */
export function totalLines(parts: { id: string; name: string; amount: number }[] | null | undefined, rule?: string): TaxLine[] {
  if (parts && parts.length > 0) {
    return parts.map((p) => ({ id: p.id, name: taxName(p.name), basis: 'of what you’ve set aside', amount: p.amount }))
  }
  return ruleLines(rule)
}

/**
 * Whether a payment's tax breakdown is shown: yes when the backend sent an exact split (it only does for the
 * regime's own rates), otherwise only when the rate is the regime's suggested one. A custom rate shows none.
 */
export function showsBreakdown(tx: Transaction, custom: boolean): boolean {
  const parts = tx.reservation?.breakdown
  return !!(parts && parts.length > 0) || !custom
}

/** One line of text for a toast: amounts when exact, the names and "on your return" when not. */
export function linesSummary(lines: TaxLine[], currency: string): string {
  if (lines.length === 0) return ''
  if (lines.every((l) => l.amount !== undefined)) {
    return lines.map((l) => `${formatMoney(l.amount!, currency, { cents: true })} ${l.name.toLowerCase()}`).join(' · ')
  }
  return `Pays for ${lines.map((l) => l.name.toLowerCase()).join(' and ')} · exact amounts on your return`
}
