import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    // flag-icons has two SVGs per country. Inlined as data URIs they made the stylesheet 467 kB;
    // as files, a browser fetches only the few flags a screen shows.
    assetsInlineLimit: (file) => (file.includes('flag-icons') ? false : undefined),
  },
  server: {
    // The backend runs on :8000; the app always calls same-origin /api (REST and the event stream).
    proxy: { '/api': 'http://localhost:8000' },
  },
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}'],
  },
})
