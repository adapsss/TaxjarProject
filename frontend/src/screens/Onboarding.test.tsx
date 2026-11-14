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
  fireEvent.click(within(screen.getByRole('navigation', { name: 'Main' })).getByRole('link', { name: 'Tax Jar' }))
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

it('tapping Settings inside the "Change" flow takes you back to the summary, not nowhere', async () => {
  stubApi(true)
  open('/onboarding')
  fireEvent.click(await screen.findByRole('button', { name: /Change/ }))
  expect(await screen.findByRole('heading', { name: 'Where do you pay taxes?' })).toBeTruthy()
  fireEvent.click(within(screen.getByRole('navigation', { name: 'Main' })).getByRole('link', { name: 'Settings' }))
  expect(await screen.findByRole('heading', { name: 'Tax settings' })).toBeTruthy()
})

it('tapping Settings with an unsaved region switch asks first, and leaving starts the summary fresh', async () => {
  stubApi(true)
  await switchToPoland()
  fireEvent.click(within(screen.getByRole('navigation', { name: 'Main' })).getByRole('link', { name: 'Settings' }))
  fireEvent.click(await screen.findByRole('button', { name: 'Leave without saving' }))
  expect(await screen.findByRole('heading', { name: 'Tax settings' })).toBeTruthy()
  expect(screen.getAllByText(/Estonia/).length).toBeGreaterThan(0)
  expect(screen.queryByText(/Poland/)).toBeNull()
})

it('the arrow on the country list steps back to the summary and drops the half-made pick', async () => {
  stubApi(true)
  await switchToPoland()
  fireEvent.click(screen.getByRole('button', { name: 'Back' }))
  expect(await screen.findByRole('heading', { name: 'Tax settings' })).toBeTruthy()
  expect(screen.queryByRole('dialog', { name: 'Are you sure?' })).toBeNull()
  // Nothing is left to lose: the way out is open again.
  fireEvent.click(screen.getByRole('button', { name: 'Back to Tax Jar' }))
  expect(screen.queryByRole('dialog', { name: 'Are you sure?' })).toBeNull()
})
