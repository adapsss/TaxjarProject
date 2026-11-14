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
  expect(within(sheet).getByRole('button', { name: 'Mark as personal instead' })).toBeTruthy()
})

it('the breakdown button opens each tax as a share of the payment', async () => {
  stubApi(true, [acme])
  open('/transactions/t1')
  const button = await screen.findByRole('button', { name: /How is €276\.00 worked out\?/ })
  expect(button.getAttribute('aria-expanded')).toBe('false')
  expect(button.textContent).toContain('20% of this payment · income tax + social tax')
  expect(screen.queryByRole('table')).toBeNull()

  fireEvent.click(button)
  expect(button.getAttribute('aria-expanded')).toBe('true')
  const rows = within(screen.getByRole('table')).getAllByRole('row').map((r) => r.textContent)
  expect(rows[1]).toBe('Income tax8% of this payment$120.00€110.40')
  expect(rows[2]).toBe('Social tax12% of this payment$180.00€165.60')
  expect(rows[3]).toBe('Set aside20% of this payment$300.00€276.00')
  expect(rows[4]).toBe('Yours to keep80% of this payment$1,200.00')
  expect(screen.getByText(/Converted at 1 USD = 0\.92 EUR/)).toBeTruthy()
  expect(screen.getByText(/The law fixes this split for your regime, so these are exact\./)).toBeTruthy()
})

it('an unclear payment waits for an answer and sends it', async () => {
  const calls = stubApi(true, [acme, john])
  open('/transactions/t2')
  const sheet = await screen.findByRole('dialog', { name: 'Payment from John Smith' })
  await within(sheet).findByText('Not sure if this is for work')
  expect(within(sheet).getByText(/If it’s for work, 20% \(€80\) goes to your Tax Jar\./)).toBeTruthy()
  expect(within(sheet).queryByRole('button', { name: /How is/ })).toBeNull()

  fireEvent.click(within(sheet).getByRole('button', { name: /Yes, it’s for work/ }))
  await vi.waitFor(() => expect(calls.some((c) => c.url === '/api/transactions/t2/answer' && c.method === 'POST')).toBe(true))
  expect(calls.find((c) => c.url === '/api/transactions/t2/answer')?.body).toEqual({ isIncome: true })
})

it('says so when the payment does not exist', async () => {
  stubApi(true, [acme])
  open('/transactions/nope')
  expect(await screen.findByText('We can’t find that payment')).toBeTruthy()
})

it('looks the same in a country with no exact split: same rows, "On your return" for the amounts', async () => {
  const poland = { ...acme, reservation: { ...acme.reservation, rate: 3320, breakdown: null, sourceAmount: 49800, reservedAmount: 45816 } }
  stubApi(true, [poland], 3320, { country: 'PL', regime: 'scale' })
  open('/transactions/t1')
  fireEvent.click(await screen.findByRole('button', { name: /worked out\?/ }))
  const rows = within(screen.getByRole('table')).getAllByRole('row').map((r) => r.textContent)
  // Same four rows as Estonia: two taxes, set aside, yours to keep.
  expect(rows).toHaveLength(5)
  expect(rows[1]).toMatch(/^Income tax.*On your return$/)
  expect(rows[2]).toMatch(/^Social tax.*On your return$/)
  expect(rows[3]).toBe('Set aside33.2% of this payment$498.00€458.16')
  expect(screen.getByText(/worked out on your return/)).toBeTruthy()
})

it('says in one glance whether a payment is taxed, and who decided', async () => {
  stubApi(true, [acme, john])
  open('/transactions/t1')
  const taxed = await screen.findByRole('dialog', { name: 'Payment from Acme Inc.' })
  expect(await within(taxed).findByText('Work income · tax set aside')).toBeTruthy()
  expect(within(taxed).getByText('Decided automatically')).toBeTruthy()
  cleanup()

  open('/transactions/t2')
  const waiting = await screen.findByRole('dialog', { name: 'Payment from John Smith' })
  // The verdict at the top and the step in the timeline both say it.
  expect((await within(waiting).findAllByText('Waiting for your answer')).length).toBe(2)
  expect(within(waiting).getByText('Work income or personal?')).toBeTruthy()
  // Each choice says what it does in money.
  expect(within(waiting).getByText('Tax: €80 (20%) goes to your Tax Jar')).toBeTruthy()
  expect(within(waiting).getByText('No tax: the whole €400 stays yours')).toBeTruthy()
})

it('a payment the user marked personal says so', async () => {
  const mari = { ...john, id: 't3', counterparty: { name: 'Mari Tamm', kind: 'person', isKnownClient: false }, classification: { label: 'personal', confidence: 0.99, reasons: ['you said this wasn’t for work'] } }
  stubApi(true, [acme, mari])
  open('/transactions/t3')
  const sheet = await screen.findByRole('dialog', { name: 'Payment from Mari Tamm' })
  expect(await within(sheet).findByText('Personal · no tax taken')).toBeTruthy()
  expect(within(sheet).getByText('You decided this')).toBeTruthy()
})

it('a personal payment can be marked as work income, which sets its tax aside', async () => {
  const mari = { ...john, id: 't3', counterparty: { name: 'Mari Tamm', kind: 'person', isKnownClient: false }, amount: 2300, classification: { label: 'personal', confidence: 0.9, reasons: ['sent by a person'] } }
  const calls = stubApi(true, [acme, mari])
  open('/transactions/t3')
  const sheet = await screen.findByRole('dialog', { name: 'Payment from Mari Tamm' })
  expect(within(sheet).queryByRole('button', { name: 'Mark as personal instead' })).toBeNull()
  expect(within(sheet).getByText(/Tax: €4\.60 \(20%\) goes from your EUR balance to your Tax Jar\./)).toBeTruthy()

  fireEvent.click(within(sheet).getByRole('button', { name: 'Mark as work income instead' }))
  await vi.waitFor(() => expect(calls.some((c) => c.url === '/api/transactions/t3/mark-income' && c.method === 'POST')).toBe(true))
})

it('offers no way to mark income while the Tax Jar is off, or on a payment already taxed', async () => {
  const mari = { ...john, id: 't3', counterparty: { name: 'Mari Tamm', kind: 'person', isKnownClient: false }, classification: { label: 'personal', confidence: 0.9, reasons: [] } }
  stubApi(false, [mari])
  open('/transactions/t3')
  const off = await screen.findByRole('dialog', { name: 'Payment from Mari Tamm' })
  await within(off).findByText('How Tax Jar handled it')
  expect(within(off).queryByRole('button', { name: /Mark as work income/ })).toBeNull()
  cleanup()

  stubApi(true, [acme])
  open('/transactions/t1')
  const taxed = await screen.findByRole('dialog', { name: 'Payment from Acme Inc.' })
  await within(taxed).findByText('How Tax Jar handled it')
  expect(within(taxed).queryByRole('button', { name: /Mark as work income/ })).toBeNull()
})

it('a custom tax percentage shows no tax breakdown, where the law defines none for it', async () => {
  const custom = { ...acme, reservation: { ...acme.reservation, rate: 2500, breakdown: null, sourceAmount: 37500, reservedAmount: 34500 } }
  stubApi(true, [custom], 2500)
  open('/transactions/t1')
  const sheet = await screen.findByRole('dialog', { name: 'Payment from Acme Inc.' })
  await within(sheet).findByText('In your Tax Jar')
  expect(within(sheet).queryByRole('button', { name: /worked out\?/ })).toBeNull()
})

it('still shows the exact split for a rate the regime itself defines, such as the pension option', async () => {
  const pension = { ...acme, reservation: { ...acme.reservation, rate: 2200, breakdown: [{ id: 'income_tax', name: 'Income tax', amount: 11040 }, { id: 'social_tax', name: 'Social tax', amount: 16560 }, { id: 'pension', name: 'Funded pension', amount: 2760 }] } }
  stubApi(true, [pension], 2200)
  open('/transactions/t1')
  expect(await screen.findByRole('button', { name: /worked out\?/ })).toBeTruthy()
})

it('a non-exact regime at its own suggested rate still shows its rule lines', async () => {
  const poland = { ...acme, reservation: { ...acme.reservation, rate: 3320, breakdown: null } }
  stubApi(true, [poland], 3320, { country: 'PL', regime: 'scale' })
  open('/transactions/t1')
  expect(await screen.findByRole('button', { name: /worked out\?/ })).toBeTruthy()
})
