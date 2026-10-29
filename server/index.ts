import { createServer } from 'node:http'
import fs from 'node:fs/promises'
import { appsDir, storageDir, workspacesDir, worldDir } from './paths'
import { loadEnv } from './env'
import { applyCors, sendJson } from './http'
import { initGenerator, registerGeneratorRoutes } from './generator'
import { registerRoutes } from './routes'
import { createRouter } from './router'
import { serveRuntime, serveShell } from './static'

loadEnv()

async function ensureDataDirs(): Promise<void> {
  await fs.mkdir(appsDir, { recursive: true })
  await fs.mkdir(storageDir, { recursive: true })
  await fs.mkdir(workspacesDir, { recursive: true })
  await fs.mkdir(worldDir, { recursive: true })
}

const router = createRouter()
registerRoutes(router)
registerGeneratorRoutes(router)

const server = createServer((req, res) => {
  void (async () => {
    applyCors(res)
    if (req.method === 'OPTIONS') {
      res.writeHead(204)
      res.end()
      return
    }
    if (await router.handle(req, res)) return
    if (await serveRuntime(req, res)) return
    if (await serveShell(req, res)) return
    sendJson(res, 404, { error: 'not found' })
  })().catch((err) => {
    console.error(err)
    if (!res.headersSent) sendJson(res, 500, { error: 'internal error' })
    else res.end()
  })
})

const port = Number(process.env.PORT) || 4747
const host = '0.0.0.0'

await ensureDataDirs()
await initGenerator()
server.listen(port, host, () => {
  console.log(`slopOS listening on http://${host}:${port}`)
})
