import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'

/**
 * Canonical path for containment checks.
 * `/tmp` is a symlink of `/private/tmp` on macOS, and agents send absolute paths
 * that do not match a realpath'd workspace unless both sides are resolved.
 */
function canonical(target: string): string {
  const resolved = path.resolve(target)
  try {
    return fs.realpathSync(resolved)
  } catch {
    /* the leaf may not exist yet */
  }
  const parent = path.dirname(resolved)
  try {
    return path.join(fs.realpathSync(parent), path.basename(resolved))
  } catch {
    return resolved
  }
}

export function isInside(root: string, candidate: string): boolean {
  const base = canonical(root)
  const target = path.isAbsolute(candidate) ? canonical(candidate) : canonical(path.resolve(base, candidate))
  if (target === base) return true
  const prefix = base.endsWith(path.sep) ? base : base + path.sep
  return target.startsWith(prefix)
}

/** Resolve a path and refuse anything that escapes `root`, including via symlinks. */
export async function resolveInside(root: string, candidate: string): Promise<string> {
  const base = canonical(root)
  const raw = path.isAbsolute(candidate) ? path.resolve(candidate) : path.resolve(base, candidate)
  if (!isInside(base, raw)) throw new Error('path escapes the workspace')
  try {
    const real = await fsp.realpath(raw)
    if (!isInside(base, real)) throw new Error('path escapes the workspace')
    return real
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err
  }
  const parent = path.dirname(raw)
  try {
    const realParent = await fsp.realpath(parent)
    const joined = path.join(realParent, path.basename(raw))
    if (!isInside(base, joined)) throw new Error('path escapes the workspace')
    return joined
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      if (!isInside(base, raw)) throw new Error('path escapes the workspace')
      return raw
    }
    throw err
  }
}

const DENY_NAME = /terminal|bash|shell|web[_ -]?search|web[_ -]?fetch|browser|subagent|image_gen|spawn|mcp|exec/i
const FILE_NAME = /^(read_file|read|write|search_replace|edit|list_dir|grep|glob|ls)$/i
const FILE_KIND = new Set(['read', 'edit', 'delete', 'move', 'search'])

export type ToolShape = {
  kind?: string | null
  name?: string | null
  title?: string | null
  locations?: { path: string }[] | null
  rawInput?: unknown
}

/** Allow file read/write/edit inside the workspace. Deny shell, web, and everything else. */
export function allowWorkspaceTool(root: string, tool: ToolShape, mode: 'files' | 'none'): boolean {
  if (mode === 'none') return false
  const label = `${tool.name || ''} ${tool.title || ''}`
  if (DENY_NAME.test(label)) return false
  const kind = tool.kind || ''
  if (kind === 'execute' || kind === 'fetch' || kind === 'switch_mode') return false
  if (kind === 'think') return true
  const raw = tool.rawInput
  if (raw && typeof raw === 'object') {
    const record = raw as Record<string, unknown>
    if (typeof record.command === 'string' || typeof record.cmd === 'string') return false
  }
  const fileish = FILE_KIND.has(kind) || FILE_NAME.test(tool.name || '') || /^Writing |^Reading |^Editing /.test(tool.title || '')
  if (!fileish) return false
  const paths = collectPaths(tool)
  return paths.every((item) => isInside(root, item))
}

function collectPaths(tool: ToolShape): string[] {
  const paths: string[] = []
  for (const location of tool.locations ?? []) {
    if (location?.path) paths.push(location.path)
  }
  const raw = tool.rawInput
  if (raw && typeof raw === 'object') {
    for (const key of ['path', 'file', 'file_path', 'filePath', 'target', 'target_file']) {
      const value = (raw as Record<string, unknown>)[key]
      if (typeof value === 'string') paths.push(value)
    }
  }
  return paths
}
