import { useState, useEffect, useCallback, useRef } from 'react'

const SCOPES = 'https://www.googleapis.com/auth/calendar.readonly https://www.googleapis.com/auth/calendar.events openid email profile'
const GCAL   = 'https://www.googleapis.com/calendar/v3'

function nextDay(dateStr) {
  const d = new Date(dateStr + 'T00:00:00')
  d.setDate(d.getDate() + 1)
  return d.toISOString().slice(0, 10)
}

function toGoogleBody({ title, date, startTime, endTime, allDay }) {
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone
  if (allDay) return { summary: title, start: { date }, end: { date: nextDay(date) } }
  return {
    summary: title,
    start: { dateTime: `${date}T${startTime}:00`, timeZone: tz },
    end:   { dateTime: `${date}T${endTime || startTime}:00`, timeZone: tz },
  }
}

export function useGoogleCalendar(clientId) {
  const tokenKey = 'gcal_token'
  const userKey  = 'gcal_user'
  const connKey  = 'gcal_connected'

  const [token, setToken]          = useState(() => sessionStorage.getItem(tokenKey))
  const [user, setUser]            = useState(() => { try { return JSON.parse(localStorage.getItem(userKey) || 'null') } catch { return null } })
  const [events, setEvents]        = useState([])
  const [calendarList, setCalList] = useState([])
  const [loading, setLoading]      = useState(false)
  const [error, setError]          = useState(null)
  const clientRef                  = useRef(null)
  const silentRef                  = useRef(null)

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
    localStorage.removeItem(connKey)
    localStorage.removeItem(userKey)
    setToken(null); setUser(null); setEvents([]); setCalList([])
  }, [token])

  const fetchAll = useCallback(async (tk) => {
    setLoading(true); setError(null)
    const get = (url) => fetch(url, { headers: { Authorization: `Bearer ${tk}` } }).then(async r => {
      if (r.status === 401) { trySilentRefresh(); throw new Error('session_expired') }
      if (r.status === 403) {
        const body = await r.json().catch(() => ({}))
        if (body?.error?.status === 'PERMISSION_DENIED' || body?.error?.errors?.[0]?.reason === 'insufficientPermissions') {
          forceReauth(); throw new Error('insufficient_scopes')
        }
      }
      return r.json()
    })
    try {
      const uInfo = await get('https://www.googleapis.com/oauth2/v3/userinfo')
      if (uInfo.email) {
        const u = { name: uInfo.given_name || uInfo.name, email: uInfo.email, picture: uInfo.picture }
        localStorage.setItem(userKey, JSON.stringify(u))
        setUser(u)
      }

      const calData = await get(`${GCAL}/users/me/calendarList?maxResults=50`)
      const cals    = calData.items || []
      setCalList(cals.map(c => ({ id: c.id, summary: c.summary, primary: !!c.primary })))

      const now   = new Date()
      const start = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
      const end   = new Date(now.getFullYear(), now.getMonth() + 2, 0).toISOString()

      const batches = await Promise.all(cals.map(cal =>
        get(`${GCAL}/calendars/${encodeURIComponent(cal.id)}/events?timeMin=${encodeURIComponent(start)}&timeMax=${encodeURIComponent(end)}&singleEvents=true&orderBy=startTime&maxResults=100`)
          .then(d => (d.items || []).filter(e => e.status !== 'cancelled' && (e.start?.date || e.start?.dateTime)).map(e => {
            const dt   = new Date(e.start.dateTime || e.start.date + 'T00:00:00')
            const date = `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}-${String(dt.getDate()).padStart(2,'0')}`
            const time = e.start.dateTime ? `${String(dt.getHours()).padStart(2,'0')}:${String(dt.getMinutes()).padStart(2,'0')}` : null
            const endDt   = e.end?.dateTime ? new Date(e.end.dateTime) : null
            const endTime = endDt ? `${String(endDt.getHours()).padStart(2,'0')}:${String(endDt.getMinutes()).padStart(2,'0')}` : null
            return { id: `${cal.id}::${e.id}`, googleEventId: e.id, calendarId: cal.id, title: e.summary || '(No title)', date, time, endTime, allDay: !!e.start.date, color: cal.backgroundColor || '#4A90D9' }
          })).catch(() => [])
      ))
      setEvents(batches.flat())
    } catch (e) {
      if (e.message !== 'session_expired' && e.message !== 'insufficient_scopes') setError(e.message)
    } finally { setLoading(false) }
  }, [trySilentRefresh, forceReauth])

  useEffect(() => { if (token) fetchAll(token) }, [token, fetchAll])

  const authFetch = useCallback((url, opts = {}) =>
    fetch(url, { ...opts, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...opts.headers } })
      .then(r => r.status === 204 ? null : r.json()), [token])

  const createEvent = async (calendarId = 'primary', data) => {
    await authFetch(`${GCAL}/calendars/${encodeURIComponent(calendarId)}/events`, { method: 'POST', body: JSON.stringify(toGoogleBody(data)) })
    fetchAll(token)
  }

  const updateEvent = async (calendarId, eventId, data) => {
    await authFetch(`${GCAL}/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`, { method: 'PUT', body: JSON.stringify(toGoogleBody(data)) })
    fetchAll(token)
  }

  const deleteEvent = async (calendarId, eventId) => {
    await authFetch(`${GCAL}/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`, { method: 'DELETE' })
    fetchAll(token)
  }

  return { isSignedIn: !!token, signIn, signOut, user, events, calendarList, loading, error, createEvent, updateEvent, deleteEvent, refetch: () => token && fetchAll(token) }
}
