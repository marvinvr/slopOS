import { useEffect } from 'react'
import { snapFrame } from '../snap'
import { useShell } from '../store'
import { Window } from './Window'

export function WindowManager() {
  const windows = useShell((state) => state.windows)
  const preview = useShell((state) => state.snapPreview)
  const refit = useShell((state) => state.refitMaximized)

  useEffect(() => {
    const onResize = () => refit()
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [refit])

  const frame = preview ? snapFrame(preview) : null

  return (
    <div className="shell-stage">
      {frame && preview ? (
        <div
          className="shell-snap-preview"
          data-snap={preview}
          aria-hidden
          style={{ left: frame.x, top: frame.y, width: frame.width, height: frame.height }}
        />
      ) : null}
      {windows.map((win) => (
        <Window key={win.id} win={win} />
      ))}
    </div>
  )
}
