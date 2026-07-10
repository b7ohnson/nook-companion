import { useState } from 'react'
import { useGroceries } from '../hooks/useGroceries'

export default function GroceriesTab() {
  const { items, synced, error, add, toggle, remove, clearDone } = useGroceries()
  const [input, setInput]           = useState('')
  const [confirmClear, setConfirmClear] = useState(false)

  const submit = () => {
    if (!input.trim()) return
    add(input)
    setInput('')
  }

  const doneCount = items.filter(i => i.done).length

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

      <div className="add-row">
        <input
          className="add-input"
          placeholder="Add item…"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && submit()}
        />
        <button className="add-btn" style={{ background: '#22c55e' }} onClick={submit}>+</button>
      </div>

      <div className="item-list">
        {items.length === 0 && (
          <p className="empty-msg">Nothing on the list</p>
        )}
        {items.map(item => (
          <div key={item.id} className={`item-row ${item.done ? 'item-row--done' : ''}`}>
            <button
              className={`item-check ${item.done ? 'item-check--done' : ''}`}
              style={item.done ? { background: '#22c55e', borderColor: '#22c55e' } : {}}
              onClick={() => toggle(item.id)}
            >
              {item.done ? '✓' : ''}
            </button>
            <span className="item-label">{item.name}</span>
            <button className="item-del" onClick={() => remove(item.id)}>✕</button>
          </div>
        ))}
      </div>
    </div>
  )
}
