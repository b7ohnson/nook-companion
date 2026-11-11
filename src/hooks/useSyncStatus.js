import { useState, useEffect, useCallback } from 'react'

/**
 * Connection status for one Firestore listener: 'live' | 'saving' | 'offline'.
 *
 *   const { status, track, during } = useSyncStatus()
 *   onSnapshot(ref, { includeMetadataChanges: true }, snap => { track(snap) ... })
 *   during(runTransaction(...))   // counts as 'saving' until it settles
 *
 * A listener error alone is not enough: Firestore keeps serving the cache in
 * airplane mode without ever calling the error callback.
 */
export function useSyncStatus() {
  const [online, setOnline]     = useState(() => navigator.onLine)
  const [meta, setMeta]         = useState({ fromCache: true, pending: false })
  const [inFlight, setInFlight] = useState(0)

  useEffect(() => {
    const up   = () => setOnline(true)
    const down = () => setOnline(false)
    window.addEventListener('online', up)
    window.addEventListener('offline', down)
    return () => {
      window.removeEventListener('online', up)
      window.removeEventListener('offline', down)
    }
  }, [])

  const track = useCallback((snap) => {
    const { fromCache, hasPendingWrites: pending } = snap.metadata
    setMeta(prev => (prev.fromCache === fromCache && prev.pending === pending ? prev : { fromCache, pending }))
  }, [])

  const during = useCallback((promise) => {
    setInFlight(n => n + 1)
    const done = () => setInFlight(n => n - 1)
    promise.then(done, done)
    return promise
  }, [])

  const status = !online ? 'offline'
    : (meta.pending || inFlight > 0) ? 'saving'
    : meta.fromCache ? 'offline'
    : 'live'

  return { status, track, during }
}
