import { useState, useEffect, useRef, useCallback } from 'react'
import { doc, onSnapshot, runTransaction } from 'firebase/firestore'
import { resetElapsed, nextMidnight } from 'nook-core/recurrence'
import { TASKS } from 'nook-core/paths'
import { db } from '../firebase'
import { notifyFailure, markLocal } from './useToasts'
import { useSyncStatus } from './useSyncStatus'

const REF = doc(db, ...TASKS)

// Apply the recurrence reset to every person's list. Returns the same object
// when nothing was due, so callers can compare by identity.
function withResets(data) {
  let changed = false
  const out = {}
  for (const [key, list] of Object.entries(data)) {
    out[key] = list
    if (!Array.isArray(list)) continue
    const reset = resetElapsed(list)
    if (reset.some((t, i) => t !== list[i])) { out[key] = reset; changed = true }
  }
  return changed ? out : data
}

export function useTasks() {
  const [tasks, setTasks]   = useState({ blessing: [], pearl: [] })
  const [synced, setSynced] = useState(false)
  const [error, setError]   = useState(null)
  const rawRef       = useRef(null)   // last snapshot, before the local reset view
  const viewRef      = useRef(tasks)
  const resettingRef = useRef(false)
  const { status, track, during } = useSyncStatus()

  // Show the reset immediately, then persist it. The write re-reads the
  // document inside a transaction and touches only the lists that actually
  // have something due, so a chore someone else just added or ticked is not
  // overwritten by this phone's older copy.
  const applyResets = useCallback(() => {
    const raw = rawRef.current
    if (!raw) return
    const view = withResets(raw)
    viewRef.current = view
    setTasks(view)
    if (view === raw || resettingRef.current || !navigator.onLine) return
    resettingRef.current = true
    runTransaction(db, async txn => {
      const snap = await txn.get(REF)
      if (!snap.exists()) return
      const fresh = snap.data()
      const reset = withResets(fresh)
      if (reset === fresh) return
      const patch = {}
      for (const key of Object.keys(reset)) {
        if (reset[key] !== fresh[key]) patch[key] = reset[key]
      }
      txn.update(REF, patch)
    })
      .catch(err => console.warn('Chore reset not saved:', err?.message || err))
      .finally(() => { resettingRef.current = false })
  }, [])

  useEffect(() => {
    return onSnapshot(REF, { includeMetadataChanges: true },
      snap => {
        track(snap)
        rawRef.current = snap.data() || {}
        applyResets()
        setSynced(true)
        setError(null)
      },
      err => setError(err.message)
    )
  }, [track, applyResets])

  // No snapshot arrives just because the clock passed midnight, so an app
  // left open would keep showing yesterday's ticks. Daily, weekly and monthly
  // boundaries all fall on a local midnight.
  useEffect(() => {
    let timer
    const schedule = () => {
      timer = setTimeout(() => { applyResets(); schedule() }, nextMidnight(Date.now()) - Date.now() + 1000)
    }
    schedule()
    // Timers are throttled or dropped while a PWA is backgrounded.
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return
      applyResets()
      clearTimeout(timer)
      schedule()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      clearTimeout(timer)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [applyResets])

  // Optimistic local update, then the same change applied to freshly read
  // server data. Resolves true/false; never rejects.
  const mutate = (person, change, failMsg) => {
    const view = { ...viewRef.current, [person]: change(viewRef.current[person] || []) }
    viewRef.current = view
    setTasks(view)
    return during(runTransaction(db, async txn => {
      const snap = await txn.get(REF)
      const list = snap.data()?.[person]
      txn.set(REF, { [person]: change(Array.isArray(list) ? list : []) }, { merge: true })
    })).then(() => true, err => {
      applyResets() // drop the optimistic change
      return notifyFailure(failMsg, err)
    })
  }

  const toggle = (person, id) => {
    const current = (viewRef.current[person] || []).find(t => t.id === id)
    if (!current) return Promise.resolve(false)
    // Decide the target from what the user was looking at. Flipping whatever
    // the server holds would undo the tap if the display got there first.
    const done = !current.done
    return mutate(person,
      list => list.map(t => (t.id === id && !!t.done !== done
        ? { ...t, done, completedAt: done ? Date.now() : null }
        : t)),
      'Could not update the task.')
  }

  const add = (person, text, recurrence = 'none') => {
    const trimmed = text.trim()
    if (!trimmed) return Promise.resolve(false)
    const item = { id: Date.now(), task: trimmed, done: false, recurrence, completedAt: null }
    markLocal(item.id)
    return mutate(person, list => [...list, item], `Could not add "${trimmed}".`)
  }

  const remove = (person, id) =>
    mutate(person, list => list.filter(t => t.id !== id), 'Could not delete the task.')

  const clearArchive = (person) =>
    mutate(person, list => list.filter(t => !t.done), 'Could not clear completed tasks.')

  return { tasks, synced, error, status, toggle, add, remove, clearArchive }
}
