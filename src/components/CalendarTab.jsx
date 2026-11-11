import { useState, useEffect, useRef, useMemo } from 'react'
import { useGoogleCalendar } from '../hooks/useGoogleCalendar'

const CLIENT_ID   = import.meta.env.VITE_GOOGLE_CLIENT_ID
const HOUR_START  = 6
const HOUR_END    = 23
const PX_PER_HOUR = 56
const GRID_HEIGHT = (HOUR_END - HOUR_START) * PX_PER_HOUR
const HOURS       = Array.from({ length: HOUR_END - HOUR_START }, (_, i) => HOUR_START + i)

function pad(n) { return String(n).padStart(2, '0') }

function dateStr(d) {
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`
}

function todayStr() {
  return dateStr(new Date())
}

function getThreeDays(offset) {
  const base = new Date()
  base.setDate(base.getDate() + offset * 3)
  base.setHours(0,0,0,0)
  return [0, 1, 2].map(i => {
    const d = new Date(base)
    d.setDate(base.getDate() + i)
    return d
  })
}

function toMins(t) {
  if (!t) return 0
  const [h, m] = t.split(':').map(Number)
  return h * 60 + m
}

function toY(t) {
  return ((toMins(t) - HOUR_START * 60) / 60) * PX_PER_HOUR
}

function toH(start, end) {
  const s = toMins(start || '00:00')
  const e = toMins(end || '') || s + 60
  return Math.max(((e - s) / 60) * PX_PER_HOUR, 20)
}

function fromMins(mins) {
  return `${pad(Math.floor(mins / 60))}:${pad(mins % 60)}`
}

function daysBetween(a, b) {
  return Math.round((new Date(b + 'T00:00:00') - new Date(a + 'T00:00:00')) / 86400000)
}

const canWrite = c => c.accessRole === 'owner' || c.accessRole === 'writer'

function fmtHour(h) {
  if (h === 12) return '12p'
  return h > 12 ? `${h-12}p` : `${h}a`
}

function fmtTime(t) {
  if (!t) return ''
  const [h, m] = t.split(':').map(Number)
  return `${h % 12 || 12}:${pad(m)} ${h >= 12 ? 'PM' : 'AM'}`
}

const EMPTY_FORM = () => {
  const t = todayStr()
  return { title: '', date: t, startTime: '09:00', endTime: '10:00', allDay: false, calendarId: 'primary' }
}

export default function CalendarTab() {
  const cal        = useGoogleCalendar(CLIENT_ID)
  const [offset, setOffset]   = useState(0)
  const [form, setForm]       = useState(null)
  const [saving, setSaving]   = useState(false)
  const [err, setErr]         = useState(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const confirmDeleteTimerRef = useRef(null)
  const scrollRef             = useRef(null)
  const today                 = todayStr()
  const nowMins               = new Date().getHours() * 60 + new Date().getMinutes()
  const nowY                  = ((nowMins - HOUR_START * 60) / 60) * PX_PER_HOUR

  const days = useMemo(() => getThreeDays(offset), [offset])

  // Fetch what is on screen plus a week either side, so the next few taps
  // of ‹ › already have their events.
  const { setRange } = cal
  useEffect(() => {
    const start = new Date(days[0]); start.setDate(start.getDate() - 7)
    const end   = new Date(days[2]); end.setDate(end.getDate() + 8)
    setRange(start, end)
  }, [days, setRange])

  const { byDate, allDayByDate, hasAllDay } = useMemo(() => {
    const timed = {}, allDay = {}
    let any = false
    days.forEach(d => { timed[dateStr(d)] = []; allDay[dateStr(d)] = [] })
    cal.events.forEach(e => {
      if (e.allDay) {
        // endDate is exclusive; a multi-day event shows on every day it covers.
        for (const ds of Object.keys(allDay)) {
          if (ds >= e.date && ds < (e.endDate || e.date + '~')) { allDay[ds].push(e); any = true }
        }
      } else if (timed[e.date] && e.time) {
        timed[e.date].push(e)
      }
    })
    return { byDate: timed, allDayByDate: allDay, hasAllDay: any }
  }, [cal.events, days])

  const writableCals = useMemo(() => cal.calendarList.filter(canWrite), [cal.calendarList])

  const openNew = (date, time) => {
    const start = time || '09:00'
    // Clamp rather than add an hour blindly: a tap on the last row used to
    // produce an end time equal to (or before) the start.
    const end = fromMins(Math.min(toMins(start) + 60, 23 * 60 + 59))
    setForm({
      ...EMPTY_FORM(), date: date || today, startTime: start, endTime: end,
      calendarId: (writableCals.find(c => c.primary) || writableCals[0])?.id || 'primary',
    })
  }
  const openEdit  = e => setForm({
    title: e.title, date: e.date, startTime: e.time || '09:00', endTime: e.endTime || '10:00',
    allDay: e.allDay, calendarId: e.calendarId, _id: e.googleEventId,
    spanDays: e.allDay && e.endDate ? daysBetween(e.date, e.endDate) : 1,
  })
  const closeForm = () => { setForm(null); setErr(null) }

  const handleSave = async () => {
    if (!form.title.trim()) { setErr('Title required'); return }
    if (!form.allDay && form.endTime && form.startTime && form.endTime <= form.startTime) {
      setErr('End time must be after start time'); return
    }
    setSaving(true); setErr(null)
    try {
      if (form._id) await cal.updateEvent(form.calendarId, form._id, form)
      else          await cal.createEvent(form.calendarId, form)
      closeForm()
    } catch (e) { setErr(e.message) } finally { setSaving(false) }
  }

  const handleDelete = async () => {
    if (!confirmDelete) {
      setConfirmDelete(true)
      clearTimeout(confirmDeleteTimerRef.current)
      confirmDeleteTimerRef.current = setTimeout(() => setConfirmDelete(false), 3000)
      return
    }
    setConfirmDelete(false)
    clearTimeout(confirmDeleteTimerRef.current)
    setSaving(true)
    try { await cal.deleteEvent(form.calendarId, form._id); closeForm() }
    catch (e) { setErr(e.message) } finally { setSaving(false) }
  }

  const handleColTap = (ds, ev) => {
    if (!cal.isSignedIn) return
    const rect = ev.currentTarget.getBoundingClientRect()
    const y    = ev.clientY - rect.top
    const rawMins = Math.round(((y / PX_PER_HOUR) * 60 + HOUR_START * 60) / 15) * 15
    openNew(ds, fromMins(Math.min(Math.max(rawMins, 0), 23 * 60)))
  }

  const rangeLabel = (() => {
    const s = days[0], e = days[2]
    const sm = s.toLocaleDateString('en-US', { month: 'short' })
    const em = e.toLocaleDateString('en-US', { month: 'short' })
    return sm === em
      ? `${sm} ${s.getDate()}–${e.getDate()}`
      : `${sm} ${s.getDate()} – ${em} ${e.getDate()}`
  })()

  return (
    <div className="cal-tab">
      {/* Header */}
      <div className="cal-tab-header">
        <button className="cal-nav-btn" onClick={() => setOffset(o => o - 1)} aria-label="Previous days">‹</button>
        <span className="cal-range-label">{rangeLabel}</span>
        <button className="cal-nav-btn" onClick={() => setOffset(o => o + 1)} aria-label="Next days">›</button>
        {offset !== 0 && <button className="cal-today-btn" onClick={() => setOffset(0)}>Today</button>}
        <div style={{ flex: 1 }} />
        {!cal.isSignedIn
          ? <button className="gcal-connect-btn" onClick={cal.signIn}>Connect</button>
          : <button className="add-evt-btn" onClick={() => openNew()}>+ Event</button>
        }
      </div>

      {cal.error && (
        <div className="cal-error" role="alert">
          <span>{cal.error}</span>
          {cal.isSignedIn && <button className="cal-error-retry" onClick={cal.refetch}>Retry</button>}
        </div>
      )}

      {/* Day column headers */}
      <div className="cal-day-headers">
        <div className="cal-gutter" />
        {days.map(d => {
          const ds = dateStr(d)
          const isToday = ds === today
          return (
            <div key={ds} className={`cal-day-head ${isToday ? 'cal-day-head--today' : ''}`}>
              <span className="cal-day-name">{d.toLocaleDateString('en-US', { weekday: 'short' })}</span>
              <span className="cal-day-num">{d.getDate()}</span>
            </div>
          )
        })}
      </div>

      {hasAllDay && (
        <div className="cal-allday">
          <div className="cal-gutter cal-allday-lbl">all day</div>
          {days.map(d => {
            const ds = dateStr(d)
            return (
              <div key={ds} className="cal-allday-cell">
                {allDayByDate[ds].map(e => (
                  <button
                    key={e.id}
                    className="cal-allday-evt"
                    style={{ background: e.color + 'DD', borderLeft: `3px solid ${e.color}` }}
                    onClick={() => openEdit(e)}
                    aria-label={`${e.title}, all day`}
                  >
                    {e.title}
                  </button>
                ))}
              </div>
            )
          })}
        </div>
      )}

      {/* Scrollable grid */}
      <div className="cal-scroll" ref={scrollRef}>
        <div className="cal-grid" style={{ height: GRID_HEIGHT }}>
          {/* Time gutter */}
          <div className="cal-gutter cal-time-col">
            {HOURS.map(h => (
              <div key={h} className="cal-hour-lbl" style={{ top: (h - HOUR_START) * PX_PER_HOUR }}>
                {fmtHour(h)}
              </div>
            ))}
          </div>

          {/* Day columns */}
          {!cal.isSignedIn && (
            <div className="cal-empty-state">
              <p>Connect your Google Calendar to see events</p>
              <button onClick={cal.signIn} className="cal-connect-btn">Connect</button>
            </div>
          )}

          <div className="cal-cols">
            {HOURS.map(h => (
              <div key={h} className="cal-line" style={{ top: (h - HOUR_START) * PX_PER_HOUR }} />
            ))}

            {days.map(d => {
              const ds      = dateStr(d)
              const isToday = ds === today
              const evts    = byDate[ds] || []

              return (
                <div
                  key={ds}
                  className={`cal-col ${isToday ? 'cal-col--today' : ''}`}
                  onClick={ev => handleColTap(ds, ev)}
                >
                  {isToday && nowY >= 0 && nowY <= GRID_HEIGHT && (
                    <div className="cal-now" style={{ top: nowY }} />
                  )}

                  {evts.map(e => {
                    const y = toY(e.time)
                    const h = toH(e.time, e.endTime)
                    if (y + h < 0 || y > GRID_HEIGHT) return null
                    return (
                      <div
                        key={e.id}
                        className="cal-evt-block"
                        style={{ top: y, height: h, background: e.color + 'DD', borderLeft: `3px solid ${e.color}` }}
                        onClick={ev => { ev.stopPropagation(); openEdit(e) }}
                      >
                        <div className="cal-evt-block-title">{e.title}</div>
                        {h > 32 && <div className="cal-evt-block-time">{fmtTime(e.time)}</div>}
                      </div>
                    )
                  })}
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* Event form sheet */}
      {form && (
        <div className="sheet-overlay" onClick={e => e.target === e.currentTarget && closeForm()}>
          <div className="sheet" role="dialog" aria-modal="true" aria-label={form._id ? 'Edit event' : 'New event'}>
            <div className="sheet-handle" />
            <div className="sheet-header">
              <span className="sheet-title">{form._id ? 'Edit Event' : 'New Event'}</span>
              <button className="sheet-close" onClick={closeForm} aria-label="Close">✕</button>
            </div>

            <div className="sheet-body">
              <input className="sheet-input sheet-input--title" placeholder="Event title" aria-label="Event title"
                value={form.title} onChange={e => setForm(f => ({...f, title: e.target.value}))}
                autoFocus autoCapitalize="sentences" />

              <label className="sheet-check-row">
                <input type="checkbox" checked={form.allDay} onChange={e => setForm(f => ({...f, allDay: e.target.checked}))} />
                All day
              </label>

              <div className="sheet-field">
                <label className="sheet-label" htmlFor="cal-form-date">Date</label>
                <input id="cal-form-date" type="date" className="sheet-input" value={form.date}
                  onChange={e => setForm(f => ({...f, date: e.target.value}))} />
              </div>

              {!form.allDay && (
                <div className="sheet-row">
                  <div className="sheet-field">
                    <label className="sheet-label" htmlFor="cal-form-start">Start</label>
                    <input id="cal-form-start" type="time" className="sheet-input" value={form.startTime}
                      onChange={e => setForm(f => ({...f, startTime: e.target.value}))} />
                  </div>
                  <div className="sheet-field">
                    <label className="sheet-label" htmlFor="cal-form-end">End</label>
                    <input id="cal-form-end" type="time" className="sheet-input" value={form.endTime}
                      onChange={e => setForm(f => ({...f, endTime: e.target.value}))} />
                  </div>
                </div>
              )}

              {writableCals.length > 0 && !form._id && (
                <div className="sheet-field">
                  <label className="sheet-label" htmlFor="cal-form-calendar">Calendar</label>
                  <select id="cal-form-calendar" className="sheet-input" value={form.calendarId}
                    onChange={e => setForm(f => ({...f, calendarId: e.target.value}))}>
                    {writableCals.map(c => (
                      <option key={c.id} value={c.id}>{c.summary}{c.primary ? ' (primary)' : ''}</option>
                    ))}
                  </select>
                </div>
              )}

              {err && <p className="sheet-error" role="alert">{err}</p>}
            </div>

            <div className="sheet-footer">
              {form._id && (
                <button
                  className="sheet-btn sheet-btn--delete"
                  onClick={handleDelete}
                  disabled={saving}
                  style={confirmDelete ? { color: '#c53030' } : undefined}
                >
                  {confirmDelete ? 'Confirm delete?' : 'Delete event'}
                </button>
              )}
              <div style={{flex:1}} />
              <button className="sheet-btn sheet-btn--cancel" onClick={closeForm}>Cancel</button>
              <button className="sheet-btn sheet-btn--save"   onClick={handleSave}   disabled={saving}>
                {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
