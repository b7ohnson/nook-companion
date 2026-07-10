import { useState, useRef, useEffect } from 'react'
import { useTasks } from '../hooks/useTasks'
import { IconAlertTriangle, IconCheck } from './Icons'

const PEOPLE = [
  { id: 'blessing', label: 'Blessing', color: '#3B82F6' },
  { id: 'pearl',    label: 'Pearl',    color: '#A855F7' },
]

const RECURRENCE_OPTS = [
  { value: 'none',    label: 'Once',    icon: '1×',  desc: 'No repeat' },
  { value: 'daily',   label: 'Daily',   icon: '↻',   desc: 'Every day' },
  { value: 'weekly',  label: 'Weekly',  icon: '↻',   desc: 'Every week' },
  { value: 'monthly', label: 'Monthly', icon: '↻',   desc: 'Every month' },
]

const RECUR_LABEL = { daily: 'Daily', weekly: 'Weekly', monthly: 'Monthly' }
const RECUR_COLOR = { daily: '#f59e0b', weekly: '#3b82f6', monthly: '#8b5cf6' }

function nextReset(task) {
  if (!task.recurrence || task.recurrence === 'none' || !task.completedAt) return ''
  const MS = { daily: 86400000, weekly: 604800000, monthly: 2592000000 }
  const diff = task.completedAt + (MS[task.recurrence] || 0) - Date.now()
  if (diff <= 0) return 'resetting…'
  const d = Math.floor(diff / 86400000)
  const h = Math.floor(diff / 3600000)
  return d >= 1 ? `resets in ${d}d` : `resets in ${h}h`
}

function AddModal({ person, onAdd, onClose }) {
  const [text, setText]             = useState('')
  const [recurrence, setRecurrence] = useState(null)
  const modalRef    = useRef(null)
  const prevFocusRef = useRef(null)

  const canSubmit = text.trim() && recurrence !== null

  const submit = () => {
    if (!canSubmit) return
    onAdd(text, recurrence)
    onClose()
  }

  // Save previously focused element and restore on unmount
  useEffect(() => {
    prevFocusRef.current = document.activeElement
    return () => { if (prevFocusRef.current) prevFocusRef.current.focus() }
  }, [])

  // Escape to close
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  // Focus trap: cycle Tab/Shift+Tab within modal
  useEffect(() => {
    const modal = modalRef.current
    if (!modal) return
    const onKey = (e) => {
      if (e.key !== 'Tab') return
      const focusable = Array.from(modal.querySelectorAll(
        'button:not([disabled]), input, [tabindex]:not([tabindex="-1"])'
      ))
      if (!focusable.length) return
      const first = focusable[0]
      const last  = focusable[focusable.length - 1]
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault(); last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault(); first.focus()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  return (
    <div className="task-modal-backdrop" onClick={onClose}>
      <div
        className="task-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-task-modal-title"
        ref={modalRef}
        onClick={e => e.stopPropagation()}
      >
        <div className="task-modal-header">
          <span id="add-task-modal-title" className="task-modal-title">New Task</span>
          <button className="task-modal-close" onClick={onClose}>✕</button>
        </div>

        <input
          className="task-modal-input"
          placeholder="What needs to be done?"
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && canSubmit && submit()}
          autoCapitalize="sentences"
          autoCorrect="off"
          autoFocus
        />

        <div className="task-modal-recur-label">Repeat?</div>
        <div className="task-recur-grid">
          {RECURRENCE_OPTS.map(o => (
            <button
              key={o.value}
              className={`task-recur-tile ${recurrence === o.value ? 'task-recur-tile--active' : ''}`}
              style={recurrence === o.value
                ? { borderColor: person.color, background: person.color + '18', color: person.color }
                : {}}
              onClick={() => setRecurrence(o.value)}
            >
              <span className="task-recur-tile-label">{o.label}</span>
              <span className="task-recur-tile-desc">{o.desc}</span>
            </button>
          ))}
        </div>

        <button
          className="task-modal-save"
          style={{ background: canSubmit ? person.color : undefined }}
          disabled={!canSubmit}
          onClick={submit}
        >
          Add Task
        </button>
      </div>
    </div>
  )
}

export default function TasksTab() {
  const { tasks, synced, error, toggle, add, remove, clearArchive } = useTasks()
  const [active, setActive]           = useState('blessing')
  const [showModal, setShowModal]     = useState(false)
  const [showArchive, setShowArchive] = useState(false)
  const [undoItem, setUndoItem]       = useState(null)
  const undoTimerRef                  = useRef(null)

  const handleToggle = (person, item) => {
    toggle(person, item.id)
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current)
    setUndoItem({ id: item.id, task: item.task, person })
    undoTimerRef.current = setTimeout(() => setUndoItem(null), 3000)
  }

  const handleUndo = () => {
    if (!undoItem) return
    toggle(undoItem.person, undoItem.id)
    setUndoItem(null)
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current)
  }

  const person      = PEOPLE.find(p => p.id === active)
  const list        = tasks[active] || []
  const activeList  = list.filter(t => !t.done)
  const archiveList = list.filter(t => t.done)

  const handleAdd = (text, recurrence) => {
    add(active, text, recurrence)
  }

  return (
    <div className="tab-content tasks-tab">
      {/* Header */}
      <div className="tab-header">
        <h2 className="tab-title">Tasks</h2>
        <span className={synced ? 'sync-ok' : 'sync-err'}>
          {error ? <><IconAlertTriangle size={12} /> offline</> : synced ? '● live' : '…'}
        </span>
      </div>

      {/* Person tabs */}
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

      {/* Active tasks */}
      <ul className="item-list">
        {activeList.length === 0 && (
          <p className="empty-msg">No tasks — tap + to add one</p>
        )}
        {activeList.map(item => (
          <li key={item.id} className="item-row">
            <button
              className="item-check"
              style={{ borderColor: person.color }}
              aria-label={item.done ? `Uncheck ${item.task}` : `Complete ${item.task}`}
              onClick={() => handleToggle(active, item)}
            />
            <div className="item-body">
              <span className="item-label">{item.task}</span>
              {item.recurrence && item.recurrence !== 'none' && (
                <span
                  className="item-recur-badge"
                  style={{
                    background: RECUR_COLOR[item.recurrence] + '22',
                    color: RECUR_COLOR[item.recurrence],
                    borderColor: RECUR_COLOR[item.recurrence] + '55',
                  }}
                >
                  {RECUR_LABEL[item.recurrence]}
                </span>
              )}
            </div>
            <button className="item-del" aria-label={`Delete ${item.task}`} onClick={() => remove(active, item.id)}>✕</button>
          </li>
        ))}
      </ul>

      {/* Undo toast */}
      {undoItem && (
        <div className="undo-banner">
          <span>Task completed</span>
          <button className="undo-btn" onClick={handleUndo}>Undo</button>
        </div>
      )}

      {/* Archive */}
      {archiveList.length > 0 && (
        <div className="archive-section">
          <div className="archive-section-header">
            <button className="archive-toggle" onClick={() => setShowArchive(v => !v)}>
              {showArchive ? '▾' : '▸'} Completed ({archiveList.length})
            </button>
            {showArchive && (
              <button className="archive-clear" onClick={() => clearArchive(active)}>
                Clear all
              </button>
            )}
          </div>
          {showArchive && (
            <div className="archive-list">
              {archiveList.map(item => (
                <div key={item.id} className="item-row item-row--done">
                  <span className="item-check item-check--done" style={{ background: person.color, borderColor: person.color }}>
                    <IconCheck size={12} />
                  </span>
                  <div className="item-body">
                    <span className="item-label item-label--done">{item.task}</span>
                    {item.recurrence && item.recurrence !== 'none' && (
                      <span className="item-recur-reset">
                        {RECUR_LABEL[item.recurrence]} · {nextReset(item)}
                      </span>
                    )}
                  </div>
                  <button className="item-del" aria-label={`Delete ${item.task}`} onClick={() => remove(active, item.id)}>✕</button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* FAB */}
      <button
        className="tasks-fab"
        style={{ background: person.color }}
        onClick={() => setShowModal(true)}
      >
        +
      </button>

      {/* Add modal */}
      {showModal && (
        <AddModal
          person={person}
          onAdd={handleAdd}
          onClose={() => setShowModal(false)}
        />
      )}
    </div>
  )
}
