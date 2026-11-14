// Inter is bundled (no CDN): the demo must work with no network.
import '@fontsource-variable/inter'
// Display headlines: heavy, condensed, upper-case, in the spirit of Wise's own display face.
import '@fontsource-variable/archivo/wdth.css'
import './index.css'

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'

import App from './App.tsx'
import { ErrorBoundary } from './components/ErrorBoundary.tsx'
import { StoreProvider } from './state/store.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <BrowserRouter>
        <StoreProvider>
          <App />
        </StoreProvider>
      </BrowserRouter>
    </ErrorBoundary>
  </StrictMode>,
)
