import { useShell } from '../store'

/**
 * TODO(pass A): Spotlight.
 * Fuzzy search over installed apps, arrow keys + Enter to launch,
 * and a last row "Generate '<query>' with Grok" that calls startGeneration(prompt).
 * Shortcut: Ctrl/Cmd+Space and Ctrl/Cmd+K (already wired).
 */
export function openSpotlight(): void {
  const state = useShell.getState()
  state.setSpotlightOpen(true)
}

export function Spotlight() {
  const open = useShell((state) => state.spotlightOpen)
  const close = useShell((state) => state.setSpotlightOpen)
  if (!open) return null
  return (
    <div className="shell-backdrop spotlight" onPointerDown={() => close(false)}>
      <div className="shell-spotlight" role="dialog" aria-label="Spotlight" onPointerDown={(event) => event.stopPropagation()}>
        <div className="shell-spotlight-head">
          <h2>Spotlight</h2>
        </div>
        <p>Search and app generation land in the next pass. The desk is ready for them.</p>
      </div>
    </div>
  )
}
