import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, expect, it, vi } from 'vitest'

import App from '../App.tsx'
import { StoreProvider } from '../state/store.tsx'
import { acme, john, stubApi } from '../test/fakeApi.ts'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

const open = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <StoreProvider>
        <App />
      </StoreProvider>
    </MemoryRouter>,
  )

it('tells the story of a client payment, step by step', async () => {
  stubApi(true, [acme, john])
  open('/transactions/t1')
  const sheet = await screen.findByRole('dialog', { name: 'Payment from Acme Inc.' })
  await within(sheet).findByText('How Tax Jar handled it')
  const steps = within(sheet).getAllByRole('listitem').map((li) => li.textContent)
  expect(steps[0]).toContain('$1,500.00 into your USD balance')
  expect(steps[1]).toContain('Recognised as work income')
  expect(steps[1]).toContain('company sender')
  expect(steps[2]).toContain('20% set aside for tax')
  expect(steps[2]).toContain('$300.00 from your USD balance, converted to €276.00')
  expect(steps[3]).toContain('In your Tax Jar')
  expect(within(sheet).getByRole('button', { name: 'This wasn’t income' })).toBeTruthy()
})

it('the breakdown button opens each tax as a share of the payment', async () => {
  stubApi(true, [acme])
  open('/transactions/t1')
  const button = await screen.findByRole('button', { name: /How is €276\.00 worked out\?/ })
  expect(button.getAttribute('aria-expanded')).toBe('false')
  expect(button.textContent).toContain('20% of this payment: 12% social tax, 8% income tax')
  expect(screen.queryByRole('table')).toBeNull()

  fireEvent.click(button)
  expect(button.getAttribute('aria-expanded')).toBe('true')
  const rows = within(screen.getByRole('table')).getAllByRole('row').map((r) => r.textContent)
  expect(rows[1]).toBe('Social tax12%$180.00€165.60')
  expect(rows[2]).toBe('Income tax8%$120.00€110.40')
  expect(rows[3]).toBe('Set aside20%$300.00€276.00')
  expect(rows[4]).toBe('Yours to keep80%$1,200.00')
  expect(screen.getByText(/Converted at 1 USD = 0\.92 EUR/)).toBeTruthy()
  expect(screen.getByText(/The law splits it this way: 20% of each payment: 8% income tax, 12% social tax\./)).toBeTruthy()
})

it('an unclear payment waits for an answer and sends it', async () => {
  const calls = stubApi(true, [acme, john])
  open('/transactions/t2')
  const sheet = await screen.findByRole('dialog', { name: 'Payment from John Smith' })
  await within(sheet).findByText('Not sure if this is for work')
  expect(within(sheet).getByText(/If it’s for work, 20% \(€80\) goes to your Tax Jar\./)).toBeTruthy()
  expect(within(sheet).queryByRole('button', { name: /How is/ })).toBeNull()

  fireEvent.click(within(sheet).getByRole('button', { name: 'Yes, it’s for work' }))
  await vi.waitFor(() => expect(calls.some((c) => c.url === '/api/transactions/t2/answer' && c.method === 'POST')).toBe(true))
  expect(calls.find((c) => c.url === '/api/transactions/t2/answer')?.body).toEqual({ isIncome: true })
})

it('says so when the payment does not exist', async () => {
  stubApi(true, [acme])
  open('/transactions/nope')
  expect(await screen.findByText('We can’t find that payment')).toBeTruthy()
})
