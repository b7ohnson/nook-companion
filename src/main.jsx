import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import './index.css'
import App from './App'
import { notify } from './hooks/useToasts'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>
)

const updateSW = registerSW({
  onNeedRefresh() {
    notify(
      <button className="toast-action" onClick={() => updateSW(true)}>
        New version, tap to reload
      </button>,
      'info',
      { duration: 0 }
    )
  },
  onRegisteredSW(_url, registration) {
    if (!registration) return
    // A PWA resumed from the app switcher never navigates, so the browser
    // never looks for a new worker on its own.
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') registration.update().catch(() => {})
    })
  },
})
