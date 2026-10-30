import { defineConfig } from 'vite'
import path from 'node:path'

const root = path.resolve(import.meta.dirname)

// The runtime that runs first inside every generated screen: one classic script (hook.js)
// and one stylesheet (screen.css: fonts + design tokens). An IIFE, so nothing leaks into the
// screen's own global scope.
export default defineConfig({
  base: '/runtime/',
  publicDir: false,
  build: {
    outDir: path.join(root, 'dist/runtime'),
    // build-runtime.mjs adds tailwind.js and react.js next to these; a watch rebuild must keep them.
    emptyOutDir: false,
    cssCodeSplit: false,
    rollupOptions: {
      input: path.join(root, 'runtime/hook.ts'),
      output: {
        format: 'iife',
        entryFileNames: 'hook.js',
        assetFileNames: (info) => {
          const name = info.names?.[0] ?? ''
          if (name.endsWith('.css')) return 'screen.css'
          return 'assets/[name]-[hash][extname]'
        },
      },
    },
  },
})
