import { useState, useEffect, useCallback } from 'react'

// Module-level bus rather than props: the data hooks are instantiated inside
// tabs, several levels below the one place the toast stack is rendered, and
// main.jsx (service-worker updates) is outside the React tree entirely.
const listeners = new Set()

/**
 * Show a toast. `message` may be a string or a React node.
 * `duration: 0` keeps it until dismissed.
 */
export function notify(message, type = 'info', { duration = 5000 } = {}) {
  const toast = { id: `${Date.now()}-${Math.random()}`, message, type, duration }
  listeners.forEach(fn => fn(toast))
  return toast.id
}

/** Report a failed write. Always resolves false so callers can chain it. */
export function notifyFailure(what, err) {
  console.error(what, err)
  const offline = typeof navigator !== 'undefined' && navigator.onLine === false
  const why = offline || err?.code === 'unavailable'
    ? 'No connection.'
    : err?.code === 'permission-denied' ? 'Not allowed.' : 'Please try again.'
  notify(`${what} ${why}`, 'error', { duration: 7000 })
  return false
}

// Ids this device just created. Transactional writes come back as ordinary
// server snapshots (no hasPendingWrites), so useNotifications needs another
// way to tell "I added this" from "someone else added this".
const localIds = new Set()
export const markLocal = (id) => { localIds.add(id) }
export const isLocal   = (id) => localIds.has(id)

export function useToasts() {
  const [toasts, setToasts] = useState([])

  const dismiss = useCallback((id) => setToasts(prev => prev.filter(t => t.id !== id)), [])

  useEffect(() => {
    const onToast = (toast) => {
      setToasts(prev => [...prev.slice(-4), toast])
      if (toast.duration) setTimeout(() => dismiss(toast.id), toast.duration)
    }
    listeners.add(onToast)
    return () => { listeners.delete(onToast) }
  }, [dismiss])

  return { toasts, dismiss }
}
