import { useState, useEffect, useRef, useCallback } from 'react'
import { doc, onSnapshot, setDoc, updateDoc, deleteDoc, runTransaction, serverTimestamp } from 'firebase/firestore'
import { ROOM_TTL_MS, ROOM_EXPIRY_WARNING_MS, MAX_PLAYERS } from 'nook-core/constants'
import { gameRoom } from 'nook-core/paths'
import { db } from '../firebase'

// The display builds codes with Math.random().toString(36).slice(2, 8)
// .toUpperCase(): six characters of A-Z / 0-9. Document ids are
// case-sensitive, so a hand-typed lower-case code has to be upper-cased
// before it is used as one.
const ROOM_CODE_RE = /^[A-Z0-9]{4,8}$/

// How long to wait for the first snapshot before calling it a connection
// problem. Firestore does not raise an error while offline; it just waits.
const FIRST_SNAPSHOT_TIMEOUT_MS = 12000
const TTL_RECHECK_MS = 15000

const GUEST_ID_PREFIX = 'nook_pid_'
const GUEST_ID_MAX_AGE_MS = 24 * 60 * 60 * 1000

export function generateRoomCode() {
  return Math.random().toString(36).slice(2, 8).toUpperCase()
}

/** Upper-cased room code, or null when it could not be one the display made. */
export function normalizeRoomCode(raw) {
  let code = String(raw ?? '')
  try { code = decodeURIComponent(code) } catch { /* keep the raw text */ }
  code = code.trim().toUpperCase()
  return ROOM_CODE_RE.test(code) ? code : null
}

function newGuestId() {
  const uuid = globalThis.crypto?.randomUUID?.()
  return 'p' + (uuid || Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2))
}

/**
 * A stable guest id for one room, kept in localStorage so a tab the phone
 * discarded in the background comes back as the same player instead of a new
 * entry that counts toward the player cap.
 */
export function getGuestId(roomCode) {
  if (!roomCode) return newGuestId()
  const key = GUEST_ID_PREFIX + roomCode
  try {
    // Rooms die after 2h, so ids for old rooms are only clutter.
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i)
      if (!k || !k.startsWith(GUEST_ID_PREFIX) || k === key) continue
      let savedAt = 0
      try { savedAt = JSON.parse(localStorage.getItem(k))?.t || 0 } catch { /* unreadable: drop it */ }
      if (Date.now() - savedAt > GUEST_ID_MAX_AGE_MS) localStorage.removeItem(k)
    }
    let saved = null
    try { saved = JSON.parse(localStorage.getItem(key)) } catch { /* treat as absent */ }
    if (saved?.id) return saved.id
    // A tab opened before this change kept its id in sessionStorage.
    let id = null
    try { id = sessionStorage.getItem(key) } catch { /* no session storage */ }
    id = id || newGuestId()
    localStorage.setItem(key, JSON.stringify({ id, t: Date.now() }))
    return id
  } catch {
    // Storage blocked (private mode): the id lasts as long as the tab does.
    return newGuestId()
  }
}

function roomError(code) {
  const err = new Error(code)
  err.code = code
  return err
}

function isExpired(data, now = Date.now()) {
  const created = data?.createdAt?.toMillis?.() || 0
  return created > 0 && now - created > ROOM_TTL_MS
}

/** Plain wording for a failed addPlayer / updatePlayer. */
export function roomErrorMessage(err) {
  switch (err?.code) {
    case 'room-full':    return 'Room is full'
    case 'room-ended':
    case 'room-missing': return 'This game has ended'
    // We only ever write `players`, and the cap is checked before writing, so
    // a denial from the rules means the room passed its 2h lifetime.
    case 'permission-denied': return 'This game has ended'
    case 'not-in-room':  return "You're not in this game any more. Reload to join again."
    default:             return "Couldn't reach the game. Check your connection and try again."
  }
}

/** What to show for each status that is not 'loading' or 'ready'. */
export const ROOM_STATUS_COPY = {
  invalid: { title: 'Invalid code', sub: 'Scan the code on the big screen again.' },
  missing: { title: 'Room not found', sub: 'Scan the code on the big screen again.' },
  ended:   { title: 'This game has ended', sub: 'Thanks for playing.' },
  expired: { title: 'This game has ended', sub: 'Start a new one on the big screen.' },
  network: { title: "Can't reach the game", sub: 'Check your connection and try again.', canRetry: true },
}

/**
 * status is one of:
 *   'invalid'  the code is not a room code
 *   'loading'  waiting for the first snapshot
 *   'ready'    room is live
 *   'missing'  no such room
 *   'ended'    the room was here and has been closed by the display
 *   'expired'  the room is past its 2h lifetime
 *   'network'  could not reach Firestore (call retry())
 */
export function useGameRoom(roomCode) {
  const [room, setRoom]       = useState(null)
  const [status, setStatus]   = useState('loading')
  const [attempt, setAttempt] = useState(0)
  const [now, setNow]         = useState(() => Date.now())
  const seenRef               = useRef(false)

  useEffect(() => {
    if (!roomCode) return
    const ref = doc(db, ...gameRoom(roomCode))
    let answered = false
    const slow = setTimeout(() => { if (!answered) setStatus('network') }, FIRST_SNAPSHOT_TIMEOUT_MS)
    // includeMetadataChanges so that "not in the cache while offline" is
    // followed by an event once the server has actually answered.
    const unsub = onSnapshot(ref, { includeMetadataChanges: true }, snap => {
      if (snap.exists()) {
        answered = true
        clearTimeout(slow)
        seenRef.current = true
        setRoom({ id: snap.id, ...snap.data() })
        setStatus('ready')
      } else if (snap.metadata.fromCache) {
        // Nothing cached and no server answer yet: we do not know whether the
        // room exists. Say so straight away when the phone knows it is
        // offline; otherwise let the timeout above decide.
        if (typeof navigator !== 'undefined' && navigator.onLine === false) setStatus('network')
      } else {
        answered = true
        clearTimeout(slow)
        setRoom(null)
        setStatus(seenRef.current ? 'ended' : 'missing')
      }
    }, () => {
      answered = true
      clearTimeout(slow)
      setStatus('network')
    })
    return () => { clearTimeout(slow); unsub() }
  }, [roomCode, attempt])

  // The TTL has to be re-checked on a clock, not only when a snapshot happens
  // to arrive: a quiet room would otherwise look alive past its expiry.
  useEffect(() => {
    const tick = () => setNow(Date.now())
    const t = setInterval(tick, TTL_RECHECK_MS)
    document.addEventListener('visibilitychange', tick)
    return () => {
      clearInterval(t)
      document.removeEventListener('visibilitychange', tick)
    }
  }, [])

  const retry = useCallback(() => {
    setStatus('loading')
    setAttempt(n => n + 1)
  }, [])

  const createRoom = async (game) => {
    if (!roomCode) return
    await setDoc(doc(db, ...gameRoom(roomCode)), {
      code: roomCode, game, state: 'waiting', players: [], payload: {}, createdAt: serverTimestamp(),
    })
  }

  const updateState = async (newState) => {
    if (!roomCode) return
    await updateDoc(doc(db, ...gameRoom(roomCode)), { state: newState })
  }

  const updatePayload = async (updates) => {
    if (!roomCode) return
    const dotted = {}
    for (const [k, v] of Object.entries(updates)) dotted[`payload.${k}`] = v
    await updateDoc(doc(db, ...gameRoom(roomCode)), dotted)
  }

  // Both player mutators re-read the document inside a transaction and write
  // only `players`, which is all the rules allow an unauthenticated guest to
  // change. Writing back a locally cached array instead lets two phones that
  // answer in the same moment overwrite each other.
  const mutatePlayers = async (mutate) => {
    if (!roomCode) throw roomError('room-missing')
    const ref = doc(db, ...gameRoom(roomCode))
    await runTransaction(db, async (tx) => {
      const snap = await tx.get(ref)
      if (!snap.exists()) throw roomError('room-missing')
      const data = snap.data()
      if (isExpired(data)) throw roomError('room-ended')
      const current = Array.isArray(data.players) ? data.players : []
      const next = mutate(current)
      if (next !== current) tx.update(ref, { players: next })
    })
  }

  /** Joins the room. Joining again with an id already present is a no-op. */
  const addPlayer = (player) => mutatePlayers(current => {
    if (current.some(p => p.id === player.id)) return current
    if (current.length >= MAX_PLAYERS) throw roomError('room-full')
    return [...current, player]
  })

  const updatePlayer = (playerId, updates) => mutatePlayers(current => {
    if (!current.some(p => p.id === playerId)) throw roomError('not-in-room')
    return current.map(p => p.id === playerId ? { ...p, ...updates } : p)
  })

  const removeRoom = async () => {
    if (!roomCode) return
    await deleteDoc(doc(db, ...gameRoom(roomCode)))
  }

  const createdMs = room?.createdAt?.toMillis?.() || 0
  const expired   = status === 'ready' && isExpired(room, now)
  const liveStatus = !roomCode ? 'invalid' : expired ? 'expired' : status
  const liveRoom   = liveStatus === 'ready' ? room : null
  const expiringWarning = !!liveRoom && createdMs > 0 && now - createdMs > ROOM_TTL_MS - ROOM_EXPIRY_WARNING_MS

  return {
    room: liveRoom,
    players: liveRoom?.players || [],
    payload: liveRoom?.payload || {},
    loading: liveStatus === 'loading',
    status: liveStatus,
    retry,
    expiringWarning,
    createRoom,
    updateState,
    updatePayload,
    addPlayer,
    updatePlayer,
    removeRoom,
  }
}
