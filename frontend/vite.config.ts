import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // The backend runs on :8000; the app always calls same-origin /api.
    proxy: { '/api': 'http://localhost:8000' },
    // Lets the simulator import ../demo/scenarios.json.
    fs: { allow: ['..'] },
  },
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}'],
  },
})
