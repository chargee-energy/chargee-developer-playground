import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    // Route pages are lazy-loaded (see App.tsx), so heavy deps like recharts
    // ship in their own on-demand chunks. The remaining initial chunk is the
    // React/vendor core (~160 kB gzip), which is acceptable here.
    chunkSizeWarningLimit: 600,
  },
})
