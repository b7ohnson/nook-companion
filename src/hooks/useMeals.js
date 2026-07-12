import { useState, useEffect } from 'react'
import { doc, onSnapshot, setDoc, updateDoc, deleteField } from 'firebase/firestore'
import { db } from '../firebase'

export function useMeals() {
  const [meals, setMeals] = useState({})
  const [synced, setSynced] = useState(false)

  useEffect(() => {
    const ref = doc(db, 'skylight', 'meals')
    return onSnapshot(ref, snap => {
      setMeals(snap.exists() ? snap.data() : {})
      setSynced(true)
    })
  }, [])

  const setMeal = async (date, slot, value) => {
    const ref = doc(db, 'skylight', 'meals')
    await setDoc(ref, { [date]: { ...(meals[date] || {}), [slot]: value } }, { merge: true })
  }

  const deleteMeal = async (date, slot) => {
    const ref = doc(db, 'skylight', 'meals')
    await updateDoc(ref, { [`${date}.${slot}`]: deleteField() })
  }

  return { meals, synced, setMeal, deleteMeal }
}
