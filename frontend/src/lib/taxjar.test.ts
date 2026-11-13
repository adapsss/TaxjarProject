import { expect, it } from 'vitest'
import type { TaxProfile, Transaction } from '../api/client'
import { buildSummary, countryBadge, regimeName, shortRegimeName } from './taxjar'

const profile: TaxProfile = { country: 'EE', regime: 'entrepreneur_account', rate: 2000, taxCurrency: 'EUR', enabled: true }

const tx = (id: string, createdAt: string, status: 'reserved' | 'undone' | 'paid' | null, reserved = 0, label: 'income' | 'unknown' = 'income'): Transaction => ({
  id, direction: 'in', amount: reserved * 5, currency: 'EUR',
  counterparty: { name: id, kind: 'company', isKnownClient: false },
  reference: '', createdAt,
  classification: { label, confidence: 1, reasons: [] },
  reservationId: status ? `r-${id}` : null,
  reservation: status
    ? { id: `r-${id}`, transactionId: id, sourceAmount: reserved, sourceCurrency: 'EUR', rate: 2000, fxRate: 1, reservedAmount: reserved, taxCurrency: 'EUR', status }
    : null,
})

const NOW = new Date(2026, 10, 13) // 13 Nov 2026

it('splits each month into money still in the jar and money already paid', () => {
  const s = buildSummary(profile, [
    tx('a', '2026-11-04T10:00:00Z', 'reserved', 31700),
    tx('b', '2026-10-03T10:00:00Z', 'reserved', 36000),
    tx('c', '2026-08-21T10:00:00Z', 'paid', 30000),
    tx('d', '2026-11-05T10:00:00Z', 'undone', 9900),
  ], null, NOW)
  expect(s.byMonth.map((m) => m.month)).toEqual(['2026-06', '2026-07', '2026-08', '2026-09', '2026-10', '2026-11'])
  expect(s.byMonth[2]).toEqual({ month: '2026-08', held: 0, paid: 30000 })
  expect(s.byMonth[5]).toEqual({ month: '2026-11', held: 31700, paid: 0 })
  expect(s.held).toBe(67700)
  expect(s.paid).toBe(30000)
  expect(s.reservations).toHaveLength(4) // undone ones stay in the list
})

it('prefers the backend totals and reads the deadline as a local date', () => {
  const s = buildSummary(profile, [], {
    taxCurrency: 'EUR', totalReserved: 35600, totalPaid: 100, byMonth: [], estimatedDue: 35600,
    nextDeadline: '2026-12-10', disclaimer: '', breakdownRule: '20% of each payment: 8% income tax, 12% social tax',
    breakdown: [{ id: 'income_tax', name: 'Income tax', amount: 14240 }, { id: 'social_tax', name: 'Social tax', amount: 21360 }],
  }, NOW)
  expect(s.held).toBe(35600)
  expect(s.paid).toBe(100)
  expect(s.nextDeadline?.getDate()).toBe(10)
  expect(s.nextDeadline?.getMonth()).toBe(11)
  expect(s.breakdown?.map((p) => p.amount)).toEqual([14240, 21360])
  expect(s.breakdownRule).toContain('8% income tax')
})

it('has no tax split without the backend summary', () => {
  const s = buildSummary(profile, [], null, NOW)
  expect(s.breakdown).toBeNull()
  expect(s.breakdownRule).toBe('')
})

it('lists open questions only while the Tax Jar is set up', () => {
  const unknown = tx('q', '2026-11-11T10:00:00Z', null, 0, 'unknown')
  expect(buildSummary(profile, [unknown], null, NOW).pending).toHaveLength(1)
  expect(buildSummary({ ...profile, enabled: false }, [unknown], null, NOW).pending).toHaveLength(0)
})

it('shortens the engine’s long regime names', () => {
  expect(shortRegimeName('Entrepreneur account (ettevotluskonto), simplified business income taxation')).toBe('Entrepreneur account')
  expect(shortRegimeName('Sole proprietor (FIE, fuusilisest isikust ettevotja), general regime')).toBe('Sole proprietor')
  expect(shortRegimeName('Custom')).toBe('Custom')
  const countries = [{ code: 'EE', name: 'Estonia', regimes: [{ id: 'fie', name: 'Sole proprietor (FIE), general regime', defaultRate: 4500, hint: '', breakdownRule: '' }] }]
  expect(regimeName(countries, 'EE', 'fie')).toBe('Sole proprietor')
  expect(regimeName(countries, 'EE', 'nope')).toBe('nope')
})

it('shows countries as text badges, not emoji flags that need an emoji font', () => {
  expect(countryBadge('EE')).toBe('EE')
  expect(countryBadge('*')).toBe('ALL')
})
