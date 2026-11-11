import { useState, useEffect, useRef, useCallback } from 'react'
import { doc, onSnapshot } from 'firebase/firestore'
import { TASKS, GROCERIES } from 'nook-core/paths'
import { db } from '../firebase'
import { notify, isLocal } from './useToasts'

const supported = () => typeof window !== 'undefined' && 'Notification' in window

async function pushNotification(title, body) {
  if (!supported() || Notification.permission !== 'granted') return
  const options = { body, icon: '/icon-192.png' }
  try {
    const reg = await navigator.serviceWorker.ready
    await reg.showNotification(title, { ...options, badge: '/icon-192.png', vibrate: [200, 100, 200] })
  } catch {
    // No service worker (dev server, unsupported browser). The constructor
    // itself throws on Android Chrome, so it needs its own guard.
    try { new Notification(title, options) } catch { /* toast already shown */ }
  }
}

/**
 * Watches the shared lists and announces items added from another device,
 * as an in-app toast (via useToasts) and an OS notification when permitted.
 *
 * Permission is never requested on mount — browsers ignore or penalise a
 * prompt with no user gesture. Render a button that calls `requestPermission`
 * while `permission === 'default'`.
 */
export function useNotifications() {
  const [permission, setPermission] = useState(() => (supported() ? Notification.permission : 'unsupported'))
  const tasksInit  = useRef(false)
  const grocInit   = useRef(false)
  const knownTasks = useRef(new Set())
  const knownGroc  = useRef(new Set())

  const requestPermission = useCallback(async () => {
    if (!supported()) return 'unsupported'
    let result
    try {
      result = await Notification.requestPermission()
    } catch {
      result = Notification.permission
    }
    setPermission(result)
    if (result === 'denied') notify('Notifications are blocked. Allow them for NooK in your browser settings.', 'info')
    return result
  }, [])

  useEffect(() => {
    return onSnapshot(doc(db, ...TASKS), { includeMetadataChanges: true }, snap => {
      const data = snap.exists() ? snap.data() : {}
      const all  = [
        ...(data.blessing || []).map(t => ({ ...t, who: 'Blessing' })),
        ...(data.pearl    || []).map(t => ({ ...t, who: 'Pearl'    })),
      ]
      // Stay quiet until the first server snapshot: the persisted cache can
      // be days old, and everything added since would be announced at once.
      // A snapshot with pending writes contains this device's own unsent
      // changes. In both cases remember the ids, announce nothing.
      const quiet = !tasksInit.current || snap.metadata.hasPendingWrites
      if (!snap.metadata.fromCache) tasksInit.current = true
      all.filter(t => !knownTasks.current.has(t.id)).forEach(t => {
        knownTasks.current.add(t.id)
        if (quiet || isLocal(t.id)) return
        notify(`New task for ${t.who}: "${t.task}"`, 'task')
        pushNotification('NooK — New Task', `${t.who}: ${t.task}`)
      })
    }, err => console.error(err))
  }, [])

  useEffect(() => {
    return onSnapshot(doc(db, ...GROCERIES), { includeMetadataChanges: true }, snap => {
      const items = snap.exists() ? (snap.data().items || []) : []
      const quiet = !grocInit.current || snap.metadata.hasPendingWrites
      if (!snap.metadata.fromCache) grocInit.current = true
      items.filter(i => !knownGroc.current.has(i.id)).forEach(i => {
        knownGroc.current.add(i.id)
        if (quiet) return
        notify(`Grocery added: "${i.name}"`, 'grocery')
        pushNotification('NooK — Groceries', `Added: ${i.name}`)
      })
    }, err => console.error(err))
  }, [])

  return { permission, requestPermission }
}
