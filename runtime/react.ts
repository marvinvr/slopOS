/**
 * Optional for screens that want components and state: React with htm, so there is no JSX
 * and nothing to compile. A screen opts in with
 *   <script type="module">import { html, render, useState } from '/runtime/react.js'</script>
 */
import React from 'react'
import { createRoot } from 'react-dom/client'
import { flushSync } from 'react-dom'
import htm from 'htm'

export const html = htm.bind(React.createElement)

/** Render synchronously, so the screen is in place before the shell shows it. */
export function render(node: React.ReactNode, target: Element = document.body): void {
  const root = createRoot(target)
  flushSync(() => root.render(node))
}

export { React }
export const { useState, useEffect, useLayoutEffect, useRef, useMemo, useCallback, useReducer, useId, Fragment } = React
