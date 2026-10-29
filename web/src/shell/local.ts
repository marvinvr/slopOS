const WELCOME_KEY = 'slopos-welcome'

export function welcomeSeen(): boolean {
  try {
    return localStorage.getItem(WELCOME_KEY) === '1'
  } catch {
    return true
  }
}

export function markWelcome(): void {
  try {
    localStorage.setItem(WELCOME_KEY, '1')
  } catch {
    /* private mode */
  }
}

/** Drop shell keys so a reset reloads into the pristine first run. */
export function clearSlopLocalStorage(): void {
  try {
    const keys: string[] = []
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (key && key.startsWith('slop')) keys.push(key)
    }
    for (const key of keys) localStorage.removeItem(key)
  } catch {
    /* private mode */
  }
}
