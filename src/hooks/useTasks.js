import { useState, useEffect } from 'react'
import { doc, onSnapshot, setDoc } from 'firebase/firestore'
import { db } from '../firebase'

const REF = doc(db, 'skylight', 'tasks')

const DEFAULTS = {
  blessing: [{ id: 1, task: 'Groceries', done: false }],
  pearl:    [{ id: 2, task: 'Do laundry', done: false }],
}

export function useTasks() {
  const [tasks, setTasks]   = useState({ blessing: [], pearl: [] })
  const [synced, setSynced] = useState(false)
  const [error, setError]   = useState(null)

  useEffect(() => {
    return onSnapshot(REF,
      snap => {
        const data = snap.data()
        setTasks(data || DEFAULTS)
        setSynced(true)
        setError(null)
      },
      err => setError(err.message)
    )
  }, [])

  const save = (next) => setDoc(REF, next, { merge: true })

  const toggle = (person, id) => {
    const updated = tasks[person].map(t => t.id === id ? { ...t, done: !t.done } : t)
    save({ [person]: updated })
  }

  const add = (person, text) => {
    const trimmed = text.trim()
    if (!trimmed) return
    const item = { id: Date.now(), task: trimmed, done: false }
    save({ [person]: [...(tasks[person] || []), item] })
  }

  const remove = (person, id) => {
    save({ [person]: tasks[person].filter(t => t.id !== id) })
  }

  return { tasks, synced, error, toggle, add, remove }
}
