// A fake backend for component tests: fixed answers for the GET routes the store reads on load.
import { vi } from 'vitest'

export const account = { owner: 'Kadri Saar', balances: [{ currency: 'EUR', amount: 245000 }], jars: [] }

/** Acme's $1,500 invoice with 20% reserved: $300 → €276, split 8% income tax and 12% social tax. */
export const acme = {
  id: 't1', direction: 'in', amount: 150000, currency: 'USD',
  counterparty: { name: 'Acme Inc.', kind: 'company', isKnownClient: false },
  reference: 'INV-042', createdAt: '2026-11-13T10:00:00Z',
  classification: { label: 'income', confidence: 0.97, reasons: ['company sender', 'invoice in reference'] },
  reservationId: 'r1',
  reservation: {
    id: 'r1', transactionId: 't1', sourceAmount: 30000, sourceCurrency: 'USD', rate: 2000, fxRate: 0.92,
    reservedAmount: 27600, taxCurrency: 'EUR', status: 'reserved',
    breakdown: [{ id: 'income_tax', name: 'Income tax', amount: 11040 }, { id: 'social_tax', name: 'Social tax', amount: 16560 }],
  },
}

/** John's unclear €400: no reservation, waiting for an answer. */
export const john = {
  id: 't2', direction: 'in', amount: 40000, currency: 'EUR',
  counterparty: { name: 'John Smith', kind: 'unknown', isKnownClient: false },
  reference: 'website', createdAt: '2026-11-13T11:00:00Z',
  classification: { label: 'unknown', confidence: 0.49, reasons: ['sizeable amount'] },
  reservationId: null, reservation: null,
}

const summary = { taxCurrency: 'EUR', totalReserved: 27600, totalPaid: 0, byMonth: [], estimatedDue: 27600, nextDeadline: '2026-12-10', disclaimer: '', breakdown: null, breakdownRule: '' }
const RULE = '20% of each payment: 8% income tax, 12% social tax'

export function stubApi(enabled: boolean, transactions: unknown[] = [acme]) {
  const routes: Record<string, unknown> = {
    '/api/account': account,
    '/api/transactions': enabled ? transactions : transactions.map((t) => ({ ...(t as object), reservation: null, reservationId: null })),
    '/api/tax-profile': { country: 'EE', regime: 'entrepreneur_account', rate: 2000, taxCurrency: 'EUR', enabled },
    '/api/tax/summary': enabled ? summary : { ...summary, totalReserved: 0, estimatedDue: 0 },
    '/api/tax/countries': [{ code: 'EE', name: 'Estonia', currency: 'EUR', regimes: [{ id: 'entrepreneur_account', name: 'Entrepreneur account', defaultRate: 2000, hint: '', breakdownRule: RULE }] }],
    '/api/tax/catch-up': { since: '2026-01-01', count: enabled ? 2 : 0, income: 330000, reserved: 66000, taxCurrency: 'EUR' },
    '/api/demo/scenarios': [
      { id: 'acme', label: 'Client pays $1,500 (Acme Inc.)', senderName: 'Acme Inc.', senderKind: null, amount: 150000, currency: 'USD', reference: 'INV-042', expect: 'income' },
      { id: 'mari', label: 'Friend sends €23 for pizza (Mari)', senderName: 'Mari Tamm', senderKind: 'person', amount: 2300, currency: 'EUR', reference: 'pizza', expect: 'personal' },
      { id: 'john', label: 'Unclear €400 for a website (John)', senderName: 'John Smith', senderKind: null, amount: 40000, currency: 'EUR', reference: 'website', expect: 'unknown' },
    ],
  }
  const calls: { url: string; method: string; body?: unknown }[] = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, method: init?.method ?? 'GET', body: init?.body ? JSON.parse(String(init.body)) : undefined })
      return new Response(JSON.stringify(routes[url] ?? {}))
    }),
  )
  // jsdom has no EventSource; the store only needs it to exist.
  vi.stubGlobal('EventSource', class { addEventListener() {} close() {} })
  return calls
}
