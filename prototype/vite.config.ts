import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5199,
    strictPort: true,
    // The backend runs on :8000; the app always calls same-origin /api (REST and the SSE stream).
    proxy: { '/api': 'http://localhost:8000' },
    // Lets the app import ../fixtures and ../demo JSON.
    fs: { allow: ['..'] },
  },
})
