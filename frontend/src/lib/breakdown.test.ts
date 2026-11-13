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
  // Income tax first, then social tax, in every country: 8% ($120 → €110.40), 12% ($180 → €165.60)
  expect(s.taxes).toEqual([
    { id: 'income_tax', name: 'Income tax', rateBp: 800, source: 12000, reserved: 11040 },
    { id: 'social_tax', name: 'Social tax', rateBp: 1200, source: 18000, reserved: 16560 },
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

import { linesSummary, paymentLines, ruleLines, taxName, totalLines } from './breakdown'

it('gives the same kind of tax the same name in every country', () => {
  expect(taxName('Social tax')).toBe('Social tax')
  expect(taxName('social contributions')).toBe('Social tax')
  expect(taxName('Income tax')).toBe('Income tax')
  expect(taxName('Personal income tax')).toBe('Income tax')
  expect(taxName('Funded pension contribution')).toBe('Funded pension')
  expect(taxName('Stamp duty')).toBe('Stamp duty')
})

it('reads the rule text of real regimes into lines', () => {
  const names = (rule: string) => ruleLines(rule).map((l) => `${l.name}: ${l.basis}`)
  expect(names('10% income tax + 8% social contributions')).toEqual(['Income tax: 10% rate', 'Social tax: 8% rate'])
  expect(names('income tax from 12% to 32% + social contributions')).toEqual(['Income tax: 12% to 32% rates', 'Social tax: Rate set on your return'])
  expect(names('22% income tax on profit + 33% social tax')).toEqual(['Income tax: 22% rate', 'Social tax: 33% rate'])
  expect(names('1% income tax')).toEqual(['Income tax: 1% rate'])
  expect(names('social contributions')).toEqual(['Social tax: Rate set on your return'])
  expect(names('about 20% of income')).toEqual(['Tax: About 20% of income'])
  // The backend's wording when a regime does have an exact split but the rate was customised:
  expect(names('20% of each payment: 8% income tax, 12% social tax')).toEqual(['Income tax: 8% rate', 'Social tax: 12% rate'])
  expect(ruleLines('')).toEqual([])
  expect(ruleLines(undefined)).toEqual([])
  // Text it cannot read is kept as one line, never dropped.
  expect(names('Flat levy')).toEqual(['Flat levy: Rate set on your return'])
})

it('every country gets the same lines shape: exact money where known, the rule where not', () => {
  const exact = paymentLines(acme([{ id: 'income_tax', name: 'Income tax', amount: 11040 }, { id: 'social_tax', name: 'Social tax', amount: 16560 }]))
  expect(exact.map((l) => [l.name, l.basis, l.amount])).toEqual([
    ['Income tax', '8% of this payment', 11040],
    ['Social tax', '12% of this payment', 16560],
  ])
  const poland = paymentLines(acme(null, { rate: 3320 }), 'income tax from 12% to 32% + social contributions')
  expect(poland.map((l) => [l.name, l.amount])).toEqual([['Income tax', undefined], ['Social tax', undefined]])
  // No rule at all: still one line, so the layout never changes.
  expect(paymentLines(acme(null, { rate: 2500 }), '')).toEqual([{ id: 'tax', name: 'Tax', basis: '25% of this payment' }])
})

it('totals and toast lines follow the same rule', () => {
  expect(totalLines([{ id: 'income_tax', name: 'Income tax', amount: 100 }], '').map((l) => l.amount)).toEqual([100])
  expect(totalLines(null, '10% income tax + 8% social contributions').map((l) => l.name)).toEqual(['Income tax', 'Social tax'])
  expect(linesSummary(paymentLines(acme([{ id: 'a', name: 'Income tax', amount: 11040 }, { id: 'b', name: 'Social tax', amount: 16560 }])), 'EUR')).toBe(
    '€110.40 income tax · €165.60 social tax',
  )
  expect(linesSummary(ruleLines('10% income tax + 8% social contributions'), 'EUR')).toBe('Pays for income tax and social tax · exact amounts on your return')
})
