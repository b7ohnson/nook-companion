import { useState } from 'react'
import { useMeals } from '../hooks/useMeals'
import { IconAlertTriangle } from './Icons'

const SLOTS = [
  { key: 'breakfast', label: 'Breakfast' },
  { key: 'lunch',     label: 'Lunch'     },
  { key: 'dinner',    label: 'Dinner'    },
]

function getWeekDays(offset = 0) {
  const days  = []
  const today = new Date()
  const dow   = today.getDay()
  const mon   = new Date(today)
  mon.setDate(today.getDate() - (dow === 0 ? 6 : dow - 1) + offset * 7)
  for (let i = 0; i < 7; i++) {
    const d = new Date(mon)
    d.setDate(mon.getDate() + i)
    const pad = n => String(n).padStart(2, '0')
    const str = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
    days.push({
      date:        str,
      dayName:     d.toLocaleDateString('en-US', { weekday: 'short' }),
      fullDayName: d.toLocaleDateString('en-US', { weekday: 'long' }),
      dayNum:      d.getDate(),
      month:       d.toLocaleDateString('en-US', { month: 'short' }),
      isToday:     d.toDateString() === today.toDateString(),
    })
  }
  return days
}

function weekLabel(offset, days) {
  if (offset === 0)  return 'This week'
  if (offset === 1)  return 'Next week'
  if (offset === -1) return 'Last week'
  return `${days[0].month} ${days[0].dayNum} – ${days[6].month} ${days[6].dayNum}`
}

export default function MenuManager() {
  const [weekOffset, setWeekOffset] = useState(0)
  const { meals, synced, setMeal, deleteMeal } = useMeals()
  const [editing, setEditing]   = useState(null) // { dateStr, slot, fullDayName }
  const [inputVal, setInputVal] = useState('')
  const [saving, setSaving]     = useState(false)

  const days = getWeekDays(weekOffset)

  const openEdit = (dateStr, slot, fullDayName) => {
    const current = meals[dateStr]?.[slot.key] || ''
    setInputVal(current)
    setEditing({ dateStr, slot, fullDayName })
  }

  const closeEdit = () => { setEditing(null); setSaving(false) }

  const handleSave = async () => {
    if (!editing || saving) return
    const val = inputVal.trim()
    if (!val) return
    setSaving(true)
    await setMeal(editing.dateStr, editing.slot.key, val)
    closeEdit()
  }

  const handleClear = async () => {
    if (!editing || saving) return
    setSaving(true)
    await deleteMeal(editing.dateStr, editing.slot.key)
    closeEdit()
  }

  const hasMeal = editing
    ? Boolean(meals[editing.dateStr]?.[editing.slot.key])
    : false

  return (
    <div className="tab-content menu-tab">
      {/* Header */}
      <div className="tab-header">
        <h2 className="tab-title">Menu</h2>
        <span className={synced ? 'sync-ok' : 'sync-err'}>
          {synced ? '● live' : '…'}
        </span>
      </div>

      {/* Week navigation */}
      <div className="menu-week-nav">
        <button
          className="menu-nav-btn"
          onClick={() => setWeekOffset(o => o - 1)}
          aria-label="Previous week"
        >‹</button>
        <span className="menu-week-label">{weekLabel(weekOffset, days)}</span>
        <button
          className="menu-nav-btn"
          onClick={() => setWeekOffset(o => o + 1)}
          aria-label="Next week"
        >›</button>
      </div>

      {/* Day cards */}
      <div className="menu-days">
        {days.map(day => (
          <div
            key={day.date}
            className={`menu-day${day.isToday ? ' menu-day--today' : ''}`}
          >
            <div className="menu-day-header">
              <span className="menu-day-name">{day.fullDayName}</span>
              <span className="menu-day-date">{day.month} {day.dayNum}</span>
            </div>
            <div className="menu-slots">
              {SLOTS.map(slot => {
                const value = meals[day.date]?.[slot.key]
                return (
                  <button
                    key={slot.key}
                    className={`menu-slot${value ? ' menu-slot--filled' : ' menu-slot--empty'}`}
                    onClick={() => openEdit(day.date, slot, day.fullDayName)}
                    aria-label={`${slot.label} ${day.fullDayName}: ${value || 'empty, tap to add'}`}
                  >
                    <span className="menu-slot-type">{slot.label}</span>
                    <span className="menu-slot-value">
                      {value
                        ? value
                        : <span className="menu-slot-placeholder">Add meal</span>
                      }
                    </span>
                  </button>
                )
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Edit bottom sheet */}
      {editing && (
        <div className="sheet-overlay" onClick={closeEdit}>
          <div
            className="sheet menu-sheet"
            role="dialog"
            aria-modal="true"
            aria-label={`Edit ${editing.slot.label} for ${editing.fullDayName}`}
            onClick={e => e.stopPropagation()}
          >
            <div className="sheet-handle" />
            <div className="sheet-header">
              <span className="sheet-title">
                <span className="menu-sheet-slot">{editing.slot.label}</span>
                {' · '}
                {editing.fullDayName}
              </span>
              <button className="sheet-close" onClick={closeEdit} aria-label="Close">✕</button>
            </div>
            <div className="sheet-body">
              <input
                className="sheet-input menu-meal-input"
                placeholder={`What's for ${editing.slot.label.toLowerCase()}?`}
                value={inputVal}
                onChange={e => setInputVal(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && inputVal.trim()) handleSave()
                  if (e.key === 'Escape') closeEdit()
                }}
                autoFocus
                autoCapitalize="sentences"
                autoCorrect="off"
              />
            </div>
            <div className="sheet-footer">
              {hasMeal && (
                <button
                  className="sheet-btn sheet-btn--delete"
                  onClick={handleClear}
                  disabled={saving}
                >
                  Clear
                </button>
              )}
              <button
                className="sheet-btn sheet-btn--cancel"
                onClick={closeEdit}
                disabled={saving}
              >
                Cancel
              </button>
              <button
                className="sheet-btn sheet-btn--save menu-save-btn"
                onClick={handleSave}
                disabled={!inputVal.trim() || saving}
              >
                {saving ? '…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
