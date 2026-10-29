import * as esbuild from 'esbuild'
import type { CompileError, CompileResult } from './types'

const ALLOWED = new Set(['react', 'react/jsx-runtime', 'react/jsx-dev-runtime', '@slop/sdk'])

/**
 * Validate and compile a single-file app to ESM.
 * `react`, `react/jsx-runtime`, and `@slop/sdk` stay external so the sandboxed
 * frame resolves them through its import map (one shared React).
 * Pass C calls this to validate Grok's output before saving a version.
 */
export async function compileApp(source: string): Promise<CompileResult> {
  const importErrors = scanImports(source)
  if (importErrors.length) return { ok: false, errors: importErrors }
  if (!hasDefaultExport(source)) {
    return {
      ok: false,
      errors: [{ message: 'App must have a default export: export default function App() { ... }' }],
    }
  }

  try {
    const result = await esbuild.build({
      stdin: { contents: source, loader: 'tsx', sourcefile: 'app.tsx' },
      bundle: true,
      format: 'esm',
      platform: 'browser',
      target: 'es2022',
      jsx: 'automatic',
      write: false,
      minify: false,
      legalComments: 'none',
      logLevel: 'silent',
      plugins: [
        {
          name: 'slop-import-whitelist',
          setup(build) {
            build.onResolve({ filter: /.*/ }, (args) => {
              if (args.kind === 'entry-point') return null
              if (ALLOWED.has(args.path)) return { path: args.path, external: true }
              return {
                errors: [
                  {
                    text: `Forbidden import "${args.path}". Apps may only import from "react" and "@slop/sdk".`,
                  },
                ],
              }
            })
          },
        },
      ],
    })
    const code = result.outputFiles[0]?.text ?? ''
    const leaked = leakedImports(code)
    if (leaked.length) {
      return {
        ok: false,
        errors: leaked.map((spec) => ({
          message: `Forbidden import "${spec}". Apps may only import from "react" and "@slop/sdk".`,
        })),
      }
    }
    return { ok: true, code }
  } catch (err) {
    const failure = err as { errors?: { text: string; location?: { line?: number; column?: number } }[] }
    if (failure.errors?.length) {
      return {
        ok: false,
        errors: failure.errors.map((item) => ({
          message: item.text,
          line: item.location?.line,
          column: item.location?.column,
        })),
      }
    }
    return { ok: false, errors: [{ message: err instanceof Error ? err.message : 'Compile failed' }] }
  }
}

/** JS module that throws, so a bad app still loads as ESM and the frame can show the message. */
export function compileErrorModule(errors: CompileError[]): string {
  const message = errors
    .map((error) => (error.line ? `${error.message} (line ${error.line})` : error.message))
    .join('\n')
  return `throw new Error(${JSON.stringify(message)});\n`
}

function scanImports(source: string): CompileError[] {
  const errors: CompileError[] = []
  const lines = stripComments(source).split('\n')
  lines.forEach((line, index) => {
    const specs = new Set<string>()
    for (const match of line.matchAll(/\bfrom\s+['"]([^'"]+)['"]/g)) specs.add(match[1])
    for (const match of line.matchAll(/\bimport\s+['"]([^'"]+)['"]/g)) specs.add(match[1])
    for (const match of line.matchAll(/\bimport\s*\(\s*['"]([^'"]+)['"]/g)) specs.add(match[1])
    for (const match of line.matchAll(/\brequire\s*\(\s*['"]([^'"]+)['"]/g)) specs.add(match[1])
    for (const spec of specs) {
      if (!ALLOWED.has(spec)) {
        errors.push({
          message: `Forbidden import "${spec}". Apps may only import from "react" and "@slop/sdk".`,
          line: index + 1,
        })
      }
    }
  })
  return errors
}

function leakedImports(code: string): string[] {
  const found = new Set<string>()
  for (const match of code.matchAll(/\bfrom\s*['"]([^'"]+)['"]/g)) {
    if (!ALLOWED.has(match[1])) found.add(match[1])
  }
  return [...found]
}

function hasDefaultExport(source: string): boolean {
  const stripped = stripComments(source)
  return /export\s+default\b/.test(stripped) || /export\s*\{[^}]*\bas\s+default\b/.test(stripped)
}

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:\\])\/\/.*$/gm, '$1')
}
