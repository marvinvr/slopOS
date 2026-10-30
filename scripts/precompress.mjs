import { readdir, readFile, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { brotliCompressSync, gzipSync, constants } from 'node:zlib'

const TEXT = new Set(['.html', '.js', '.mjs', '.css', '.svg', '.json', '.map', '.txt'])
const MIN = 1024

async function walk(dir, files) {
  let entries = []
  try {
    entries = await readdir(dir, { withFileTypes: true })
  } catch {
    return
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) await walk(full, files)
    else if (entry.isFile()) files.push(full)
  }
}

// The boot chunk's name is hashed. Point the frame at it so the iframe can
// fetch that graph with the document, instead of after bootstrap.js returns.
const bootstrap = await readFile('dist/runtime/bootstrap.js', 'utf8')
const chunkHrefs = [...bootstrap.matchAll(/(?:from"|import")([^"]*chunks\/[^"]+\.js)"/g)].map((match) => {
  const spec = match[1]
  if (spec.startsWith('/runtime/')) return spec
  if (spec.startsWith('./')) return `/runtime/${spec.slice(2)}`
  if (spec.startsWith('/')) return `/runtime${spec}`
  return `/runtime/${spec}`
})
const uniqueHrefs = [...new Set(chunkHrefs)]
if (uniqueHrefs.length) {
  const framePath = 'dist/runtime/frame.html'
  let html = await readFile(framePath, 'utf8')
  html = html.replace(/\n\s*<link rel="modulepreload" href="\/runtime\/chunks\/[^"]+" data-runtime-chunks \/>/g, '')
  const links = uniqueHrefs.map((href) => `    <link rel="modulepreload" href="${href}" data-runtime-chunks />`).join('\n')
  html = html.replace('    <script type="module" src="/runtime/bootstrap.js"></script>', `${links}\n    <script type="module" src="/runtime/bootstrap.js"></script>`)
  await writeFile(framePath, html)
}

const files = []
for (const root of ['dist/web', 'dist/runtime']) await walk(root, files)

let count = 0
let rawBytes = 0
let gzBytes = 0
let brBytes = 0
for (const file of files) {
  const ext = path.extname(file).toLowerCase()
  if (!TEXT.has(ext)) continue
  const info = await stat(file)
  if (info.size < MIN) continue
  const raw = await readFile(file)
  const gz = gzipSync(raw, { level: 8 })
  const br = brotliCompressSync(raw, {
    params: {
      [constants.BROTLI_PARAM_QUALITY]: 6,
      [constants.BROTLI_PARAM_SIZE_HINT]: raw.length,
    },
  })
  await writeFile(`${file}.gz`, gz)
  await writeFile(`${file}.br`, br)
  count += 1
  rawBytes += raw.length
  gzBytes += gz.length
  brBytes += br.length
}

console.log(`precompressed ${count} text assets (${rawBytes} → gzip ${gzBytes}, brotli ${brBytes})`)
