import { useState, useEffect } from 'react'
import { useGroceries } from '../hooks/useGroceries'
import { IconCheck, IconX, IconPlus, IconCloudOff } from './Icons'

// Quiet while live; only says something when it is saving or offline.
function SyncNote({ synced, status }) {
  if (!synced) return <span className="sync-note">Loading…</span>
  if (status === 'offline') return <span className="sync-note sync-note--offline"><IconCloudOff size={14} /> Offline</span>
  if (status === 'saving') return <span className="sync-note">Saving…</span>
  return null
}

export default function GroceriesTab() {
  const { items, synced, status, add, toggle, remove, clearDone, remoteUpdate } = useGroceries()
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
          <SyncNote synced={synced} status={status} />
          {doneCount > 0 && (
            <button
              className={`clear-btn ${confirmClear ? 'clear-btn--confirm' : ''}`}
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
              {confirmClear ? 'Tap again to clear' : `Clear ${doneCount} bought`}
            </button>
          )}
        </div>
      </div>

      <div className="add-row">
        <input
          className="add-input"
          placeholder="Add to the list"
          aria-label="Grocery item"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && submit()}
          autoCapitalize="sentences"
          enterKeyHint="done"
        />
        <button className="add-btn" aria-label="Add item" disabled={!input.trim()} onClick={submit}>
          <IconPlus size={22} />
        </button>
      </div>

      {showBanner && (
        <div className="remote-update-banner" role="status">List updated.</div>
      )}

      {synced && items.length === 0 ? (
        <p className="empty-msg">Nothing to buy.</p>
      ) : (
        <ul className="item-list">
          {items.map(item => (
            <li key={item.id} className={`item-row ${item.done ? 'item-row--done' : ''}`}>
              <button
                className="item-check"
                aria-label={item.done ? `Put ${item.name} back on the list` : `Mark ${item.name} bought`}
                aria-pressed={item.done}
                onClick={() => toggle(item.id)}
              >
                <span className={`item-check-box ${item.done ? 'item-check-box--done' : ''}`}>
                  {item.done && <IconCheck size={14} />}
                </span>
              </button>
              <span className="item-label">{item.name}</span>
              <button className="item-del" aria-label={`Remove ${item.name}`} onClick={() => remove(item.id)}>
                <IconX size={18} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
