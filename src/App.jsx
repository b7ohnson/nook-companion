import { Component, useState, lazy, Suspense } from 'react'
import { useAuth } from './hooks/useAuth'
import { useDarkMode } from './hooks/useDarkMode'
import { useNotifications } from './hooks/useNotifications'
import { useToasts } from './hooks/useToasts'
import LoginPage from './components/LoginPage'
import HomeTab from './components/HomeTab'
import TasksTab from './components/TasksTab'
import GroceriesTab from './components/GroceriesTab'
import CalendarTab from './components/CalendarTab'
import MenuManager from './components/MenuManager'
import ToastNotifications from './components/ToastNotifications'
import { IconHome, IconCheckSquare, IconShoppingCart, IconCalendar, IconSun, IconMoon, IconCamera, IconUtensils, IconBell } from './components/Icons'

const GalleryPanel  = lazy(() => import('./components/GalleryPanel'))
const PlayRoom      = lazy(() => import('./components/PlayRoom'))
const HeadsUpPhone  = lazy(() => import('./components/HeadsUpPhone'))

const TABS = [
  { id: 'home',      label: 'Home',      Icon: IconHome         },
  { id: 'tasks',     label: 'Tasks',     Icon: IconCheckSquare  },
  { id: 'groceries', label: 'Groceries', Icon: IconShoppingCart },
  { id: 'menu',      label: 'Menu',      Icon: IconUtensils     },
  { id: 'calendar',  label: 'Calendar',  Icon: IconCalendar     },
  { id: 'gallery',   label: 'Gallery',   Icon: IconCamera       },
]

// Without a boundary any error thrown during render unmounts the whole tree
// and leaves a blank white page with no way back.
class ErrorBoundary extends Component {
  state = { error: null }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    console.error('NooK crashed:', error, info?.componentStack)
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <div className="splash app-crash" role="alert">
        <p className="app-crash-title">Something went wrong</p>
        <p className="app-crash-sub">Your lists are safe. Reloading usually fixes it.</p>
        <button className="app-crash-btn" onClick={() => window.location.reload()}>Reload NooK</button>
      </div>
    )
  }
}

export default function App() {
  return (
    <ErrorBoundary>
      <AppRoutes />
    </ErrorBoundary>
  )
}

function AppRoutes() {
  const { user, loading, signIn, logOut } = useAuth()
  // Theme is applied to <html>, so it has to cover the login and /play screens.
  const { dark, toggle: toggleDark } = useDarkMode()
  // Rendered on every screen: sign-in failures and "new version" prompts
  // have to be visible before anyone is signed in.
  const { toasts, dismiss } = useToasts()
  const toastStack = <ToastNotifications toasts={toasts} dismiss={dismiss} />

  // Path-based game room routing (no auth required)
  const path = window.location.pathname
  if (path.startsWith('/play/headsup/')) {
    const roomCode = path.replace('/play/headsup/', '').replace(/\//g, '')
    return (
      <Suspense fallback={<div className="splash"><div className="splash-spinner" /></div>}>
        {toastStack}
        <HeadsUpPhone roomCode={roomCode} />
      </Suspense>
    )
  }
  if (path.startsWith('/play/')) {
    const roomCode = path.replace('/play/', '').replace(/\//g, '')
    return (
      <Suspense fallback={<div className="splash"><div className="splash-spinner" /></div>}>
        {toastStack}
        <PlayRoom roomCode={roomCode} />
      </Suspense>
    )
  }

  if (loading) return (
    <div className="splash">
      <div className="splash-spinner" />
    </div>
  )

  if (!user) return <>{toastStack}<LoginPage onSignIn={signIn} /></>

  return <>{toastStack}<SignedInApp user={user} logOut={logOut} dark={dark} toggleDark={toggleDark} /></>
}

// Firestore work lives below the auth gate. React runs hooks unconditionally,
// so while useNotifications sat in App() it subscribed to skylight/tasks on the
// login screen — and on the unauthenticated /play routes a QR guest lands on,
// where the rules deny it outright.
function SignedInApp({ user, logOut, dark, toggleDark }) {
  const { permission, requestPermission } = useNotifications()
  const [tab, setTab] = useState('home')
  // The calendar loads Google's sign-in script and may start an OAuth
  // refresh, so it mounts on first visit rather than at startup. Once
  // mounted it stays, like the other tabs.
  const [calendarOpened, setCalendarOpened] = useState(false)
  const [confirmSignOut, setConfirmSignOut] = useState(false)

  const goTo = (id) => {
    if (id === 'calendar') setCalendarOpened(true)
    setTab(id)
  }

  return (
    <div className="app">
      <header className="app-bar">
        <h1 className="sr-only">NooK</h1>
        <div className="app-bar-left">
          <svg className="app-bar-mark" width="22" height="25" viewBox="0 0 64 74" aria-hidden="true">
            <path d="M7,70 L7,31 C7,14 19,5 32,5 C45,5 57,14 57,31 L57,70"
                  stroke="#F0A500" strokeWidth="3.5" fill="none"
                  strokeLinecap="round" strokeLinejoin="round"/>
            <line x1="3" y1="70" x2="61" y2="70"
                  stroke="#F0A500" strokeWidth="3.5" strokeLinecap="round"/>
            <circle cx="21" cy="40" r="10" fill="#4A7FA5"/>
            <circle cx="43" cy="40" r="10" fill="#F0A500"/>
          </svg>
          <span className="app-bar-title">NooK</span>
        </div>
        <div className="app-bar-right">
          {permission === 'default' && (
            <button
              className="dark-toggle"
              onClick={requestPermission}
              aria-label="Turn on notifications"
              title="Turn on notifications"
            >
              <IconBell size={16} />
            </button>
          )}
          <button
            className="dark-toggle"
            onClick={toggleDark}
            aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'}
            title={dark ? 'Light mode' : 'Dark mode'}
          >
            {dark ? <IconSun size={16} /> : <IconMoon size={16} />}
          </button>
          {user.photoURL
            ? <button className="app-bar-avatar app-bar-avatar--photo" onClick={() => setConfirmSignOut(true)} aria-label="Account, sign out">
                <img src={user.photoURL} alt="" className="app-bar-avatar-img" />
              </button>
            : <button className="app-bar-avatar app-bar-avatar--initial" onClick={() => setConfirmSignOut(true)} aria-label="Account, sign out">
                {user.displayName?.[0] || '?'}
              </button>
          }
        </div>
      </header>

      <main className="app-body">
        <div hidden={tab !== 'home'}>      <HomeTab user={user} onNavigate={goTo} /></div>
        <div hidden={tab !== 'tasks'}>     <TasksTab /></div>
        <div hidden={tab !== 'groceries'}> <GroceriesTab /></div>
        <div hidden={tab !== 'menu'}>      <MenuManager /></div>
        <div hidden={tab !== 'calendar'}>  {calendarOpened && <CalendarTab />}</div>
        <div hidden={tab !== 'gallery'}>
          <Suspense fallback={<div className="splash"><div className="splash-spinner" /></div>}>
            <GalleryPanel onClose={() => setTab('home')} />
          </Suspense>
        </div>
      </main>

      <nav className="bottom-nav">
        {TABS.map(({ id, label, Icon }) => (
          <button
            key={id}
            className={`nav-btn ${tab === id ? 'nav-btn--active' : ''}`}
            onClick={() => goTo(id)}
            aria-current={tab === id ? 'page' : undefined}
          >
            <span className="nav-icon"><Icon size={20} /></span>
            <span className="nav-label">{label}</span>
          </button>
        ))}
      </nav>

      {confirmSignOut && (
        <div className="sheet-overlay" onClick={e => e.target === e.currentTarget && setConfirmSignOut(false)}>
          <div className="sheet" role="dialog" aria-modal="true" aria-label="Sign out">
            <div className="sheet-handle" />
            <div className="sheet-header">
              <span className="sheet-title">Sign out of NooK?</span>
              <button className="sheet-close" onClick={() => setConfirmSignOut(false)} aria-label="Close">✕</button>
            </div>
            <div className="sheet-body">
              <p className="signout-who">Signed in as {user.displayName || user.email || 'this account'}.</p>
            </div>
            <div className="sheet-footer">
              <div style={{ flex: 1 }} />
              <button className="sheet-btn sheet-btn--cancel" onClick={() => setConfirmSignOut(false)}>Cancel</button>
              <button className="sheet-btn sheet-btn--delete" onClick={() => { setConfirmSignOut(false); logOut() }}>Sign out</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
