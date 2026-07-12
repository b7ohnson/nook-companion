import { useState, lazy, Suspense } from 'react'
import { useAuth } from './hooks/useAuth'
import { useDarkMode } from './hooks/useDarkMode'
import { useNotifications } from './hooks/useNotifications'
import LoginPage from './components/LoginPage'
import HomeTab from './components/HomeTab'
import TasksTab from './components/TasksTab'
import GroceriesTab from './components/GroceriesTab'
import CalendarTab from './components/CalendarTab'
import MenuManager from './components/MenuManager'
import ToastNotifications from './components/ToastNotifications'
import { IconHome, IconCheckSquare, IconShoppingCart, IconCalendar, IconSun, IconMoon, IconCamera, IconUtensils } from './components/Icons'

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

export default function App() {
  const { user, loading, signIn, logOut } = useAuth()
  const { dark, toggle: toggleDark } = useDarkMode()
  const { toasts, dismiss } = useNotifications()
  const [tab, setTab] = useState('home')

  // Path-based game room routing (no auth required)
  const path = window.location.pathname
  if (path.startsWith('/play/headsup/')) {
    const roomCode = path.replace('/play/headsup/', '').replace(/\//g, '')
    return (
      <Suspense fallback={<div className="splash"><div className="splash-spinner" /></div>}>
        <HeadsUpPhone roomCode={roomCode} />
      </Suspense>
    )
  }
  if (path.startsWith('/play/')) {
    const roomCode = path.replace('/play/', '').replace(/\//g, '')
    return (
      <Suspense fallback={<div className="splash"><div className="splash-spinner" /></div>}>
        <PlayRoom roomCode={roomCode} />
      </Suspense>
    )
  }

  if (loading) return (
    <div className="splash">
      <div className="splash-spinner" />
    </div>
  )

  if (!user) return <LoginPage onSignIn={signIn} />

  return (
    <div className="app">
      <ToastNotifications toasts={toasts} dismiss={dismiss} />
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
          <button
            className="dark-toggle"
            onClick={toggleDark}
            aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'}
            title={dark ? 'Light mode' : 'Dark mode'}
          >
            {dark ? <IconSun size={16} /> : <IconMoon size={16} />}
          </button>
          {user.photoURL
            ? <button className="app-bar-avatar app-bar-avatar--photo" onClick={logOut} aria-label="Sign out">
                <img src={user.photoURL} alt="" className="app-bar-avatar-img" />
              </button>
            : <button className="app-bar-avatar app-bar-avatar--initial" onClick={logOut} aria-label="Sign out">
                {user.displayName?.[0] || '?'}
              </button>
          }
        </div>
      </header>

      <main className="app-body">
        <div hidden={tab !== 'home'}>      <HomeTab user={user} onNavigate={setTab} /></div>
        <div hidden={tab !== 'tasks'}>     <TasksTab /></div>
        <div hidden={tab !== 'groceries'}> <GroceriesTab /></div>
        <div hidden={tab !== 'menu'}>      <MenuManager /></div>
        <div hidden={tab !== 'calendar'}>  <CalendarTab /></div>
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
            onClick={() => setTab(id)}
            aria-current={tab === id ? 'page' : undefined}
          >
            <span className="nav-icon"><Icon size={20} /></span>
            <span className="nav-label">{label}</span>
          </button>
        ))}
      </nav>
    </div>
  )
}
