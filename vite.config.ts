import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'

const root = path.resolve(import.meta.dirname)

export default defineConfig({
  root: path.join(root, 'web'),
  plugins: [react()],
  build: {
    outDir: path.join(root, 'dist/web'),
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    host: '0.0.0.0',
    strictPort: true,
    proxy: {
      '/api': { target: 'http://127.0.0.1:4748', changeOrigin: true },
      '/runtime': { target: 'http://127.0.0.1:4748', changeOrigin: true },
    },
  },
})
