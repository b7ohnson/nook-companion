import { useState, useEffect } from 'react'
import { doc, onSnapshot, setDoc } from 'firebase/firestore'
import { db } from '../firebase'

const REF = doc(db, 'skylight', 'tasks')

function nextMidnight(ts) {
  const d = new Date(ts)
  d.setHours(24, 0, 0, 0)
  return d.getTime()
}

function nextWeekStart(ts) {
  const d = new Date(ts)
  d.setDate(d.getDate() + (7 - d.getDay()))
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

function nextMonthStart(ts) {
  const d = new Date(ts)
  d.setMonth(d.getMonth() + 1, 1)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

function resetElapsed(list) {
  const now = Date.now()
  return list.map(t => {
    if (!t.done || !t.recurrence || t.recurrence === 'none' || !t.completedAt) return t
    let shouldReset = false
    if (t.recurrence === 'daily')   shouldReset = now >= nextMidnight(t.completedAt)
    if (t.recurrence === 'weekly')  shouldReset = now >= nextWeekStart(t.completedAt)
    if (t.recurrence === 'monthly') shouldReset = now >= nextMonthStart(t.completedAt)
    return shouldReset ? { ...t, done: false, completedAt: null } : t
  })
}

export function useTasks() {
  const [tasks, setTasks]   = useState({ blessing: [], pearl: [] })
  const [synced, setSynced] = useState(false)
  const [error, setError]   = useState(null)

  useEffect(() => {
    return onSnapshot(REF,
      snap => {
        const data = snap.data() || {}
        const reset = {}
        for (const [key, list] of Object.entries(data)) {
          reset[key] = Array.isArray(list) ? resetElapsed(list) : list
        }
        setTasks(reset)
        const anyReset = Object.keys(reset).some(k =>
          JSON.stringify(reset[k]) !== JSON.stringify(data[k])
        )
        if (anyReset) setDoc(REF, reset).catch(() => {})
        setSynced(true)
        setError(null)
      },
      err => setError(err.message)
    )
  }, [])

  const save = (person, items) => {
    setTasks(prev => ({ ...prev, [person]: items }))
    setDoc(REF, { [person]: items }, { merge: true }).catch(err => { console.error(err) })
  }

  const toggle = (person, id) => {
    const list = tasks[person] || []
    const updated = list.map(t => {
      if (t.id !== id) return t
      const nowDone = !t.done
      return { ...t, done: nowDone, completedAt: nowDone ? Date.now() : null }
    })
    save(person, updated)
  }

  const add = (person, text, recurrence = 'none') => {
    const trimmed = text.trim()
    if (!trimmed) return
    const item = { id: Date.now(), task: trimmed, done: false, recurrence, completedAt: null }
    save(person, [...(tasks[person] || []), item])
  }

  const remove = (person, id) => {
    save(person, (tasks[person] || []).filter(t => t.id !== id))
  }

  const clearArchive = (person) => {
    save(person, (tasks[person] || []).filter(t => !t.done))
  }

  return { tasks, synced, error, toggle, add, remove, clearArchive }
}
