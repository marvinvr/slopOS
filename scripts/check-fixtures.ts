import { readdir, readFile, stat } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { compileApp } from '../server/apps/compile'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

type Failure = { name: string; errors: string[] }

async function main(): Promise<void> {
  const failures: Failure[] = []
  const appsDir = path.join(root, 'fixtures/apps')
  const names = (await readdir(appsDir)).sort()
  for (const name of names) {
    const file = path.join(appsDir, name, 'app.tsx')
    try {
      if (!(await stat(file)).isFile()) continue
    } catch {
      continue
    }
    const source = await readFile(file, 'utf8')
    const result = await compileApp(source)
    if (!result.ok) failures.push({ name, errors: result.errors.map(formatError) })
    else console.log(`ok  fixtures/apps/${name}`)
  }

  const doc = await readFile(path.join(root, 'docs/APP_SDK.md'), 'utf8')
  let example = 0
  for (const match of doc.matchAll(/```tsx\n([\s\S]*?)```/g)) {
    const source = match[1] ?? ''
    if (!source.includes('export default')) continue
    example += 1
    const result = await compileApp(source)
    const name = `docs/APP_SDK.md example ${example}`
    if (!result.ok) failures.push({ name, errors: result.errors.map(formatError) })
    else console.log(`ok  ${name}`)
  }
  if (example < 3) failures.push({ name: 'docs/APP_SDK.md', errors: [`expected at least 3 example apps, found ${example}`] })

  if (failures.length) {
    for (const failure of failures) {
      console.error(`\n${failure.name}`)
      for (const error of failure.errors) console.error(`  ${error}`)
    }
    process.exit(1)
  }
}

function formatError(error: { message: string; line?: number }): string {
  return error.line ? `line ${error.line}: ${error.message}` : error.message
}

await main()
