import { useState, useEffect, useRef, useCallback } from 'react'
import { doc, onSnapshot } from 'firebase/firestore'
import { db } from '../firebase'

async function pushNotification(title, body) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return
  try {
    const reg = await navigator.serviceWorker.ready
    await reg.showNotification(title, {
      body,
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      vibrate: [200, 100, 200],
    })
  } catch {
    new Notification(title, { body, icon: '/icon-192.png' })
  }
}

export function useNotifications() {
  const [toasts, setToasts] = useState([])
  const tasksInit  = useRef(false)
  const grocInit   = useRef(false)
  const knownTasks = useRef(new Set())
  const knownGroc  = useRef(new Set())

  // Request OS notification permission once
  useEffect(() => {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission()
    }
  }, [])

  const addToast = useCallback((message, type = 'info') => {
    const id = `${Date.now()}-${Math.random()}`
    setToasts(prev => [...prev.slice(-4), { id, message, type }])
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 5000)
  }, [])

  const dismiss = useCallback((id) => setToasts(prev => prev.filter(t => t.id !== id)), [])

  useEffect(() => {
    return onSnapshot(doc(db, 'skylight', 'tasks'), snap => {
      const data = snap.exists() ? snap.data() : {}
      const all  = [
        ...(data.blessing || []).map(t => ({ ...t, who: 'Blessing' })),
        ...(data.pearl    || []).map(t => ({ ...t, who: 'Pearl'    })),
      ]
      if (!tasksInit.current) {
        all.forEach(t => knownTasks.current.add(t.id))
        tasksInit.current = true
        return
      }
      all.filter(t => !knownTasks.current.has(t.id)).forEach(t => {
        const msg = `New task for ${t.who}: "${t.task}"`
        addToast(msg, 'task')
        pushNotification('NooK — New Task', 'You have a new task')
        knownTasks.current.add(t.id)
      })
    })
  }, [addToast])

  useEffect(() => {
    return onSnapshot(doc(db, 'skylight', 'groceries'), snap => {
      const items = snap.exists() ? (snap.data().items || []) : []
      if (!grocInit.current) {
        items.forEach(i => knownGroc.current.add(i.id))
        grocInit.current = true
        return
      }
      items.filter(i => !knownGroc.current.has(i.id)).forEach(i => {
        const msg = `Grocery added: "${i.name}"`
        addToast(msg, 'grocery')
        pushNotification('NooK — Groceries', 'Shopping list updated')
        knownGroc.current.add(i.id)
      })
    })
  }, [addToast])

  return { toasts, dismiss }
}
