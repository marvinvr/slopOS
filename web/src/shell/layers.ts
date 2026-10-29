type Layer = { id: number; close: () => void }

const stack: Layer[] = []
let seq = 0

function remove(id: number): void {
  const index = stack.findIndex((entry) => entry.id === id)
  if (index >= 0) stack.splice(index, 1)
}

/** Register a dismissable layer. The latest one closes first on Escape. */
export function pushLayer(close: () => void): () => void {
  const entry: Layer = { id: ++seq, close: () => {} }
  entry.close = () => {
    remove(entry.id)
    close()
  }
  stack.push(entry)
  return () => remove(entry.id)
}

/** Close the top layer. Returns whether anything closed. */
export function dismissOne(): boolean {
  const top = stack[stack.length - 1]
  if (!top) return false
  top.close()
  return true
}

/** Close every layer, top first. */
export function dismissAll(): void {
  const closers = stack.map((entry) => entry.close)
  for (let i = closers.length - 1; i >= 0; i--) closers[i]()
}
