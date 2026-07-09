import { IconCheckSquare, IconShoppingCart, IconBell } from './Icons'

const TYPE_META = {
  task:    { Icon: IconCheckSquare, color: '#4A90D9' },
  grocery: { Icon: IconShoppingCart, color: '#22c55e' },
  info:    { Icon: IconBell,         color: '#f59e0b' },
}

export default function ToastNotifications({ toasts, dismiss }) {
  if (!toasts.length) return null
  return (
    <div className="toast-stack">
      {toasts.map(t => {
        const { Icon, color } = TYPE_META[t.type] || TYPE_META.info
        return (
          <div key={t.id} className="toast" style={{ '--toast-accent': color }}>
            <span className="toast-icon" style={{ color }}><Icon size={14} /></span>
            <span className="toast-msg">{t.message}</span>
            <button className="toast-close" onClick={() => dismiss(t.id)}>✕</button>
          </div>
        )
      })}
    </div>
  )
}
