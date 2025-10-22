import { defineConfig } from 'vite'

// Vite for static front. Proxies API to wrangler dev locally.
export default defineConfig({
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://127.0.0.1:8787',
      '/healthz': 'http://127.0.0.1:8787',
    },
  },
})

