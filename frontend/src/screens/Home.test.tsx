import { Provider } from '@transferwise/components'
import en from '@transferwise/components/build/i18n/en.json'
import { cleanup, render, screen } from '@testing-library/react'
import { ThemeProvider } from '@wise/components-theming'
import { afterEach, expect, it, vi } from 'vitest'

import Home from './Home.tsx'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

// Checkpoint 0: Neptune renders under our React version and the app reads the API.
it('shows the account owner in a Neptune button', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(JSON.stringify({ owner: 'Kadri Saar', balances: [], jars: [] }))),
  )
  render(
    <ThemeProvider theme="personal">
      <Provider i18n={{ locale: 'en', messages: en }}>
        <Home />
      </Provider>
    </ThemeProvider>,
  )
  const button = await screen.findByRole('button', { name: 'Kadri Saar' })
  expect(button.className).toContain('wds-Button')
})
