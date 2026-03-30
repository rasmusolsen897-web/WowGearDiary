import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Vercel build — standard Vite output (no singlefile inlining).
// API calls to /api/* are proxied by Vercel to serverless functions.
export default defineConfig({
  plugins: [react()],
  build: {
    target: 'esnext',
  },
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
})
