import { useState, useRef, useEffect } from 'react'
import { nextMidnight, nextWeekStart, nextMonthStart } from 'nook-core/recurrence'
import { useTasks } from '../hooks/useTasks'
import { IconCheck, IconX, IconPlus, IconChevronRight, IconRepeat, IconCloudOff } from './Icons'

// Colours are theme tokens so each person reads correctly in light and dark.
const PEOPLE = [
  { id: 'blessing', label: 'Blessing', color: 'var(--p-blessing)' },
  { id: 'pearl',    label: 'Pearl',    color: 'var(--p-pearl)'    },
]

const RECURRENCE_OPTS = [
  { value: 'none',    label: 'Once',    desc: 'No repeat' },
  { value: 'daily',   label: 'Daily',   desc: 'Every day' },
  { value: 'weekly',  label: 'Weekly',  desc: 'Every week' },
  { value: 'monthly', label: 'Monthly', desc: 'Every month' },
]

const RECUR_LABEL = { daily: 'Daily', weekly: 'Weekly', monthly: 'Monthly' }

// The same boundaries useTasks resets on: next midnight, next Sunday, the 1st.
const BOUNDARY = { daily: nextMidnight, weekly: nextWeekStart, monthly: nextMonthStart }

function resetLabel(task, now = Date.now()) {
  const boundary = BOUNDARY[task.recurrence]
  if (!boundary || !task.completedAt) return ''
  const at = boundary(task.completedAt)
  if (at <= now) return 'back now'
  if (at === nextMidnight(now)) return 'back tomorrow'
  const when = new Date(at)
  if (at - now < 7 * 86400000) return `back ${when.toLocaleDateString(undefined, { weekday: 'long' })}`
  return `back ${when.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}`
}

// Quiet while live; only says something when it is saving or offline.
function SyncNote({ synced, status }) {
  if (!synced) return <span className="sync-note">Loading…</span>
  if (status === 'offline') return <span className="sync-note sync-note--offline"><IconCloudOff size={14} /> Offline</span>
  if (status === 'saving') return <span className="sync-note">Saving…</span>
  return null
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
          <span id="add-task-modal-title" className="task-modal-title">New task for {person.label}</span>
          <button className="task-modal-close" onClick={onClose} aria-label="Close"><IconX size={20} /></button>
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

        <div className="task-modal-recur-label" id="task-recur-label">Repeats</div>
        <div className="task-recur-grid" role="group" aria-labelledby="task-recur-label">
          {RECURRENCE_OPTS.map(o => (
            <button
              key={o.value}
              className={`task-recur-tile ${recurrence === o.value ? 'task-recur-tile--active' : ''}`}
              aria-pressed={recurrence === o.value}
              onClick={() => setRecurrence(o.value)}
            >
              <span className="task-recur-tile-label">{o.label}</span>
              <span className="task-recur-tile-desc">{o.desc}</span>
            </button>
          ))}
        </div>

        <button
          className="task-modal-save"
          disabled={!canSubmit}
          onClick={submit}
        >
          {text.trim() && recurrence === null ? 'Choose how often it repeats' : 'Add task'}
        </button>
      </div>
    </div>
  )
}

export default function TasksTab() {
  const { tasks, synced, status, toggle, add, remove, clearArchive } = useTasks()
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
    <div className="tab-content tasks-tab" style={{ '--person': person.color, '--check': person.color }}>
      <div className="tab-header">
        <h2 className="tab-title">Tasks</h2>
        <SyncNote synced={synced} status={status} />
      </div>

      <div className="person-tabs">
        {PEOPLE.map(p => {
          const left = (tasks[p.id] || []).filter(t => !t.done).length
          return (
            <button
              key={p.id}
              className={`person-tab ${active === p.id ? 'person-tab--active' : ''}`}
              style={{ '--person': p.color }}
              aria-pressed={active === p.id}
              onClick={() => setActive(p.id)}
            >
              {p.label}{synced && left > 0 ? ` · ${left}` : ''}
            </button>
          )
        })}
      </div>

      {synced && activeList.length === 0 ? (
        <p className="empty-msg">Nothing left for {person.label}.</p>
      ) : (
        <ul className="item-list">
          {activeList.map(item => (
            <li key={item.id} className="item-row">
              <button
                className="item-check"
                aria-label={`Complete ${item.task}`}
                onClick={() => handleToggle(active, item)}
              >
                <span className="item-check-box" />
              </button>
              <div className="item-body">
                <span className="item-label">{item.task}</span>
                {RECUR_LABEL[item.recurrence] && (
                  <span className="item-recur"><IconRepeat size={12} /> {RECUR_LABEL[item.recurrence]}</span>
                )}
              </div>
              <button className="item-del" aria-label={`Delete ${item.task}`} onClick={() => remove(active, item.id)}>
                <IconX size={18} />
              </button>
            </li>
          ))}
        </ul>
      )}

      {undoItem && (
        <div className="undo-banner" role="status">
          <span>Done: {undoItem.task}</span>
          <button className="undo-btn" onClick={handleUndo}>Undo</button>
        </div>
      )}

      {archiveList.length > 0 && (
        <div className="archive-section">
          <div className="archive-section-header">
            <button
              className="archive-toggle"
              aria-expanded={showArchive}
              aria-controls="task-archive"
              onClick={() => setShowArchive(v => !v)}
            >
              <span className="archive-chevron"><IconChevronRight size={16} /></span>
              Done ({archiveList.length})
            </button>
            {showArchive && (
              <button className="archive-clear" onClick={() => clearArchive(active)}>
                Clear done
              </button>
            )}
          </div>
          {showArchive && (
            <ul className="item-list archive-list" id="task-archive">
              {archiveList.map(item => (
                <li key={item.id} className="item-row item-row--done">
                  <span className="item-check" aria-hidden="true">
                    <span className="item-check-box item-check-box--done"><IconCheck size={14} /></span>
                  </span>
                  <div className="item-body">
                    <span className="item-label item-label--done">{item.task}</span>
                    {RECUR_LABEL[item.recurrence] && (
                      <span className="item-recur">
                        <IconRepeat size={12} /> {RECUR_LABEL[item.recurrence]}, {resetLabel(item)}
                      </span>
                    )}
                  </div>
                  <button className="item-del" aria-label={`Delete ${item.task}`} onClick={() => remove(active, item.id)}>
                    <IconX size={18} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <button
        className="tasks-fab"
        aria-label={`Add a task for ${person.label}`}
        onClick={() => setShowModal(true)}
      >
        <IconPlus size={26} />
      </button>

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
