import { loadJobs } from './queue'

export { getGrokStatus, registerGeneratorRoutes } from './routes'

export async function initGenerator(): Promise<void> {
  await loadJobs()
}
