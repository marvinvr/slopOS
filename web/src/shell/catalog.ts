import { startGeneration } from './generation'
import { isPending, useShell } from './store'
import type { AppManifest } from './types'

/** Apps the desk always offers. Opening one that isn't installed yet installs it. */
export type CatalogApp = { id: string; name: string; icon: string; tint: string; prompt: string }

export const CATALOG: CatalogApp[] = [
  { id: 'catalog:notes', name: 'Notes', icon: 'NotebookPen', tint: '#b86e40', prompt: 'a notes app called Notes, with folders, search and markdown' },
  { id: 'catalog:calendar', name: 'Calendar', icon: 'CalendarDays', tint: '#c4624a', prompt: 'a calendar app called Calendar, with month and week views and events' },
  { id: 'catalog:weather', name: 'Weather', icon: 'CloudSun', tint: '#62769e', prompt: 'a weather app called Weather, with a forecast for a few cities' },
  { id: 'catalog:reminders', name: 'Reminders', icon: 'ListChecks', tint: '#6f8c6c', prompt: 'a reminders app called Reminders, with lists, due dates and checkboxes' },
  { id: 'catalog:calculator', name: 'Calculator', icon: 'Calculator', tint: '#7a756f', prompt: 'a calculator app called Calculator, with a clean keypad and history' },
  { id: 'catalog:timer', name: 'Timer', icon: 'Timer', tint: '#c16b7a', prompt: 'a focus timer app called Timer, with pomodoro sessions and breaks' },
  { id: 'catalog:paint', name: 'Paint', icon: 'Palette', tint: '#8a6889', prompt: 'a drawing app called Paint, with brushes, colors and undo' },
  { id: 'catalog:music', name: 'Music', icon: 'Music', tint: '#3f8a82', prompt: 'a music app called Music, a tiny synth with a keyboard and a step sequencer' },
]

/** Catalog entries the desk doesn't already have under the same name or request. */
export function uninstalled(apps: AppManifest[]): CatalogApp[] {
  const names = new Set(apps.map((app) => app.name.trim().toLowerCase()))
  const prompts = new Set(apps.map((app) => app.prompt?.trim()).filter(Boolean))
  return CATALOG.filter((entry) => !names.has(entry.name.toLowerCase()) && !prompts.has(entry.prompt))
}

/** Open something that isn't installed. A window that is already opening it just comes forward. */
export function launch(prompt: string, title: string): void {
  const shell = useShell.getState()
  const opening = shell.windows.find((win) => isPending(win.appId) && win.phase !== 'closing' && win.title === title)
  if (opening) {
    shell.focusWindow(opening.id)
    shell.setDrawerOpen(false)
    shell.setSpotlightOpen(false)
    return
  }
  startGeneration(prompt, title)
}
