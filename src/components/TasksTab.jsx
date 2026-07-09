import { useState } from 'react'
import { useTasks } from '../hooks/useTasks'

const PEOPLE = [
  { id: 'blessing', label: 'Blessing', color: '#3B82F6' },
  { id: 'pearl',    label: 'Pearl',    color: '#A855F7' },
]

export default function TasksTab() {
  const { tasks, synced, error, toggle, add, remove } = useTasks()
  const [active, setActive] = useState('blessing')
  const [input, setInput]   = useState('')

  const person = PEOPLE.find(p => p.id === active)
  const list   = tasks[active] || []

  const submit = () => {
    if (!input.trim()) return
    add(active, input)
    setInput('')
  }

  return (
    <div className="tab-content">
      <div className="tab-header">
        <h2 className="tab-title">Tasks</h2>
        <span className={synced ? 'sync-ok' : 'sync-err'}>
          {error ? '⚠ offline' : synced ? '● live' : '…'}
        </span>
      </div>

      <div className="person-tabs">
        {PEOPLE.map(p => (
          <button
            key={p.id}
            className={`person-tab ${active === p.id ? 'person-tab--active' : ''}`}
            style={active === p.id ? { borderColor: p.color, color: p.color } : {}}
            onClick={() => setActive(p.id)}
          >
            {p.label}
          </button>
        ))}
      </div>

      <div className="add-row">
        <input
          className="add-input"
          placeholder={`Add task for ${person.label}…`}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && submit()}
        />
        <button
          className="add-btn"
          style={{ background: person.color }}
          onClick={submit}
        >+</button>
      </div>

      <div className="item-list">
        {list.length === 0 && (
          <p className="empty-msg">No tasks — add one above</p>
        )}
        {list.map(item => (
          <div key={item.id} className={`item-row ${item.done ? 'item-row--done' : ''}`}>
            <button
              className={`item-check ${item.done ? 'item-check--done' : ''}`}
              style={item.done ? { background: person.color, borderColor: person.color } : {}}
              onClick={() => toggle(active, item.id)}
            >
              {item.done ? '✓' : ''}
            </button>
            <span className="item-label">{item.task}</span>
            <button className="item-del" onClick={() => remove(active, item.id)}>✕</button>
          </div>
        ))}
      </div>
    </div>
  )
}
