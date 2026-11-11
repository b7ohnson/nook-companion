import { initializeApp } from 'firebase/app'
import {
  initializeFirestore, getFirestore,
  persistentLocalCache, persistentMultipleTabManager,
} from 'firebase/firestore'
import { getAuth } from 'firebase/auth'
import { getStorage } from 'firebase/storage'

const app = initializeApp({
  apiKey:            import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain:        import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId:         import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket:     import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId:             import.meta.env.VITE_FIREBASE_APP_ID,
})

// IndexedDB-backed cache, mirroring the display app. With the default memory
// cache a write queued while offline lived only in the page, and iOS kills a
// backgrounded PWA freely — the check-off was simply gone on next launch.
//
// Persistence can be unavailable (private browsing, no IndexedDB quota) and
// initializeFirestore throws in that case; fall back to the in-memory client
// so the app still works online.
function createDb() {
  try {
    return initializeFirestore(app, {
      localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
    })
  } catch (err) {
    console.warn('Firestore persistence unavailable, using in-memory cache:', err?.message || err)
    return getFirestore(app)
  }
}

export const db      = createDb()
export const auth    = getAuth(app)
export const storage = getStorage(app)
