import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, expect, it, vi } from 'vitest'

import { StoreProvider } from '../state/store.tsx'
import { acme, john, stubApi } from '../test/fakeApi.ts'
import Activity from './Activity.tsx'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

const renderActivity = () =>
  render(
    <MemoryRouter>
      <StoreProvider>
        <Activity />
      </StoreProvider>
    </MemoryRouter>,
  )

it('an unsure payment asks in its own feed row, with what each choice does in money', async () => {
  stubApi(true, [acme, john])
  renderActivity()
  await screen.findByText('John Smith')
  const row = document.querySelector('[data-tx-id="t2"]') as HTMLElement
  expect(within(row).getByText('Is this payment for work?')).toBeTruthy()
  expect(within(row).getByRole('button', { name: 'For work' })).toBeTruthy()
  expect(within(row).getByRole('button', { name: 'Personal' })).toBeTruthy()
  expect(within(row).getByText('For work: €80 (20%) goes to your Tax Jar. Personal: no tax.')).toBeTruthy()
  // Nothing else asks: no popup, and a payment that is already decided has no buttons.
  expect(screen.queryByRole('dialog')).toBeNull()
  const decided = document.querySelector('[data-tx-id="t1"]') as HTMLElement
  expect(within(decided).queryByText('Is this payment for work?')).toBeNull()
})

it('choosing in the row sends the answer', async () => {
  const calls = stubApi(true, [acme, john])
  renderActivity()
  await screen.findByText('John Smith')
  const row = document.querySelector('[data-tx-id="t2"]') as HTMLElement
  fireEvent.click(within(row).getByRole('button', { name: 'Personal' }))
  await vi.waitFor(() => expect(calls.some((c) => c.url === '/api/transactions/t2/answer' && c.method === 'POST')).toBe(true))
  expect(calls.find((c) => c.url === '/api/transactions/t2/answer')?.body).toEqual({ isIncome: false })
})

it('asks nothing while the Tax Jar is off', async () => {
  stubApi(false, [john])
  renderActivity()
  await screen.findByText('John Smith')
  expect(screen.queryByText('Is this payment for work?')).toBeNull()
})
