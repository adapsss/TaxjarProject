import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, expect, it, vi } from 'vitest'

import App from '../App.tsx'
import { StoreProvider } from '../state/store.tsx'
import { stubApi } from '../test/fakeApi.ts'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

const open = (path: string) =>
  render(
    <MemoryRouter initialEntries={['/tax-jar', path]} initialIndex={1}>
      <StoreProvider>
        <Routes>
          <Route path="*" element={<App />} />
        </Routes>
      </StoreProvider>
    </MemoryRouter>,
  )

/** Settings of an onboarded account, switched to Poland but not saved. */
async function switchToPoland() {
  open('/onboarding')
  fireEvent.click(await screen.findByRole('button', { name: /Change/ }))
  fireEvent.click(await screen.findByRole('radio', { name: 'Poland' }))
}

it('leaves settings straight away when nothing was changed', async () => {
  stubApi(true)
  open('/onboarding')
  fireEvent.click(await screen.findByRole('button', { name: 'Back to Tax Jar' }))
  expect(screen.queryByRole('dialog', { name: 'Are you sure?' })).toBeNull()
})

it('asks "Are you sure?" before leaving while switching region, and names both regions', async () => {
  stubApi(true)
  await switchToPoland()
  fireEvent.click(await screen.findByRole('button', { name: /Back|Close/ }))
  const sheet = await screen.findByRole('dialog', { name: 'Are you sure?' })
  expect(within(sheet).getByText(/switching your tax region from Estonia to Poland/)).toBeTruthy()
  expect(within(sheet).getByText(/your Tax Jar keeps using Estonia/)).toBeTruthy()
})

it('the tab bar asks too, and "Keep editing" stays on settings with the changes intact', async () => {
  stubApi(true)
  await switchToPoland()
  fireEvent.click(within(screen.getByRole('navigation', { name: 'Main' })).getByRole('link', { name: 'Home' }))
  const sheet = await screen.findByRole('dialog', { name: 'Are you sure?' })
  fireEvent.click(within(sheet).getByRole('button', { name: 'Keep editing' }))
  expect(screen.queryByRole('dialog', { name: 'Are you sure?' })).toBeNull()
  // Still choosing: Poland is still selected.
  expect(screen.getByRole('radio', { name: 'Poland' }).getAttribute('aria-checked')).toBe('true')
})

it('"Leave without saving" goes where the person was heading', async () => {
  stubApi(true)
  await switchToPoland()
  fireEvent.click(within(screen.getByRole('navigation', { name: 'Main' })).getByRole('link', { name: 'Payments' }))
  fireEvent.click(await screen.findByRole('button', { name: 'Leave without saving' }))
  expect(await screen.findByRole('heading', { name: 'Payments' })).toBeTruthy()
  expect(screen.queryByRole('dialog', { name: 'Are you sure?' })).toBeNull()
})

it('the browser is asked to confirm closing or reloading while changes are unsaved', async () => {
  stubApi(true)
  await switchToPoland()
  const event = new Event('beforeunload', { cancelable: true })
  window.dispatchEvent(event)
  expect(event.defaultPrevented).toBe(true)
})

it('does not guard after the changes are undone', async () => {
  stubApi(true)
  await switchToPoland()
  // Undo the change: pick Estonia and its regime again. Settings then match what is saved.
  fireEvent.click(await screen.findByRole('radio', { name: 'Estonia' }))
  fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
  fireEvent.click(await screen.findByRole('radio', { name: /Entrepreneur/ }))
  const event = new Event('beforeunload', { cancelable: true })
  window.dispatchEvent(event)
  expect(event.defaultPrevented).toBe(false)
})
