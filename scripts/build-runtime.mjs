// The runtime that goes into every generated screen, next to hook.js + screen.css (vite):
// Tailwind's browser build as is, and React + htm as one optional ES module.
import { copyFile } from 'node:fs/promises'
import { build } from 'esbuild'

await copyFile('node_modules/@tailwindcss/browser/dist/index.global.js', 'dist/runtime/tailwind.js')
await build({
  entryPoints: ['runtime/react.ts'],
  outfile: 'dist/runtime/react.js',
  bundle: true,
  format: 'esm',
  minify: true,
  define: { 'process.env.NODE_ENV': '"production"' },
  logLevel: 'warning',
})
