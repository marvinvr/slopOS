import { useEffect, useState, type ReactNode } from 'react'
import type { WireMenu } from '../../../../runtime/protocol'
import { Icon } from '../../design/kit'
import { cx } from '../../design/kit/cx'
import { useFullscreen, toggleFullscreen } from '../fullscreen'
import { Mark } from '../icons'
import { pushLayer } from '../layers'
import { shortcutLabel } from '../metrics'
import { openEditApp, providerLabel, regenerateApp, useGrokStatus } from '../generation'
import { useShell } from '../store'
import { WALLPAPERS } from '../wallpaper/wallpapers'
import { MenuList, type MenuNode } from './MenuList'
import { StatusArea } from './StatusArea'

const ACCENTS = [
  { label: 'Tangerine', color: '#e4532d' },
  { label: 'Blue', color: '#3b82f6' },
  { label: 'Green', color: '#2f9e6b' },
  { label: 'Plum', color: '#8b5cf6' },
  { label: 'Graphite', color: '#6b6560' },
  { label: 'Rose', color: '#e25b7a' },
]

export function MenuBar() {
  const [openId, setOpenId] = useState<string | null>(null)
  const fullscreen = useFullscreen()
  const theme = useShell((state) => state.theme)
  const accent = useShell((state) => state.accent)
  const wallpaper = useShell((state) => state.wallpaper)
  const setTheme = useShell((state) => state.setTheme)
  const setAccent = useShell((state) => state.setAccent)
  const setWallpaper = useShell((state) => state.setWallpaper)
  const setAboutOpen = useShell((state) => state.setAboutOpen)
  const setShortcutsOpen = useShell((state) => state.setShortcutsOpen)
  const setDrawerOpen = useShell((state) => state.setDrawerOpen)
  const setSpotlightOpen = useShell((state) => state.setSpotlightOpen)
  const setShellPrompt = useShell((state) => state.setShellPrompt)
  const apps = useShell((state) => state.apps)
  const windows = useShell((state) => state.windows)
  const focusedWindowId = useShell((state) => state.focusedWindowId)
  const appMenus = useShell((state) => state.appMenus)
  const provider = providerLabel(useGrokStatus().provider)
  const closeWindow = useShell((state) => state.closeWindow)
  const minimizeWindow = useShell((state) => state.minimizeWindow)
  const toggleMaximize = useShell((state) => state.toggleMaximize)
  const focusWindow = useShell((state) => state.focusWindow)

  const focused = windows.find((win) => win.id === focusedWindowId && win.phase === 'open')
  const app = focused ? apps.find((item) => item.id === focused.appId) : undefined
  const menus = focused ? appMenus[focused.id] ?? [] : []
  const liveWindows = windows.filter((win) => win.phase !== 'closing').sort((a, b) => b.z - a.z)

  useEffect(() => {
    if (!openId) return
    return pushLayer(() => setOpenId(null))
  }, [openId])

  useEffect(() => {
    if (!openId) return
    const onPointer = (event: PointerEvent) => {
      const target = event.target as HTMLElement
      if (target.closest('.shell-menu.is-open')) return
      setOpenId(null)
    }
    window.addEventListener('pointerdown', onPointer)
    return () => window.removeEventListener('pointerdown', onPointer)
  }, [openId])

  const logoItems: MenuNode[] = [
    { type: 'item', label: 'About slopOS', onSelect: () => setAboutOpen(true) },
    { type: 'item', label: 'Keyboard Shortcuts', shortcut: 'Ctrl+/', onSelect: () => setShortcutsOpen(true) },
    { type: 'sep' },
    {
      type: 'sub',
      label: 'Appearance',
      items: [
        { type: 'item', label: 'Light', checked: theme === 'light', onSelect: () => setTheme('light') },
        { type: 'item', label: 'Dark', checked: theme === 'dark', onSelect: () => setTheme('dark') },
        { type: 'item', label: 'Auto', checked: theme === 'auto', onSelect: () => setTheme('auto') },
      ],
    },
    {
      type: 'swatches',
      label: 'Accent',
      options: ACCENTS.map((item) => ({ value: item.color, color: item.color, label: item.label })),
      value: accent.toLowerCase(),
      onSelect: setAccent,
    },
    {
      type: 'swatches',
      label: 'Wallpaper',
      shape: 'preview',
      options: WALLPAPERS.map((item) => ({ value: item.id, color: item.preview, label: item.label })),
      value: wallpaper,
      onSelect: setWallpaper,
    },
    { type: 'sep' },
    {
      type: 'item',
      label: 'Show All Apps',
      shortcut: shortcutLabel('A', true),
      onSelect: () => setDrawerOpen(true),
    },
    {
      type: 'item',
      label: fullscreen ? 'Exit Full Screen' : 'Enter Full Screen',
      shortcut: shortcutLabel('F', true),
      onSelect: () => void toggleFullscreen(),
    },
    { type: 'sep' },
    { type: 'item', label: 'Reload slopOS', onSelect: () => window.location.reload() },
    { type: 'item', label: 'Reset slopOS…', danger: true, onSelect: () => setShellPrompt({ kind: 'reset' }) },
  ]

  const windowItems: MenuNode[] = [
    {
      type: 'item',
      label: 'Minimize',
      shortcut: shortcutLabel('M'),
      disabled: !focused,
      onSelect: () => focused && minimizeWindow(focused.id),
    },
    {
      type: 'item',
      label: focused?.maximized ? 'Zoom out' : 'Zoom',
      disabled: !focused,
      onSelect: () => focused && toggleMaximize(focused.id),
    },
    {
      type: 'item',
      label: 'Close',
      shortcut: shortcutLabel('W'),
      disabled: !focused,
      onSelect: () => focused && closeWindow(focused.id),
    },
    { type: 'sep' },
    ...(!liveWindows.length
      ? [{ type: 'item' as const, label: 'No open windows', disabled: true, onSelect: () => {} }]
      : liveWindows.map((win) => ({
          type: 'item' as const,
          label: win.title || apps.find((item) => item.id === win.appId)?.name || 'Window',
          checked: win.id === focusedWindowId && win.phase === 'open',
          onSelect: () => focusWindow(win.id),
        }))),
  ]

  const appItems: MenuNode[] = app
    ? [
        { type: 'item', label: provider ? `Edit with ${provider}…` : 'Edit…', onSelect: () => openEditApp(app.id) },
        { type: 'item', label: 'Regenerate', onSelect: () => regenerateApp(app.id) },
        { type: 'item', label: 'Version History…', onSelect: () => setShellPrompt({ kind: 'history', appId: app.id }) },
        { type: 'sep' },
        { type: 'item', label: 'Delete', danger: true, onSelect: () => setShellPrompt({ kind: 'delete', appId: app.id }) },
      ]
    : []

  const menuIds = ['logo', ...menus.map((menu) => `app:${menu.label}`), 'window', ...(app ? ['app-menu'] : [])]

  function openMenu(id: string) {
    setOpenId(id)
  }

  function neighbor(id: string, delta: number) {
    const index = menuIds.indexOf(id)
    if (index < 0) return
    const next = menuIds[(index + delta + menuIds.length) % menuIds.length]
    if (next) setOpenId(next)
  }

  return (
    <header className="shell-menubar" role="menubar">
      <BarMenu
        menuId="logo"
        icon
        label={<Mark />}
        items={logoItems}
        open={openId === 'logo'}
        anyOpen={openId !== null}
        onOpen={openMenu}
        onClose={() => setOpenId(null)}
        onExitLeft={() => neighbor('logo', -1)}
        onExitRight={() => neighbor('logo', 1)}
      />
      <span className="shell-appname">{app?.name ?? 'slopOS'}</span>
      {menus.map((menu) => {
        const id = `app:${menu.label}`
        return (
          <BarMenu
            key={id}
            menuId={id}
            label={menu.label}
            items={wireToItems(menu, focused?.id)}
            open={openId === id}
            anyOpen={openId !== null}
            onOpen={openMenu}
            onClose={() => setOpenId(null)}
            onExitLeft={() => neighbor(id, -1)}
            onExitRight={() => neighbor(id, 1)}
          />
        )
      })}
      <BarMenu
        menuId="window"
        label="Window"
        items={windowItems}
        open={openId === 'window'}
        anyOpen={openId !== null}
        onOpen={openMenu}
        onClose={() => setOpenId(null)}
        onExitLeft={() => neighbor('window', -1)}
        onExitRight={() => neighbor('window', 1)}
      />
      {app ? (
        <BarMenu
          menuId="app-menu"
          label="App"
          items={appItems}
          open={openId === 'app-menu'}
          anyOpen={openId !== null}
          onOpen={openMenu}
          onClose={() => setOpenId(null)}
          onExitLeft={() => neighbor('app-menu', -1)}
          onExitRight={() => neighbor('app-menu', 1)}
        />
      ) : null}
      <div className="shell-menubar-spacer" />
      <button
        type="button"
        className={cx('shell-menu-label', 'shell-search-btn')}
        aria-label="Spotlight"
        onClick={() => {
          setOpenId(null)
          setSpotlightOpen(true)
        }}
      >
        <Icon name="Search" size={14} />
      </button>
      <StatusArea />
    </header>
  )
}

function BarMenu({
  menuId,
  label,
  items,
  open,
  anyOpen,
  icon,
  onOpen,
  onClose,
  onExitLeft,
  onExitRight,
}: {
  menuId: string
  label: ReactNode
  items: MenuNode[]
  open: boolean
  anyOpen: boolean
  icon?: boolean
  onOpen: (id: string) => void
  onClose: () => void
  onExitLeft: () => void
  onExitRight: () => void
}) {
  return (
    <div className={cx('shell-menu', open && 'is-open', icon && 'is-logo')} onMouseEnter={() => anyOpen && onOpen(menuId)}>
      <button
        type="button"
        className="shell-menu-label"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={icon ? 'slopOS' : undefined}
        onClick={() => (open ? onClose() : onOpen(menuId))}
      >
        {label}
      </button>
      {open ? (
        <div className="shell-menu-pop" role="presentation">
          <MenuList items={items} onClose={onClose} onExitLeft={onExitLeft} onExitRight={onExitRight} />
        </div>
      ) : null}
    </div>
  )
}

function wireToItems(menu: WireMenu, windowId: string | undefined): MenuNode[] {
  return menu.items.map((item) => {
    if (item.type === 'separator') return { type: 'sep' }
    return {
      type: 'item',
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
