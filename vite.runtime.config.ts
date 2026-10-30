import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'

const root = path.resolve(import.meta.dirname)

// Shared runtime loaded inside sandboxed app frames. Entry names stay stable
// because frame.html's import map points at them (react, jsx-runtime, sdk).
// App bundles import react / jsx-runtime / @slop/sdk as bare specifiers. frame.html's
// import map points those at the shims below. Bootstrap, the shims, and the SDK share
// Rollup chunks, so the frame and the app use one React.
export default defineConfig({
  // Served at /runtime/. Vite's preload helper joins `base` onto dynamic chunk
  // deps, so without this those requests land at /chunks/ and 404.
  base: '/runtime/',
  plugins: [react()],
  publicDir: path.join(root, 'runtime/static'),
  resolve: {
    alias: {
      '@slop/sdk': path.join(root, 'runtime/sdk/index.ts'),
    },
  },
  build: {
    outDir: path.join(root, 'dist/runtime'),
    emptyOutDir: true,
    cssCodeSplit: false,
    rollupOptions: {
      input: {
        bootstrap: path.join(root, 'runtime/bootstrap.ts'),
        react: path.join(root, 'runtime/shims/react.ts'),
        'jsx-runtime': path.join(root, 'runtime/shims/jsx-runtime.ts'),
        sdk: path.join(root, 'runtime/shims/sdk.ts'),
      },
      output: {
        format: 'es',
        entryFileNames: '[name].js',
        chunkFileNames: 'chunks/[name]-[hash].js',
        assetFileNames: (info) => {
          const name = info.names?.[0] ?? ''
          if (name.endsWith('.css')) return 'runtime.css'
          return 'assets/[name]-[hash][extname]'
        },
      },
      preserveEntrySignatures: 'strict',
    },
  },
})
