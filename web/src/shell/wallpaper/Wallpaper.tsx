export function Wallpaper() {
  return (
    <div className="shell-wallpaper" aria-hidden>
      <svg className="shell-noise">
        <filter id="slop-noise">
          <feTurbulence type="fractalNoise" baseFrequency="0.8" numOctaves="2" stitchTiles="stitch" />
        </filter>
        <rect width="100%" height="100%" filter="url(#slop-noise)" />
      </svg>
    </div>
  )
}
