import type { TaxReservation, Transaction } from '../api/client'

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

export interface PaymentSplit {
  received: number
  currency: string
  taxCurrency: string
  /** Every tax in the reserve, largest first. One "Tax" row when the regime defines no exact split. */
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
    taxes.sort((a, b) => b.reserved - a.reserved)
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
