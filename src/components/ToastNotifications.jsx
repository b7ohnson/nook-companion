import { IconCheckSquare, IconShoppingCart, IconBell, IconAlertTriangle, IconX } from './Icons'

// The toast is a navy bar in both themes, so its accents are the light
// variants of the brand/status colours that hold up against navy.
const TYPE_META = {
  task:    { Icon: IconCheckSquare,   color: '#8DB6D6' },
  grocery: { Icon: IconShoppingCart,  color: '#84C49A' },
  info:    { Icon: IconBell,          color: '#F0A500' },
  error:   { Icon: IconAlertTriangle, color: '#EE9483' },
}

export default function ToastNotifications({ toasts, dismiss }) {
  if (!toasts.length) return null
  return (
    <div className="toast-stack" aria-live="polite" aria-atomic="true">
      {toasts.map(t => {
        const { Icon, color } = TYPE_META[t.type] || TYPE_META.info
        return (
          <div key={t.id} className="toast" style={{ '--toast-accent': color }} role={t.type === 'error' ? 'alert' : undefined}>
            <span className="toast-icon"><Icon size={16} /></span>
            <span className="toast-msg">{t.message}</span>
            <button className="toast-close" onClick={() => dismiss(t.id)} aria-label="Dismiss"><IconX size={16} /></button>
          </div>
        )
      })}
    </div>
  )
}
