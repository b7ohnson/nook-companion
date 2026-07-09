import { useState, useEffect, useRef, useCallback } from 'react'
import { collection, query, where, getDocs, doc, updateDoc } from 'firebase/firestore'
import { db } from '../firebase'
import { useGameRoom } from '../hooks/useGameRoom'

const ROUND_TIME  = 60
const DEBOUNCE_MS = 1500

const FALLBACK = { Animals: ['Dog','Cat','Elephant','Giraffe','Shark'], Movies: ['Titanic','Frozen','Jaws'], 'Sports Stars': ['Messi','LeBron','Serena'], Food: ['Pizza','Sushi','Tacos'], Jobs: ['Teacher','Doctor','Chef'], Actions: ['Running','Swimming','Dancing'] }

function shuffle(arr) {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1));[a[i], a[j]] = [a[j], a[i]] }
  return a
}

export default function HeadsUpPhone({ roomCode }) {
  const [name, setName]       = useState('')
  const [phase, setPhase]     = useState('join')
  const [words, setWords]     = useState([])
  const [wordIdx, setWordIdx] = useState(0)
  const [correct, setCorrect] = useState(0)
  const [skipped, setSkipped] = useState(0)
  const [timeLeft, setTimeLeft] = useState(ROUND_TIME)
  const [countdown, setCountdown] = useState(3)
  const [tiltFlash, setTiltFlash] = useState('')
  const [playerId]            = useState(() => 'hu' + Date.now().toString(36))
  const [joined, setJoined]   = useState(false)

  const correctRef  = useRef(0)
  const skippedRef  = useRef(0)
  const lastTiltRef = useRef(0)
  const timerRef    = useRef(null)

  const { room, players, payload, loading, addPlayer } = useGameRoom(roomCode)
  const category = payload.category

  // Fetch words for category
  useEffect(() => {
    if (!category) return
    const fetch = async () => {
      try {
        const q = query(collection(db, 'gameContent'), where('type', '==', 'headsUpWord'), where('category', '==', category))
        const snap = await getDocs(q)
        const fetched = snap.docs.map(d => d.data().word).filter(Boolean)
        setWords(shuffle(fetched.length ? fetched : (FALLBACK[category] || FALLBACK.Animals)))
      } catch {
        setWords(shuffle(FALLBACK[category] || FALLBACK.Animals))
      }
    }
    fetch()
  }, [category])

  // Join room
  const join = async () => {
    if (!name.trim() || !room) return
    await addPlayer({ id: playerId, name: name.trim(), correct: 0, skipped: 0, finished: false })
    setJoined(true)
    setPhase('ready')
  }

  // Request DeviceOrientation permission (iOS 13+)
  const requestTilt = async () => {
    if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
      try { await DeviceOrientationEvent.requestPermission() } catch {}
    }
    setPhase('countdown')
    setCountdown(3)
  }

  // Countdown
  useEffect(() => {
    if (phase !== 'countdown') return
    if (countdown <= 0) { setPhase('playing'); return }
    const t = setTimeout(() => setCountdown(c => c - 1), 1000)
    return () => clearTimeout(t)
  }, [phase, countdown])

  // Timer
  useEffect(() => {
    if (phase !== 'playing') return
    timerRef.current = setInterval(() => {
      setTimeLeft(t => {
        if (t <= 1) { clearInterval(timerRef.current); return 0 }
        return t - 1
      })
    }, 1000)
    return () => clearInterval(timerRef.current)
  }, [phase])

  // End when time runs out
  useEffect(() => {
    if (phase === 'playing' && timeLeft === 0) setPhase('done')
  }, [phase, timeLeft])

  // Save results when done
  useEffect(() => {
    if (phase !== 'done') return
    const save = async () => {
      try {
        const ref = doc(db, 'gameRooms', roomCode)
        const currentPlayers = room?.players || []
        const updated = currentPlayers.map(p =>
          p.id === playerId
            ? { ...p, correct: correctRef.current, skipped: skippedRef.current, finished: true }
            : p
        )
        await updateDoc(ref, { players: updated })
      } catch {}
    }
    save()
  }, [phase]) // eslint-disable-line react-hooks/exhaustive-deps

  // Tilt detection
  const handleCorrect = useCallback(() => {
    correctRef.current += 1
    setCorrect(correctRef.current)
    setWordIdx(i => i + 1)
    setTiltFlash('correct')
    setTimeout(() => setTiltFlash(''), 600)
  }, [])

  const handleSkip = useCallback(() => {
    skippedRef.current += 1
    setSkipped(skippedRef.current)
    setWordIdx(i => i + 1)
    setTiltFlash('skip')
    setTimeout(() => setTiltFlash(''), 600)
  }, [])

  useEffect(() => {
    if (phase !== 'playing') return
    const onOrientation = (e) => {
      const beta = e.beta
      if (beta == null) return
      const now = Date.now()
      if (now - lastTiltRef.current < DEBOUNCE_MS) return
      if (beta < -20) { lastTiltRef.current = now; handleCorrect() }
      else if (beta > 40) { lastTiltRef.current = now; handleSkip() }
    }
    window.addEventListener('deviceorientation', onOrientation)
    return () => window.removeEventListener('deviceorientation', onOrientation)
  }, [phase, handleCorrect, handleSkip])

  // ── Loading ──
  if (loading) return <div className="hu-splash"><div className="hu-spinner" /></div>

  if (!room) return (
    <div className="hu-splash hu-splash--error">
      <div className="hu-splash-icon">⚠️</div>
      <div>Room not found or expired.</div>
    </div>
  )

  // ── Join ──
  if (phase === 'join') return (
    <div className="hu-join">
      <div className="hu-join-title">Heads Up!</div>
      <div className="hu-join-code">Room {roomCode}</div>
      {category && <div className="hu-join-cat">{category}</div>}
      <input
        className="hu-join-input"
        placeholder="Your name"
        value={name}
        onChange={e => setName(e.target.value)}
        onKeyDown={e => e.key === 'Enter' && join()}
        autoFocus maxLength={20}
      />
      <button className="hu-join-btn" onClick={join} disabled={!name.trim() || !room}>
        Join Game
      </button>
    </div>
  )

  // ── Ready ──
  if (phase === 'ready') return (
    <div className="hu-ready">
      <div className="hu-ready-icon">📱</div>
      <div className="hu-ready-title">Get Ready!</div>
      <div className="hu-ready-cat">{category}</div>
      <div className="hu-ready-instructions">
        <p>Hold your phone to your forehead.</p>
        <p>Others give you clues.</p>
        <p>✅ Tilt forward = correct</p>
        <p>⏭ Tilt back = skip</p>
      </div>
      <button className="hu-start-btn" onClick={requestTilt}>
        I'm Ready! →
      </button>
    </div>
  )

  // ── Countdown ──
  if (phase === 'countdown') return (
    <div className="hu-countdown">
      <div className="hu-countdown-number">{countdown}</div>
    </div>
  )

  // ── Playing ──
  if (phase === 'playing') {
    const word = words[wordIdx % words.length] || '...'
    const timePct = (timeLeft / ROUND_TIME) * 100
    return (
      <div className={`hu-game ${tiltFlash ? `hu-game--${tiltFlash}` : ''}`}>
        <div className="hu-timer-bar">
          <div className="hu-timer-fill" style={{ width: `${timePct}%`, background: timeLeft > 20 ? '#22c55e' : timeLeft > 10 ? '#f59e0b' : '#ef4444' }} />
        </div>
        <div className="hu-timer-text">{timeLeft}s</div>
        <div className="hu-word">{word}</div>
        <div className="hu-score-row">
          <span>✅ {correct}</span>
          <span>⏭ {skipped}</span>
        </div>
        <div className="hu-buttons">
          <button className="hu-btn hu-btn--skip"    onClick={handleSkip}>⏭<br/>Skip</button>
          <button className="hu-btn hu-btn--correct" onClick={handleCorrect}>✅<br/>Correct</button>
        </div>
        {tiltFlash === 'correct' && <div className="hu-flash hu-flash--correct">✅</div>}
        {tiltFlash === 'skip'    && <div className="hu-flash hu-flash--skip">⏭</div>}
      </div>
    )
  }

  // ── Done ──
  return (
    <div className="hu-done">
      <div className="hu-done-icon">🎉</div>
      <div className="hu-done-title">Round Over!</div>
      <div className="hu-done-stats">
        <div className="hu-done-stat hu-done-stat--correct">
          <span className="hu-done-num">{correct}</span>
          <span className="hu-done-label">Correct</span>
        </div>
        <div className="hu-done-stat hu-done-stat--skip">
          <span className="hu-done-num">{skipped}</span>
          <span className="hu-done-label">Skipped</span>
        </div>
      </div>
      <div className="hu-done-msg">Results are on the main screen!</div>
    </div>
  )
}
