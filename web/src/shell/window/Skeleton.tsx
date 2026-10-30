import { cx } from '../../design/kit/cx'

/** A neutral app layout that stands in while the window's content loads. */
export function WindowSkeleton({ label, leaving = false }: { label: string; leaving?: boolean }) {
  return (
    <div className={cx('shell-skeleton', leaving && 'is-leaving')} role="status" aria-label={`Opening ${label}`}>
      <div className="shell-skeleton-side" aria-hidden>
        <i className="is-title" />
        <i />
        <i />
        <i className="is-short" />
        <i />
      </div>
      <div className="shell-skeleton-main" aria-hidden>
        <div className="shell-skeleton-bar">
          <i className="is-heading" />
          <i className="is-pill" />
        </div>
        <i className="is-line" />
        <i className="is-line is-mid" />
        <div className="shell-skeleton-grid">
          <b />
          <b />
          <b />
        </div>
        <i className="is-line" />
        <i className="is-line is-short" />
      </div>
    </div>
  )
}
