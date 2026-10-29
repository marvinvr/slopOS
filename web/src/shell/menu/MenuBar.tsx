import { useEffect, useState } from 'react'
import type { WireMenu } from '../../../../runtime/protocol'
import { isFullscreen, toggleFullscreen } from '../fullscreen'
import { modLabel } from '../metrics'
import { Mark } from '../icons'
import { useShell } from '../store'
import { MenuBarMenu, type BarMenuItem } from './MenuBarMenu'
import { StatusArea } from './StatusArea'

export function MenuBar() {
  const [openId, setOpenId] = useState<string | null>(null)
  const theme = useShell((state) => state.theme)
  const accent = useShell((state) => state.accent)
  const setTheme = useShell((state) => state.setTheme)
  const setAccent = useShell((state) => state.setAccent)
  const [full, setFull] = useState(() => isFullscreen())

  useEffect(() => {
    const onChange = () => setFull(isFullscreen())
    document.addEventListener('fullscreenchange', onChange)
    return () => document.removeEventListener('fullscreenchange', onChange)
  }, [])
  const setAboutOpen = useShell((state) => state.setAboutOpen)
  const apps = useShell((state) => state.apps)
  const windows = useShell((state) => state.windows)
  const focusedWindowId = useShell((state) => state.focusedWindowId)
  const appMenus = useShell((state) => state.appMenus)
  const closeWindow = useShell((state) => state.closeWindow)
  const minimizeWindow = useShell((state) => state.minimizeWindow)
  const toggleMaximize = useShell((state) => state.toggleMaximize)
  const newWindow = useShell((state) => state.newWindow)

  const focused = windows.find((win) => win.id === focusedWindowId && win.phase === 'open')
  const app = focused ? apps.find((item) => item.id === focused.appId) : undefined
  const menus = focused ? appMenus[focused.id] ?? [] : []
  const mod = modLabel()

  const logoItems: BarMenuItem[] = [
    { label: 'About slopOS', onSelect: () => setAboutOpen(true) },
    'separator',
    { label: 'Light', checked: theme === 'light', onSelect: () => setTheme('light') },
    { label: 'Dark', checked: theme === 'dark', onSelect: () => setTheme('dark') },
    { label: 'Auto', checked: theme === 'auto', onSelect: () => setTheme('auto') },
    'separator',
    ...ACCENTS.map((item) => ({
      label: item.label,
      checked: accent.toLowerCase() === item.color,
      onSelect: () => setAccent(item.color),
    })),
    'separator',
    {
      label: full ? 'Exit Full Screen' : 'Enter Full Screen',
      shortcut: `${mod}⇧F`,
      onSelect: () => void toggleFullscreen(),
    },
    { label: 'Restart', onSelect: () => window.location.reload() },
  ]

  const windowItems: BarMenuItem[] = focused
    ? [
        { label: 'Minimize', shortcut: `${mod}M`, onSelect: () => minimizeWindow(focused.id) },
        { label: focused.maximized ? 'Zoom out' : 'Zoom', onSelect: () => toggleMaximize(focused.id) },
        { label: 'Close', shortcut: `${mod}W`, onSelect: () => closeWindow(focused.id) },
        'separator',
        { label: 'New Window', onSelect: () => newWindow(focused.appId) },
      ]
    : []

  return (
    <header className="shell-menubar" role="menubar">
      <MenuBarMenu menuId="logo" label={<Mark />} items={logoItems} open={openId === 'logo'} anyOpen={openId !== null} onOpen={setOpenId} onClose={() => setOpenId(null)} />
      <span className="shell-appname">{app?.name ?? 'slopOS'}</span>
      {menus.map((menu) => (
        <MenuBarMenu
          key={menu.label}
          menuId={`app:${menu.label}`}
          label={menu.label}
          items={wireToItems(menu, focused?.id)}
          open={openId === `app:${menu.label}`}
          anyOpen={openId !== null}
          onOpen={setOpenId}
          onClose={() => setOpenId(null)}
        />
      ))}
      {focused ? (
        <MenuBarMenu
          menuId="window"
          label="Window"
          items={windowItems}
          open={openId === 'window'}
          anyOpen={openId !== null}
          onOpen={setOpenId}
          onClose={() => setOpenId(null)}
        />
      ) : null}
      <div className="shell-menubar-spacer" />
      <StatusArea />
    </header>
  )
}

const ACCENTS = [
  { label: 'Tangerine', color: '#e4532d' },
  { label: 'Blue', color: '#3b82f6' },
  { label: 'Green', color: '#2f9e6b' },
  { label: 'Plum', color: '#8b5cf6' },
  { label: 'Graphite', color: '#6b6560' },
  { label: 'Rose', color: '#e25b7a' },
]

function wireToItems(menu: WireMenu, windowId: string | undefined): BarMenuItem[] {
  return menu.items.map((item) => {
    if (item.type === 'separator') return 'separator'
    return {
      label: item.label,
      shortcut: item.shortcut,
      disabled: item.disabled,
      onSelect: () => {
        if (!windowId) return
        const frame = document.querySelector<HTMLIFrameElement>(`iframe[data-win="${windowId}"]`)
        frame?.contentWindow?.postMessage({ slop: 1, type: 'menu.invoke', payload: { id: item.id } }, '*')
      },
    }
  })
}
