import { useState, useEffect, useRef } from 'react'
import { doc, onSnapshot, updateDoc, arrayUnion, arrayRemove, runTransaction } from 'firebase/firestore'
import { db } from '../firebase'

const REF = doc(db, 'skylight', 'groceries')

export function useGroceries() {
  const [items, setItems]           = useState([])
  const [synced, setSynced]         = useState(false)
  const [error, setError]           = useState(null)
  const [remoteUpdate, setRemoteUpdate] = useState(0)
  const itemsRef                    = useRef([])
  const prevCountRef                = useRef(null)

  useEffect(() => {
    return onSnapshot(REF,
      snap => {
        const incoming = snap.data()?.items || []
        if (
          prevCountRef.current !== null &&
          !snap.metadata.hasPendingWrites &&
          incoming.length > prevCountRef.current
        ) {
          setRemoteUpdate(v => v + 1)
        }
        prevCountRef.current = incoming.length
        itemsRef.current = incoming
        setItems(incoming)
        setSynced(true)
        setError(null)
      },
      err => setError(err.message)
    )
  }, [])

  const add = (name) => {
    const t = name.trim()
    if (!t) return
    const newItem = { id: Date.now(), name: t, done: false }
    updateDoc(REF, { items: arrayUnion(newItem) })
  }

  const toggle = (id) =>
    runTransaction(db, async (txn) => {
      const snap = await txn.get(REF)
      const current = snap.data()?.items || []
      const updated = current.map(i => i.id === id ? { ...i, done: !i.done } : i)
      txn.update(REF, { items: updated })
    })

  const remove = (id) => {
    const item = itemsRef.current.find(i => i.id === id)
    if (!item) return
    updateDoc(REF, { items: arrayRemove(item) })
  }

  const clearDone = () =>
    runTransaction(db, async (txn) => {
      const snap = await txn.get(REF)
      const current = snap.data()?.items || []
      txn.update(REF, { items: current.filter(i => !i.done) })
    })

  return { items, synced, error, add, toggle, remove, clearDone, remoteUpdate }
}
