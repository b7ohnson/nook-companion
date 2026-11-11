import { useState, useEffect } from 'react'
import { GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged } from 'firebase/auth'
import { auth } from '../firebase'
import { notify } from './useToasts'

const provider = new GoogleAuthProvider()
provider.addScope('email')
provider.addScope('profile')

// The user closing the popup themselves is not worth a message.
const SILENT = new Set(['auth/popup-closed-by-user', 'auth/cancelled-popup-request'])

const MESSAGES = {
  'auth/popup-blocked': 'Sign-in popup was blocked. Allow pop-ups for NooK and try again.',
  'auth/network-request-failed': 'No connection. Check your signal and try again.',
}

export function useAuth() {
  const [user, setUser] = useState(undefined)

  useEffect(() => onAuthStateChanged(auth, u => setUser(u || null)), [])

  const signIn = () => signInWithPopup(auth, provider).catch(err => {
    if (SILENT.has(err.code)) return
    console.error(err)
    notify(MESSAGES[err.code] || 'Sign-in failed. Please try again.', 'error', { duration: 8000 })
  })

  const logOut = () => signOut(auth).catch(err => {
    console.error(err)
    notify('Could not sign out. Please try again.', 'error')
  })

  return { user, loading: user === undefined, signIn, logOut }
}
