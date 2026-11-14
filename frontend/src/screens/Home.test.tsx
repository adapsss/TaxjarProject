import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, expect, it, vi } from 'vitest'

import { StoreProvider } from '../state/store.tsx'
import { stubApi } from '../test/fakeApi.ts'
import Home from './Home.tsx'

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
  expect(screen.getByText('Acme Inc.')).toBeTruthy()
  expect(screen.getByText('€276 tax')).toBeTruthy()
  expect(screen.getByText('Set aside for taxes')).toBeTruthy()
})

it('offers setup instead of the jar before onboarding', async () => {
  stubApi(false)
  renderHome()
  expect(await screen.findByRole('button', { name: 'Set up in 3 steps' })).toBeTruthy()
  expect(screen.queryByText('€276 tax')).toBeNull()
})

it('offers to catch up on income from before the Tax Jar', async () => {
  stubApi(true)
  renderHome()
  expect(await screen.findByRole('heading', { name: 'Catch up on 2026 so far?' })).toBeTruthy()
  expect(screen.getByRole('button', { name: 'Set aside €660' })).toBeTruthy()
})
