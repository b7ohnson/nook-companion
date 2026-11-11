import { useState, useEffect, useRef } from 'react'
import { doc, onSnapshot, setDoc, updateDoc, arrayUnion, arrayRemove, runTransaction } from 'firebase/firestore'
import { GROCERIES } from 'nook-core/paths'
import { db } from '../firebase'
import { notifyFailure } from './useToasts'
import { useSyncStatus } from './useSyncStatus'

const REF = doc(db, ...GROCERIES)

export function useGroceries() {
  const [items, setItems]           = useState([])
  const [synced, setSynced]         = useState(false)
  const [error, setError]           = useState(null)
  const [remoteUpdate, setRemoteUpdate] = useState(0)
  const itemsRef                    = useRef([])   // last snapshot
  const prevCountRef                = useRef(null)
  const { status, track, during }   = useSyncStatus()

  useEffect(() => {
    return onSnapshot(REF, { includeMetadataChanges: true },
      snap => {
        track(snap)
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
  }, [track])

  // Every mutator resolves true/false and never rejects; failures go to the
  // toast stack. The array-transform writes queue offline and their promise
  // settles once the server has them.
  const add = (name) => {
    const t = name.trim()
    if (!t) return Promise.resolve(false)
    const newItem = { id: Date.now(), name: t, done: false }
    // merge so the first item on a fresh project creates the document
    return setDoc(REF, { items: arrayUnion(newItem) }, { merge: true })
      .then(() => true, err => notifyFailure(`Could not add "${t}".`, err))
  }

  // Transactions need the server, so these cannot queue offline. Show the
  // change straight away, and put the list back and say so if it fails —
  // previously a check-off on a weak signal just silently did nothing.
  const mutate = (change, failMsg) => {
    setItems(prev => change(prev))
    return during(runTransaction(db, async (txn) => {
      const snap = await txn.get(REF)
      txn.update(REF, { items: change(snap.data()?.items || []) })
    })).then(() => true, err => {
      setItems(itemsRef.current)
      return notifyFailure(failMsg, err)
    })
  }

  const toggle = (id) => {
    const current = items.find(i => i.id === id)
    if (!current) return Promise.resolve(false)
    const done = !current.done
    return mutate(list => list.map(i => (i.id === id ? { ...i, done } : i)), 'Could not update the item.')
  }

  const remove = (id) => {
    const item = itemsRef.current.find(i => i.id === id)
    if (!item) return Promise.resolve(false)
    return updateDoc(REF, { items: arrayRemove(item) })
      .then(() => true, err => notifyFailure('Could not remove the item.', err))
  }

  const clearDone = () =>
    mutate(list => list.filter(i => !i.done), 'Could not clear checked items.')

  return { items, synced, error, status, add, toggle, remove, clearDone, remoteUpdate }
}
