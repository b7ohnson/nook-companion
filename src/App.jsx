import { useState } from 'react'
import { useAuth } from './hooks/useAuth'
import { useDarkMode } from './hooks/useDarkMode'
import { useNotifications } from './hooks/useNotifications'
import LoginPage from './components/LoginPage'
import HomeTab from './components/HomeTab'
import TasksTab from './components/TasksTab'
import GroceriesTab from './components/GroceriesTab'
import CalendarTab from './components/CalendarTab'
import ToastNotifications from './components/ToastNotifications'
import PlayRoom from './components/PlayRoom'
import HeadsUpPhone from './components/HeadsUpPhone'
import { IconHome, IconCheckSquare, IconShoppingCart, IconCalendar, IconSun, IconMoon } from './components/Icons'

const TABS = [
  { id: 'home',      label: 'Home',      Icon: IconHome         },
  { id: 'tasks',     label: 'Tasks',     Icon: IconCheckSquare  },
  { id: 'groceries', label: 'Groceries', Icon: IconShoppingCart },
  { id: 'calendar',  label: 'Calendar',  Icon: IconCalendar     },
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
    return <HeadsUpPhone roomCode={roomCode} />
  }
  if (path.startsWith('/play/')) {
    const roomCode = path.replace('/play/', '').replace(/\//g, '')
    return <PlayRoom roomCode={roomCode} />
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
        <div className="app-bar-left">
          <span className="app-bar-icon"><IconHome size={18} /></span>
          <span className="app-bar-title">NooK</span>
        </div>
        <div className="app-bar-right">
          <button className="dark-toggle" onClick={toggleDark} title={dark ? 'Light mode' : 'Dark mode'}>
            {dark ? <IconSun size={16} /> : <IconMoon size={16} />}
          </button>
          {user.photoURL
            ? <img src={user.photoURL} alt="" className="app-bar-avatar" onClick={logOut} />
            : <button className="app-bar-avatar app-bar-avatar--initial" onClick={logOut}>
                {user.displayName?.[0] || '?'}
              </button>
          }
        </div>
      </header>

      <main className="app-body">
        {tab === 'home'      && <HomeTab user={user} />}
        {tab === 'tasks'     && <TasksTab />}
        {tab === 'groceries' && <GroceriesTab />}
        {tab === 'calendar'  && <CalendarTab />}
      </main>

      <nav className="bottom-nav">
        {TABS.map(({ id, label, Icon }) => (
          <button
            key={id}
            className={`nav-btn ${tab === id ? 'nav-btn--active' : ''}`}
            onClick={() => setTab(id)}
          >
            <span className="nav-icon"><Icon size={20} /></span>
            <span className="nav-label">{label}</span>
          </button>
        ))}
      </nav>
    </div>
  )
}
