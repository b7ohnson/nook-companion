import { useState, useEffect } from 'react'
import { doc, onSnapshot, setDoc } from 'firebase/firestore'
import { db } from '../firebase'

const REF = doc(db, 'skylight', 'groceries')

export function useGroceries() {
  const [items, setItems]   = useState([])
  const [synced, setSynced] = useState(false)
  const [error, setError]   = useState(null)

  useEffect(() => {
    return onSnapshot(REF,
      snap => { setItems(snap.data()?.items || []); setSynced(true); setError(null) },
      err  => setError(err.message)
    )
  }, [])

  const save = (next) => setDoc(REF, { items: next }, { merge: true })

  const add      = (name) => { const t = name.trim(); if (t) save([...items, { id: Date.now(), name: t, done: false }]) }
  const toggle   = (id)   => save(items.map(i => i.id === id ? { ...i, done: !i.done } : i))
  const remove   = (id)   => save(items.filter(i => i.id !== id))
  const clearDone = ()    => save(items.filter(i => !i.done))

  return { items, synced, error, add, toggle, remove, clearDone }
}
