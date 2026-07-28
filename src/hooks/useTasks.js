import { useState, useEffect } from 'react'
import { doc, onSnapshot, setDoc } from 'firebase/firestore'
import { resetElapsed } from 'nook-core/recurrence'
import { TASKS } from 'nook-core/paths'
import { db } from '../firebase'

const REF = doc(db, ...TASKS)

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
