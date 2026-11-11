import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { collection, query, where, getDocs } from 'firebase/firestore'
import { db } from '../firebase'
import {
  useGameRoom, normalizeRoomCode, getGuestId, roomErrorMessage, ROOM_STATUS_COPY,
} from '../hooks/useGameRoom'
import { IconSmartphone, IconCheckCircle, IconSkipForward, IconAlertTriangle, IconStar } from './Icons'

const ROUND_TIME  = 180
const DEBOUNCE_MS = 1500
const ROUND_KEY_PREFIX = 'nook_hu_round_'

// Guests can't read the gameContent collection (firestore.rules lets only the
// signed-in family read it), and the display doesn't yet copy the words into
// the room payload, so for a guest this list is what they play with.
const FALLBACK = {
  Animals: ['Elephant','Giraffe','Penguin','Dolphin','Cheetah','Flamingo','Kangaroo','Octopus','Gorilla','Crocodile','Peacock','Polar Bear','Hummingbird','Chameleon','Platypus','Sloth','Meerkat','Narwhal','Panda','Parrot','Orca','Red Fox','Capybara','Quokka','Axolotl','Manatee','Puffin','Bald Eagle','Snow Leopard','Honey Badger'],
  Movies: ['Titanic','Frozen','The Lion King','Shrek','Toy Story','Finding Nemo','The Avengers','Jurassic Park','Home Alone','The Dark Knight','Inception','Harry Potter','Star Wars','Back to the Future','The Matrix','Forrest Gump','Moana','Spider-Man','Coco','Up','Ratatouille','WALL-E','Encanto','Brave','Tangled','Mulan','Aladdin','Cinderella','Oppenheimer','Barbie'],
  'Sports Stars': ['LeBron James','Serena Williams','Lionel Messi','Usain Bolt','Michael Jordan','Simone Biles','Tom Brady','Tiger Woods','Stephen Curry','Cristiano Ronaldo','Roger Federer','Kobe Bryant','Muhammad Ali','Pelé','Michael Phelps','Mike Tyson','Magic Johnson','Caitlin Clark','Lewis Hamilton','Novak Djokovic','Rafael Nadal','Naomi Osaka','Patrick Mahomes','Kevin Durant','Giannis Antetokounmpo','Tony Hawk','Kelly Slater','Shohei Ohtani','Babe Ruth','Carl Lewis'],
  Food: ['Spaghetti','Hamburger','Sushi','Tacos','Pizza','Ice Cream','Waffles','Guacamole','Ramen','Nachos','Burrito','Cheesecake','Fried Chicken','Donut','Lobster','Churros','Croissant','Pho','Pad Thai','Hot Dog','Mac and Cheese','French Fries','Buffalo Wings','Chicken Tikka Masala','Falafel','Shawarma','Paella','Tiramisu','Macarons','Cannoli'],
  Jobs: ['Firefighter','Astronaut','Chef','Surgeon','Pilot','Architect','Photographer','Veterinarian','Magician','Librarian','Zookeeper','Stunt Person','Lifeguard','Tattoo Artist','Marine Biologist','Mime','Stand-up Comedian','Voice Actor','Locksmith','Blacksmith','Neurosurgeon','Lawyer','Police Officer','Teacher','Film Director','Actor','News Anchor','Flight Attendant','Fashion Designer','Electrician'],
  Actions: ['Swimming','Juggling','Skipping','Whistling','Hula Hooping','Moonwalking','Surfing','Breakdancing','Rock Climbing','Skateboarding','Doing a Cartwheel','Throwing a Football','Shooting a Basketball','Kicking a Soccer Ball','Playing Air Guitar','Blowing a Bubble','Cooking a Meal','Wrapping a Gift','Blowing Out Birthday Candles','Dancing at a Wedding','Roaring Like a Lion','Galloping Like a Horse','Doing Push-ups','Standing on One Leg','Running in Slow Motion','Walking Like a Robot','Flapping Like a Bird','Howling Like a Wolf','Swinging Like a Monkey','Stomping Like an Elephant'],
}

function shuffle(arr) {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

// The round in progress is kept per room so a tab the phone discarded
// mid-round picks up with the same clock and tally instead of starting over.
function loadRound(roomCode) {
  try {
    // Drop rounds from other rooms that finished long ago.
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i)
      if (!k?.startsWith(ROUND_KEY_PREFIX) || k === ROUND_KEY_PREFIX + roomCode) continue
      let endAt = 0
      try { endAt = JSON.parse(localStorage.getItem(k))?.endAt || 0 } catch { /* unreadable: drop it */ }
      if (Date.now() - endAt > 24 * 60 * 60 * 1000) localStorage.removeItem(k)
    }
    return JSON.parse(localStorage.getItem(ROUND_KEY_PREFIX + roomCode)) || null
  } catch { return null }
}
function saveRound(roomCode, round) {
  try { localStorage.setItem(ROUND_KEY_PREFIX + roomCode, JSON.stringify(round)) } catch { /* storage blocked */ }
}

function secondsLeft(endAt) {
  return Math.max(0, Math.ceil((endAt - Date.now()) / 1000))
}

export default function HeadsUpPhone({ roomCode: rawRoomCode }) {
  const roomCode = useMemo(() => normalizeRoomCode(rawRoomCode), [rawRoomCode])
  const playerId = useMemo(() => getGuestId(roomCode), [roomCode])
  const savedRound = useMemo(() => (roomCode ? loadRound(roomCode) : null), [roomCode])

  const [name, setName]           = useState('')
  const [phase, setPhase]         = useState(() =>
    savedRound?.endAt ? (secondsLeft(savedRound.endAt) > 0 ? 'playing' : 'done') : 'join')
  const [words, setWords]         = useState([])
  const [wordIdx, setWordIdx]     = useState(savedRound?.wordIdx || 0)
  const [correct, setCorrect]     = useState(savedRound?.correct || 0)
  const [skipped, setSkipped]     = useState(savedRound?.skipped || 0)
  const [timeLeft, setTimeLeft]   = useState(() => (savedRound?.endAt ? secondsLeft(savedRound.endAt) : ROUND_TIME))
  const [countdown, setCountdown] = useState(3)
  const [tiltFlash, setTiltFlash] = useState('')
  const [joining, setJoining]     = useState(false)
  const [joinError, setJoinError] = useState('')
  const [saveState, setSaveState] = useState('idle') // idle | saving | saved | error
  const [saveError, setSaveError] = useState('')

  const correctRef  = useRef(savedRound?.correct || 0)
  const skippedRef  = useRef(savedRound?.skipped || 0)
  const wordIdxRef  = useRef(savedRound?.wordIdx || 0)
  const endAtRef    = useRef(savedRound?.endAt || 0)
  const lastTiltRef = useRef(0)
  const wakeLockRef = useRef(null)

  const { room, players, payload, status, retry, addPlayer, updatePlayer } = useGameRoom(roomCode)
  const category = payload.category
  const myPlayer = players.find(p => p.id === playerId)

  // Words: the room payload first (if the display ever puts them there), then
  // the gameContent collection (readable only when signed in), then the
  // built-in list.
  useEffect(() => {
    if (!category) return
    if (Array.isArray(payload.words) && payload.words.length) {
      setWords(shuffle(payload.words))
      return
    }
    let cancelled = false
    const fetchWords = async () => {
      let fetched = []
      try {
        const q = query(collection(db, 'gameContent'), where('type', '==', 'headsUpWord'), where('category', '==', category))
        const snap = await getDocs(q)
        fetched = snap.docs.map(d => d.data().word).filter(Boolean)
      } catch { /* guests are not allowed to read gameContent */ }
      if (!cancelled) setWords(shuffle(fetched.length ? fetched : (FALLBACK[category] || FALLBACK.Animals)))
    }
    fetchWords()
    return () => { cancelled = true }
  }, [category, payload.words])

  // Back on the page as a player already in the room: skip the name screen.
  useEffect(() => {
    if (phase !== 'join' || !myPlayer) return
    if (myPlayer.finished) {
      correctRef.current = myPlayer.correct || 0
      skippedRef.current = myPlayer.skipped || 0
      setCorrect(correctRef.current)
      setSkipped(skippedRef.current)
      setSaveState('saved')
      setPhase('done')
    } else {
      setPhase('ready')
    }
  }, [phase, myPlayer])

  const persistRound = useCallback(() => {
    if (!roomCode || !endAtRef.current) return
    saveRound(roomCode, {
      endAt: endAtRef.current,
      correct: correctRef.current,
      skipped: skippedRef.current,
      wordIdx: wordIdxRef.current,
    })
  }, [roomCode])

  const join = async () => {
    if (!name.trim() || !room || joining) return
    setJoining(true)
    setJoinError('')
    try {
      await addPlayer({ id: playerId, name: name.trim(), correct: 0, skipped: 0, finished: false })
      setPhase('ready')
    } catch (err) {
      console.error('Joining Heads Up failed', err)
      setJoinError(roomErrorMessage(err))
    } finally {
      setJoining(false)
    }
  }

  const requestTilt = async () => {
    if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
      try { await DeviceOrientationEvent.requestPermission() } catch { /* buttons still work */ }
    }
    setPhase('countdown')
    setCountdown(3)
  }

  useEffect(() => {
    if (phase !== 'countdown') return
    if (countdown <= 0) {
      endAtRef.current = Date.now() + ROUND_TIME * 1000
      setTimeLeft(ROUND_TIME)
      persistRound()
      setPhase('playing')
      return
    }
    const t = setTimeout(() => setCountdown(c => c - 1), 1000)
    return () => clearTimeout(t)
  }, [phase, countdown, persistRound])

  // Remaining time comes from the stored end time, not from counting ticks:
  // timers are throttled or paused while the tab is in the background, which
  // used to make rounds run long.
  useEffect(() => {
    if (phase !== 'playing') return
    const tick = () => {
      const left = secondsLeft(endAtRef.current)
      setTimeLeft(left)
      if (left <= 0) setPhase('done')
    }
    tick()
    const t = setInterval(tick, 250)
    document.addEventListener('visibilitychange', tick)
    return () => {
      clearInterval(t)
      document.removeEventListener('visibilitychange', tick)
    }
  }, [phase])

  // Keep the screen on while playing. The browser drops the lock whenever the
  // page is hidden, so take it again each time the page comes back.
  useEffect(() => {
    if (phase !== 'playing' || !navigator.wakeLock) return
    let active = true
    const acquire = async () => {
      if (document.visibilityState !== 'visible' || (wakeLockRef.current && !wakeLockRef.current.released)) return
      try {
        const lock = await navigator.wakeLock.request('screen')
        if (active) wakeLockRef.current = lock
        else lock.release().catch(() => {})
      } catch { /* not allowed right now; the round still works */ }
    }
    acquire()
    document.addEventListener('visibilitychange', acquire)
    return () => {
      active = false
      document.removeEventListener('visibilitychange', acquire)
      wakeLockRef.current?.release().catch(() => {})
      wakeLockRef.current = null
    }
  }, [phase])

  // Save the result through a transaction on the current room document, so
  // players who joined after this phone last saw the list are not dropped.
  const saveResult = useCallback(async () => {
    setSaveState('saving')
    setSaveError('')
    try {
      await updatePlayer(playerId, { correct: correctRef.current, skipped: skippedRef.current, finished: true })
      setSaveState('saved')
    } catch (err) {
      console.error('Saving the Heads Up result failed', err)
      setSaveError(roomErrorMessage(err))
      setSaveState('error')
    }
  }, [updatePlayer, playerId])

  useEffect(() => {
    if (phase !== 'done' || saveState !== 'idle' || !room) return
    saveResult()
  }, [phase, saveState, room, saveResult])

  const flash = (kind) => {
    setTiltFlash(kind)
    setTimeout(() => setTiltFlash(''), 600)
  }

  const handleCorrect = useCallback(() => {
    correctRef.current += 1
    wordIdxRef.current += 1
    setCorrect(correctRef.current)
    setWordIdx(wordIdxRef.current)
    persistRound()
    flash('correct')
  }, [persistRound])

  const handleSkip = useCallback(() => {
    skippedRef.current += 1
    wordIdxRef.current += 1
    setSkipped(skippedRef.current)
    setWordIdx(wordIdxRef.current)
    persistRound()
    flash('skip')
  }, [persistRound])

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

  if (status === 'loading') return (
    <div className="hu-splash" role="status" aria-label="Loading the game"><div className="hu-spinner" /></div>
  )

  // A round already under way keeps going even if the connection drops; only
  // the screens that need the room stop here.
  if (!room && (phase === 'join' || phase === 'ready' || status === 'invalid')) {
    const copy = ROOM_STATUS_COPY[status] || ROOM_STATUS_COPY.missing
    return (
      <div className="hu-splash hu-splash--error">
        <div className="hu-splash-icon"><IconAlertTriangle size={40} /></div>
        <div className="play-splash-name">{copy.title}</div>
        <div className="play-splash-msg play-splash-msg--plain">{copy.sub}</div>
        {copy.canRetry && (
          <button className="hu-join-btn play-retry-btn" onClick={retry}>Try again</button>
        )}
      </div>
    )
  }

  if (phase === 'join') return (
    <div className="hu-join">
      <div className="hu-join-title">Heads Up</div>
      <div className="hu-join-code">Room {roomCode}</div>
      {category && <div className="hu-join-cat">{category}</div>}
      <input
        className="hu-join-input"
        placeholder="Your name"
        aria-label="Your name"
        value={name}
        onChange={e => setName(e.target.value)}
        onKeyDown={e => e.key === 'Enter' && join()}
        autoCapitalize="words"
        autoFocus maxLength={20}
      />
      {joinError && <div className="play-notice" role="alert">{joinError}</div>}
      <button className="hu-join-btn" onClick={join} disabled={!name.trim() || !room || joining}>
        {joining ? 'Joining…' : 'Join game'}
      </button>
    </div>
  )

  if (phase === 'ready') return (
    <div className="hu-ready">
      <div className="hu-ready-icon"><IconSmartphone size={56} /></div>
      <div className="hu-ready-title">Ready when you are</div>
      <div className="hu-ready-cat">{category}</div>
      <div className="hu-ready-instructions">
        <p>Hold your phone to your forehead.</p>
        <p>Everyone else gives you clues.</p>
        <p><IconCheckCircle size={14} /> Tilt forward if you got it</p>
        <p><IconSkipForward size={14} /> Tilt back to skip</p>
      </div>
      <button className="hu-start-btn" onClick={requestTilt}>
        Start
      </button>
    </div>
  )

  if (phase === 'countdown') return (
    <div className="hu-countdown" role="status" aria-live="assertive">
      <div className="hu-countdown-number">{countdown}</div>
    </div>
  )

  if (phase === 'playing') {
    const word = words.length ? words[wordIdx % words.length] : '...'
    const timePct = (timeLeft / ROUND_TIME) * 100
    const timerColor = timeLeft > 20 ? '#22c55e' : timeLeft > 10 ? '#f59e0b' : '#ef4444'
    return (
      <div className={`hu-game ${tiltFlash ? `hu-game--${tiltFlash}` : ''}`}>
        <div className="hu-timer-bar">
          <div className="hu-timer-fill" style={{ width: `${timePct}%`, background: timerColor }} />
        </div>
        <div className="hu-timer-text" style={{ color: timerColor }}>{timeLeft}s</div>
        <div className="hu-word">{word}</div>
        <div className="hu-score-row">
          <span aria-label={`${correct} correct`}><IconCheckCircle size={16} /> {correct}</span>
          <span aria-label={`${skipped} skipped`}><IconSkipForward size={16} /> {skipped}</span>
        </div>
        <div className="hu-buttons">
          <button className="hu-btn hu-btn--skip" onClick={handleSkip}>
            <IconSkipForward size={28} />
            <span>Skip</span>
          </button>
          <button className="hu-btn hu-btn--correct" onClick={handleCorrect}>
            <IconCheckCircle size={28} />
            <span>Got it</span>
          </button>
        </div>
        {tiltFlash === 'correct' && (
          <div className="hu-flash hu-flash--correct" aria-hidden="true"><IconCheckCircle size={64} /></div>
        )}
        {tiltFlash === 'skip' && (
          <div className="hu-flash hu-flash--skip" aria-hidden="true"><IconSkipForward size={64} /></div>
        )}
      </div>
    )
  }

  return (
    <div className="hu-done">
      <div className="hu-done-icon"><IconStar size={56} /></div>
      <div className="hu-done-title">Time's up</div>
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
      {saveState === 'error' ? (
        <>
          <div className="play-notice" role="alert">Your score didn't reach the big screen. {saveError}</div>
          {room && <button className="hu-join-btn play-retry-btn" onClick={saveResult}>Try again</button>}
        </>
      ) : !room ? (
        <div className="play-notice" role="alert">
          {(ROOM_STATUS_COPY[status] || ROOM_STATUS_COPY.missing).title}. Your score couldn't be sent.
          {status === 'network' && <button className="hu-join-btn play-retry-btn" onClick={retry}>Try again</button>}
        </div>
      ) : (
        <div className="hu-done-msg" role="status">
          {saveState === 'saved' ? 'Your score is on the big screen.' : 'Sending your score…'}
        </div>
      )}
    </div>
  )
}
