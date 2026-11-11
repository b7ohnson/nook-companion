import { useState, useEffect } from 'react'
import { doc, onSnapshot, setDoc, updateDoc, deleteField } from 'firebase/firestore'
import { MEALS } from 'nook-core/paths'
import { db } from '../firebase'
import { notifyFailure } from './useToasts'
import { useSyncStatus } from './useSyncStatus'

const REF = doc(db, ...MEALS)

export function useMeals() {
  const [meals, setMeals]   = useState({})
  const [synced, setSynced] = useState(false)
  const [error, setError]   = useState(null)
  const { status, track }   = useSyncStatus()

  useEffect(() => {
    return onSnapshot(REF, { includeMetadataChanges: true },
      snap => {
        track(snap)
        setMeals(snap.exists() ? snap.data() : {})
        setSynced(true)
        setError(null)
      },
      err => { console.error(err); setError(err.message) }
    )
  }, [track])

  // Both resolve true/false and never reject. Offline they queue, and the
  // promise settles once the server has the write.

  // Only the changed slot: merge is deep, so the day's other slots are left
  // alone. Spreading the local copy of the day into the write could bring
  // back a meal someone else had just cleared.
  const setMeal = (date, slot, value) =>
    setDoc(REF, { [date]: { [slot]: value } }, { merge: true })
      .then(() => true, err => notifyFailure('Could not save the meal.', err))

  const deleteMeal = (date, slot) =>
    updateDoc(REF, { [`${date}.${slot}`]: deleteField() })
      .then(() => true, err => notifyFailure('Could not clear the meal.', err))

  return { meals, synced, error, status, setMeal, deleteMeal }
}
