import { useState, useEffect } from 'react'
import { useGroceries } from '../hooks/useGroceries'

export default function GroceriesTab() {
  const { items, synced, error, add, toggle, remove, clearDone, remoteUpdate } = useGroceries()
  const [input, setInput]           = useState('')
  const [confirmClear, setConfirmClear] = useState(false)
  const [showBanner, setShowBanner] = useState(false)

  const submit = () => {
    if (!input.trim()) return
    add(input)
    setInput('')
  }

  const doneCount = items.filter(i => i.done).length

  // Show inline banner when a remote teammate adds items
  useEffect(() => {
    if (!remoteUpdate) return
    setShowBanner(true)
    const t = setTimeout(() => setShowBanner(false), 3000)
    return () => clearTimeout(t)
  }, [remoteUpdate])

  return (
    <div className="tab-content">
      <div className="tab-header">
        <h2 className="tab-title">Groceries</h2>
        <div className="tab-header-right">
          {doneCount > 0 && (
            <button
              className="clear-btn"
              style={confirmClear ? { color: '#c53030' } : {}}
              onClick={() => {
                if (confirmClear) {
                  clearDone()
                  setConfirmClear(false)
                } else {
                  setConfirmClear(true)
                  setTimeout(() => setConfirmClear(false), 3000)
                }
              }}
            >
              {confirmClear ? 'Confirm? Tap again' : `Clear ${doneCount} ✓`}
            </button>
          )}
          <span className={synced ? 'sync-ok' : 'sync-err'}>
            {error ? '⚠ offline' : synced ? '● live' : '…'}
          </span>
        </div>
      </div>

      {showBanner && (
        <div className="remote-update-banner">List updated ↑</div>
      )}

      <ul className="item-list">
        {items.length === 0 && (
          <p className="empty-msg">Nothing on the list</p>
        )}
        {items.map(item => (
          <li key={item.id} className={`item-row ${item.done ? 'item-row--done' : ''}`}>
            <button
              className={`item-check ${item.done ? 'item-check--done' : ''}`}
              style={item.done ? { background: '#22c55e', borderColor: '#22c55e' } : {}}
              aria-label={item.done ? `Uncheck ${item.name}` : `Check off ${item.name}`}
              onClick={() => toggle(item.id)}
            >
              {item.done ? '✓' : ''}
            </button>
            <span className="item-label">{item.name}</span>
            <button className="item-del" aria-label={`Remove ${item.name}`} onClick={() => remove(item.id)}>✕</button>
          </li>
        ))}
      </ul>

      <div className="add-row">
        <input
          className="add-input"
          placeholder="Add item…"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && submit()}
          autoCapitalize="sentences"
        />
        <button className="add-btn" style={{ background: '#22c55e' }} onClick={submit}>+</button>
      </div>
    </div>
  )
}
