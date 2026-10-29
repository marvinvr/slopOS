/** Warm mesh. Light and dark are separate palettes; the blobs stay soft. */
export function Wallpaper() {
  return (
    <div className="shell-wallpaper" aria-hidden>
      <svg className="shell-blobs" viewBox="0 0 1200 800" preserveAspectRatio="xMidYMid slice">
        <ellipse className="b1" cx="160" cy="150" rx="320" ry="220" />
        <ellipse className="b2" cx="1040" cy="90" rx="280" ry="190" />
        <ellipse className="b3" cx="900" cy="700" rx="340" ry="210" />
        <ellipse className="b4" cx="260" cy="680" rx="260" ry="170" />
        <ellipse className="b5" cx="620" cy="380" rx="200" ry="140" />
      </svg>
      <svg className="shell-noise">
        <filter id="slop-noise">
          <feTurbulence type="fractalNoise" baseFrequency="0.8" numOctaves="2" stitchTiles="stitch" />
        </filter>
        <rect width="100%" height="100%" filter="url(#slop-noise)" />
      </svg>
    </div>
  )
}
