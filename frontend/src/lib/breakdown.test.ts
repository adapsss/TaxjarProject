import { expect, it } from 'vitest'
import type { Transaction } from '../api/client'
import { paymentSplit } from './breakdown'

const acme = (breakdown: { id: string; name: string; amount: number }[] | null, over: Partial<Transaction['reservation']> = {}): Transaction => ({
  id: 't1',
  direction: 'in',
  amount: 150000,
  currency: 'USD',
  counterparty: { name: 'Acme Inc.', kind: 'company', isKnownClient: false },
  reference: 'INV-042',
  createdAt: '2026-11-13T10:00:00Z',
  classification: { label: 'income', confidence: 0.97, reasons: ['company sender', 'invoice in reference'] },
  reservationId: 'r1',
  reservation: {
    id: 'r1', transactionId: 't1', sourceAmount: 30000, sourceCurrency: 'USD', rate: 2000, fxRate: 0.92,
    reservedAmount: 27600, taxCurrency: 'EUR', status: 'reserved', breakdown, ...over,
  },
})

it('turns the backend split into each tax’s share of the whole payment', () => {
  const s = paymentSplit(acme([{ id: 'income_tax', name: 'Income tax', amount: 11040 }, { id: 'social_tax', name: 'Social tax', amount: 16560 }]))!
  expect(s.exact).toBe(true)
  // Largest first: social tax 12% ($180 → €165.60), income tax 8% ($120 → €110.40)
  expect(s.taxes).toEqual([
    { id: 'social_tax', name: 'Social tax', rateBp: 1200, source: 18000, reserved: 16560 },
    { id: 'income_tax', name: 'Income tax', rateBp: 800, source: 12000, reserved: 11040 },
  ])
  expect(s.total).toMatchObject({ rateBp: 2000, source: 30000, reserved: 27600 })
  expect(s.keep).toEqual({ rateBp: 8000, amount: 120000 })
})

it('rows always add up to exactly what was taken, even when shares round', () => {
  // €317 reserved from €1,585 at 20%: 22/55 and 33/55 do not divide evenly
  const s = paymentSplit({
    ...acme([{ id: 'income_tax', name: 'Income tax', amount: 12680 }, { id: 'social_tax', name: 'Social tax', amount: 19020 }], {
      sourceAmount: 31700, sourceCurrency: 'EUR', fxRate: 1, reservedAmount: 31700,
    }),
    amount: 158500,
    currency: 'EUR',
  })!
  expect(s.taxes.reduce((sum, t) => sum + t.source, 0)).toBe(31700)
  expect(s.taxes.reduce((sum, t) => sum + t.rateBp, 0)).toBe(2000)
  expect(s.keep.amount + s.total.source).toBe(158500)
})

it('shows one Tax row when the regime has no exact split', () => {
  const s = paymentSplit(acme(null, { rate: 4500, sourceAmount: 67500, reservedAmount: 62100 }))!
  expect(s.exact).toBe(false)
  expect(s.taxes).toEqual([{ id: 'tax', name: 'Tax', rateBp: 4500, source: 67500, reserved: 62100 }])
  expect(s.keep).toEqual({ rateBp: 5500, amount: 82500 })
})

it('has nothing to split without a reservation', () => {
  expect(paymentSplit({ ...acme(null), reservation: null })).toBeNull()
})
