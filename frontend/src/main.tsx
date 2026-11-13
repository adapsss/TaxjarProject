import '@transferwise/neptune-css/dist/css/neptune.css'
import '@transferwise/components/build/main.css'
import './index.css'

import { Provider } from '@transferwise/components'
import en from '@transferwise/components/build/i18n/en.json'
import { ThemeProvider } from '@wise/components-theming'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'

import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider theme="personal">
      <Provider i18n={{ locale: 'en', messages: en }}>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </Provider>
    </ThemeProvider>
  </StrictMode>,
)
