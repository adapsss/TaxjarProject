import { cleanup, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

import { StoreProvider } from '../state/store.tsx'
import Home from './Home.tsx'

const account = { owner: 'Kadri Saar', balances: [{ currency: 'EUR', amount: 245000 }], jars: [] }
const acme = {
  id: 't1', direction: 'in', amount: 150000, currency: 'USD',
  counterparty: { name: 'Acme Inc.', kind: 'company', isKnownClient: false },
  reference: 'INV-042', createdAt: '2026-11-13T10:00:00Z',
  classification: { label: 'income', confidence: 0.97, reasons: ['company sender', 'invoice in reference'] },
  reservationId: 'r1',
  reservation: { id: 'r1', transactionId: 't1', sourceAmount: 30000, sourceCurrency: 'USD', rate: 2000, fxRate: 0.92, reservedAmount: 27600, taxCurrency: 'EUR', status: 'reserved' },
}
const summary = { taxCurrency: 'EUR', totalReserved: 27600, totalPaid: 0, byMonth: [], estimatedDue: 27600, nextDeadline: '2026-12-10', disclaimer: '' }

function stubApi(enabled: boolean) {
  const routes: Record<string, unknown> = {
    '/api/account': account,
    '/api/transactions': enabled ? [acme] : [{ ...acme, reservation: null, reservationId: null }],
    '/api/tax-profile': { country: 'EE', regime: 'entrepreneur_account', rate: 2000, taxCurrency: 'EUR', enabled },
    '/api/tax/summary': enabled ? summary : { ...summary, totalReserved: 0, estimatedDue: 0 },
    '/api/tax/countries': [{ code: 'EE', name: 'Estonia', regimes: [] }],
  }
  vi.stubGlobal('fetch', vi.fn(async (url: string) => new Response(JSON.stringify(routes[url]))))
}

beforeEach(() => {
  // jsdom has no EventSource; the store only needs it to exist.
  vi.stubGlobal('EventSource', class { addEventListener() {} close() {} })
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

const renderHome = () =>
  render(
    <MemoryRouter>
      <StoreProvider>
        <Home />
      </StoreProvider>
    </MemoryRouter>,
  )

it('shows balances, the feed with its tax tag, and the Tax Jar total from the API', async () => {
  stubApi(true)
  renderHome()
  expect(await screen.findByRole('heading', { name: 'Hi, Kadri' })).toBeTruthy()
  expect(screen.getByText('€2,450.00')).toBeTruthy()
  // The demo controls in the sidebar also name Acme, so look in the page content only.
  expect(within(screen.getByRole('main')).getByText('Acme Inc.')).toBeTruthy()
  expect(screen.getByText('€276 for tax')).toBeTruthy()
  expect(screen.getByText('set aside for taxes')).toBeTruthy()
})

it('offers setup instead of the jar before onboarding', async () => {
  stubApi(false)
  renderHome()
  expect(await screen.findByRole('button', { name: 'Set up in 3 steps' })).toBeTruthy()
  expect(screen.queryByText('€276 for tax')).toBeNull()
})
