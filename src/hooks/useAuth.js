import { useState, useEffect } from 'react'
import { GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged } from 'firebase/auth'
import { auth } from '../firebase'

const provider = new GoogleAuthProvider()
provider.addScope('email')
provider.addScope('profile')

export function useAuth() {
  const [user, setUser] = useState(undefined)

  useEffect(() => onAuthStateChanged(auth, u => setUser(u || null)), [])

  const signIn = () => signInWithPopup(auth, provider).catch(err => {
    if (err.code !== 'auth/popup-closed-by-user') console.error(err)
  })

  const logOut = () => signOut(auth)

  return { user, loading: user === undefined, signIn, logOut }
}
