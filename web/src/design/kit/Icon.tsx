import { lazy, Suspense, useMemo, type ComponentType, type CSSProperties, type LazyExoticComponent } from 'react'
import dynamicIconImports from 'lucide-react/dynamicIconImports'
import { cx } from './cx'

type IconCmp = ComponentType<{ size?: number; strokeWidth?: number }>

const cache = new Map<string, LazyExoticComponent<IconCmp>>()

export type IconProps = {
  name: string
  size?: number
  strokeWidth?: number
  className?: string
  style?: CSSProperties
}

/** Lucide's dynamic map is kebab-case. Manifests and the kit use PascalCase. */
function kebab(name: string): string {
  return name.replace(/([a-z0-9])([A-Z])/g, '$1-$2').replace(/([A-Z])([A-Z][a-z])/g, '$1-$2').toLowerCase()
}

function iconComponent(name: string): LazyExoticComponent<IconCmp> | null {
  const key = kebab(name)
  const hit = cache.get(key)
  if (hit) return hit
  const load = (dynamicIconImports as Record<string, () => Promise<{ default: IconCmp }>>)[key]
  if (!load) return null
  const cmp = lazy(load)
  cache.set(key, cmp)
  return cmp
}

export function Icon({ name, size = 16, strokeWidth = 1.75, className, style }: IconProps) {
  const Cmp = useMemo(() => iconComponent(name), [name])
  if (!Cmp) {
    return <span className={cx('slop-icon-missing', className)} style={{ width: size, height: size, ...style }} aria-hidden />
  }
  return (
    <span className={cx('slop-icon', className)} style={style}>
      <Suspense fallback={<span style={{ display: 'inline-block', width: size, height: size }} aria-hidden />}>
        <Cmp size={size} strokeWidth={strokeWidth} />
      </Suspense>
    </span>
  )
}
