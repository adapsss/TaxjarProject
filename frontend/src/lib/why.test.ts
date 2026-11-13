import { expect, it } from 'vitest'
import type { Transaction } from '../api/client'
import { tagFor, whyLine } from './why'

const tx = (over: Partial<Transaction> = {}): Transaction => ({
  id: 't1',
  direction: 'in',
  amount: 40000,
  currency: 'EUR',
  counterparty: { name: 'John Smith', kind: 'person', isKnownClient: false },
  reference: 'website',
  createdAt: '2026-11-13T10:00:00Z',
  classification: { label: 'unknown', confidence: 0.49, reasons: [] },
  reservationId: null,
  reservation: null,
  ...over,
})
const reservation = (status: 'reserved' | 'undone' | 'paid') => ({
  id: 'r1', transactionId: 't1', sourceAmount: 8000, sourceCurrency: 'EUR', rate: 2000,
  fxRate: 1, reservedAmount: 8000, taxCurrency: 'EUR', status,
})

it('joins reasons into the why line', () => {
  expect(whyLine(['company sender', 'invoice in reference'])).toBe('Why: company sender · invoice in reference')
  expect(whyLine([])).toBe('')
})

it('tags reserved and paid transactions', () => {
  expect(tagFor(tx({ reservation: reservation('reserved') }), true)).toBe('Tax set aside')
  expect(tagFor(tx({ reservation: reservation('paid') }), true)).toBe('Tax paid')
})

it('asks only once the Tax Jar is set up', () => {
  expect(tagFor(tx(), true)).toBe('Needs your answer')
  expect(tagFor(tx(), false)).toBeNull()
})

it('tags personal incoming payments, and nothing outgoing', () => {
  const personal = { label: 'personal' as const, confidence: 0.9, reasons: [] }
  expect(tagFor(tx({ classification: personal }), true)).toBe('Personal')
  expect(tagFor(tx({ classification: personal, direction: 'out' }), true)).toBeNull()
})

it('an undone reservation falls back to the classification', () => {
  const personal = { label: 'personal' as const, confidence: 0.99, reasons: [] }
  expect(tagFor(tx({ reservation: reservation('undone'), classification: personal }), true)).toBe('Personal')
})
