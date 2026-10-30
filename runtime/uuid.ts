/**
 * crypto.randomUUID only exists in secure contexts, and slopOS is often served over plain http on a LAN name.
 * Importing this module installs a getRandomValues-based version so the shell, the runtime and app code can rely on it.
 */
export function randomUUID(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

if (typeof crypto !== 'undefined' && typeof crypto.randomUUID !== 'function') {
  Object.defineProperty(crypto, 'randomUUID', { value: randomUUID, configurable: true, writable: true })
}
