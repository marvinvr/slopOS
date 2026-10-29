import path from 'node:path'

/** Project root. The server is always started from the repo root (`npm start` / `npm run dev`). */
export const root = process.cwd()

/** `SLOPOS_DATA_DIR` isolates a run (the generation test uses a temp directory). */
export const dataDir = process.env.SLOPOS_DATA_DIR ? path.resolve(process.env.SLOPOS_DATA_DIR) : path.join(root, 'data')
export const appsDir = path.join(dataDir, 'apps')
export const storageDir = path.join(dataDir, 'storage')
export const workspacesDir = path.join(dataDir, 'workspaces')
export const worldDir = path.join(dataDir, 'world')
export const jobsPath = path.join(dataDir, 'jobs.json')
export const settingsPath = path.join(dataDir, 'settings.json')
export const fixturesDir = path.join(root, 'fixtures', 'apps')
export const webDir = path.join(root, 'dist', 'web')
export const runtimeDir = path.join(root, 'dist', 'runtime')
