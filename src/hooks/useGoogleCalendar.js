import { useState, useEffect, useCallback, useRef } from 'react'

const SCOPES = 'https://www.googleapis.com/auth/calendar.readonly https://www.googleapis.com/auth/calendar.events openid email profile'
const GCAL   = 'https://www.googleapis.com/calendar/v3'

const pad = (n) => String(n).padStart(2, '0')
const localDate = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const localTime = (d) => `${pad(d.getHours())}:${pad(d.getMinutes())}`

// Built from local date parts: toISOString() converts to UTC first, which
// lands on the wrong day for anyone east of Greenwich.
function addDays(dateStr, n) {
  const [y, m, d] = dateStr.split('-').map(Number)
  return localDate(new Date(y, m - 1, d + n))
}

function toGoogleBody({ title, date, startTime, endTime, allDay, spanDays }, patch = false) {
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone
  // On PATCH the other half of start/end has to be nulled explicitly, or
  // switching between all-day and timed leaves both `date` and `dateTime`
  // set and Google rejects the request.
  if (allDay) {
    const clear = patch ? { dateTime: null, timeZone: null } : {}
    return {
      summary: title,
      start: { date, ...clear },
      end:   { date: addDays(date, Math.max(1, spanDays || 1)), ...clear },
    }
  }
  const clear = patch ? { date: null } : {}
  return {
    summary: title,
    start: { dateTime: `${date}T${startTime}:00`, timeZone: tz, ...clear },
    end:   { dateTime: `${date}T${endTime || startTime}:00`, timeZone: tz, ...clear },
  }
}

function defaultRange() {
  const now = new Date()
  return {
    start: new Date(now.getFullYear(), now.getMonth(), 1).toISOString(),
    end:   new Date(now.getFullYear(), now.getMonth() + 2, 0).toISOString(),
  }
}

const ERROR_TEXT = {
  session_expired:     'Calendar session expired. Try again in a moment.',
  insufficient_scopes: 'Calendar permission needed. Reconnect your calendar.',
}

export function useGoogleCalendar(clientId, storageKey = 'companion') {
  const tokenKey = 'gcal_token'
  const userKey  = 'gcal_user'
  const connKey  = 'gcal_connected'

  const [token, setToken]          = useState(() => sessionStorage.getItem(tokenKey))
  const [user, setUser]            = useState(() => { try { return JSON.parse(sessionStorage.getItem(userKey) || 'null') } catch { return null } })
  const [events, setEvents]        = useState([])
  const [calendarList, setCalList] = useState([])
  const [range, setRangeState]     = useState(defaultRange)
  const [loading, setLoading]      = useState(false)
  const [error, setError]          = useState(null)
  const clientRef                  = useRef(null)
  const silentRef                  = useRef(null)
  const fetchSeqRef                = useRef(0)
  const [reloadKey, setReloadKey]  = useState(0)

  const onToken = useCallback((accessToken) => {
    sessionStorage.setItem(tokenKey, accessToken)
    localStorage.setItem(connKey, '1')
    setToken(accessToken)
  }, [])

  const trySilentRefresh = useCallback(() => {
    if (localStorage.getItem(connKey) && silentRef.current) {
      silentRef.current.requestAccessToken()
    }
  }, [])

  const forceReauth = useCallback(() => {
    sessionStorage.removeItem(tokenKey)
    localStorage.removeItem(connKey)
    setToken(null)
    setError('Calendar permission needed — tap the calendar connect button.')
  }, [])

  const buildClient = useCallback(() => {
    if (!window.google?.accounts?.oauth2 || !clientId) return
    clientRef.current = window.google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: SCOPES,
      prompt: 'consent',
      callback: (resp) => {
        if (resp.error) { setError(resp.error); return }
        onToken(resp.access_token)
      },
    })
    silentRef.current = window.google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: SCOPES,
      prompt: '',
      callback: (resp) => {
        if (!resp.error) onToken(resp.access_token)
      },
    })
  }, [clientId, onToken])

  useEffect(() => {
    const init = () => {
      buildClient()
      if (!sessionStorage.getItem(tokenKey) && localStorage.getItem(connKey)) {
        setTimeout(() => silentRef.current?.requestAccessToken(), 500)
      }
    }
    const script = document.createElement('script')
    script.src = 'https://accounts.google.com/gsi/client'
    script.async = true
    script.onload = init
    document.head.appendChild(script)
    return () => document.head.removeChild(script)
  }, [buildClient])

  const signIn  = useCallback(() => { if (!clientRef.current) buildClient(); clientRef.current?.requestAccessToken() }, [buildClient])

  const signOut = useCallback(() => {
    if (token) window.google?.accounts.oauth2.revoke(token, () => {})
    sessionStorage.removeItem(tokenKey)
    sessionStorage.removeItem(userKey)
    localStorage.removeItem(connKey)
    setToken(null); setUser(null); setEvents([]); setCalList([])
  }, [token])

  // One request path for reads and writes. Rejects on any non-2xx with the
  // API's own message, so a failed save can never look like a success.
  const api = useCallback(async (tk, url, opts = {}) => {
    let r
    try {
      r = await fetch(url, { ...opts, headers: { Authorization: `Bearer ${tk}`, 'Content-Type': 'application/json', ...opts.headers } })
    } catch {
      throw new Error('No connection. Check your signal and try again.')
    }
    if (r.status === 401) { trySilentRefresh(); throw new Error('session_expired') }
    if (!r.ok) {
      const body = await r.json().catch(() => ({}))
      if (r.status === 403 && (body?.error?.status === 'PERMISSION_DENIED' || body?.error?.errors?.[0]?.reason === 'insufficientPermissions')) {
        forceReauth(); throw new Error('insufficient_scopes')
      }
      throw new Error(body?.error?.message || `Calendar request failed (${r.status})`)
    }
    if (r.status === 204) return null
    return r.json()
  }, [trySilentRefresh, forceReauth])

  // Profile and calendar list: once per token.
  useEffect(() => {
    if (!token) return
    let stale = false
    ;(async () => {
      try {
        const uInfo = await api(token, 'https://www.googleapis.com/oauth2/v3/userinfo')
        if (stale) return
        if (uInfo.email) {
          const u = { name: uInfo.given_name || uInfo.name, picture: uInfo.picture }
          sessionStorage.setItem(userKey, JSON.stringify(u))
          setUser(u)
        }
        const calData = await api(token, `${GCAL}/users/me/calendarList?maxResults=50`)
        if (stale) return
        setCalList((calData.items || []).map(c => ({
          id: c.id, summary: c.summary, primary: !!c.primary,
          accessRole: c.accessRole, backgroundColor: c.backgroundColor,
        })))
      } catch (e) {
        if (!stale && !ERROR_TEXT[e.message]) setError(e.message)
      }
    })()
    return () => { stale = true }
  }, [token, api])

  // Events: whenever the token, the calendars or the requested range change.
  // Debounced so paging quickly through days sends one request per calendar,
  // not one per tap.
  useEffect(() => {
    if (!token || !calendarList.length) return
    const seq = ++fetchSeqRef.current
    const timer = setTimeout(async () => {
      setLoading(true); setError(null)
      const qs = `timeMin=${encodeURIComponent(range.start)}&timeMax=${encodeURIComponent(range.end)}&singleEvents=true&orderBy=startTime&maxResults=250`
      let failed = 0
      let fatal  = null
      const batches = await Promise.all(calendarList.map(cal =>
        api(token, `${GCAL}/calendars/${encodeURIComponent(cal.id)}/events?${qs}`)
          .then(d => (d.items || []).filter(e => e.status !== 'cancelled' && (e.start?.date || e.start?.dateTime)).map(e => {
            const allDay = !!e.start.date
            const dt     = new Date(e.start.dateTime || e.start.date + 'T00:00:00')
            const endDt  = e.end?.dateTime ? new Date(e.end.dateTime) : null
            return {
              id: `${storageKey}::${cal.id}::${e.id}`, googleEventId: e.id, calendarId: cal.id,
              title: e.summary || '(No title)',
              date: localDate(dt),
              time: allDay ? null : localTime(dt),
              endTime: endDt ? localTime(endDt) : null,
              allDay,
              // Google's all-day end date is exclusive.
              endDate: allDay ? (e.end?.date || addDays(e.start.date, 1)) : null,
              color: cal.backgroundColor || '#4A90D9',
            }
          }))
          .catch(err => {
            if (ERROR_TEXT[err.message]) fatal = err; else failed++
            return []
          })
      ))
      if (seq !== fetchSeqRef.current) return
      setLoading(false)
      // Token is being refreshed or re-requested; keep what is on screen.
      if (fatal) return
      if (failed === calendarList.length) { setError('Could not load calendar events.'); return }
      setEvents(batches.flat())
    }, 250)
    return () => clearTimeout(timer)
  }, [token, calendarList, range, reloadKey, storageKey, api])

  const refetch = useCallback(() => setReloadKey(k => k + 1), [])

  /** Ask for events between two Dates (end exclusive). */
  const setRange = useCallback((start, end) => {
    const next = { start: start.toISOString(), end: end.toISOString() }
    setRangeState(prev => (prev.start === next.start && prev.end === next.end ? prev : next))
  }, [])

  const write = async (url, opts) => {
    try {
      const res = await api(token, url, opts)
      refetch()
      return res
    } catch (e) {
      throw new Error(ERROR_TEXT[e.message] || e.message)
    }
  }

  const eventUrl = (calendarId, eventId) =>
    `${GCAL}/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`

  const createEvent = (calendarId = 'primary', data) =>
    write(`${GCAL}/calendars/${encodeURIComponent(calendarId)}/events`, { method: 'POST', body: JSON.stringify(toGoogleBody(data)) })

  // PATCH, not PUT: PUT replaces the whole event, and this form only knows
  // the title and times, so it wiped location, description, guests and
  // reminders on every edit.
  const updateEvent = (calendarId, eventId, data) =>
    write(eventUrl(calendarId, eventId), { method: 'PATCH', body: JSON.stringify(toGoogleBody(data, true)) })

  const deleteEvent = (calendarId, eventId) =>
    write(eventUrl(calendarId, eventId), { method: 'DELETE' })

  return { isSignedIn: !!token, signIn, signOut, user, events, calendarList, loading, error, createEvent, updateEvent, deleteEvent, refetch, setRange }
}
