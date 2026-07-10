import { useState, useEffect, useRef, useCallback } from 'react'
import { collection, query, where, getDocs, doc, updateDoc } from 'firebase/firestore'
import { db } from '../firebase'
import { useGameRoom } from '../hooks/useGameRoom'
import { IconSmartphone, IconCheckCircle, IconSkipForward, IconAlertTriangle, IconStar, IconFlame } from './Icons'

const ROUND_TIME  = 180
const DEBOUNCE_MS = 1500

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

export default function HeadsUpPhone({ roomCode }) {
  const [name, setName]         = useState('')
  const [phase, setPhase]       = useState('join')
  const [words, setWords]       = useState([])
  const [wordIdx, setWordIdx]   = useState(0)
  const [correct, setCorrect]   = useState(0)
  const [skipped, setSkipped]   = useState(0)
  const [timeLeft, setTimeLeft] = useState(ROUND_TIME)
  const [countdown, setCountdown] = useState(3)
  const [tiltFlash, setTiltFlash] = useState('')
  const [playerId]              = useState(() => 'hu' + Date.now().toString(36))

  const correctRef  = useRef(0)
  const skippedRef  = useRef(0)
  const lastTiltRef = useRef(0)
  const wakeLockRef = useRef(null)

  const { room, players, payload, loading, addPlayer } = useGameRoom(roomCode)
  const category = payload.category

  useEffect(() => {
    if (!category) return
    const fetchWords = async () => {
      try {
        const q = query(collection(db, 'gameContent'), where('type', '==', 'headsUpWord'), where('category', '==', category))
        const snap = await getDocs(q)
        const fetched = snap.docs.map(d => d.data().word).filter(Boolean)
        setWords(shuffle(fetched.length ? fetched : (FALLBACK[category] || FALLBACK.Animals)))
      } catch {
        setWords(shuffle(FALLBACK[category] || FALLBACK.Animals))
      }
    }
    fetchWords()
  }, [category])

  const join = async () => {
    if (!name.trim() || !room) return
    await addPlayer({ id: playerId, name: name.trim(), correct: 0, skipped: 0, finished: false })
    setPhase('ready')
  }

  const requestTilt = async () => {
    if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
      try { await DeviceOrientationEvent.requestPermission() } catch {}
    }
    setPhase('countdown')
    setCountdown(3)
  }

  useEffect(() => {
    if (phase !== 'countdown') return
    if (countdown <= 0) { setPhase('playing'); return }
    const t = setTimeout(() => setCountdown(c => c - 1), 1000)
    return () => clearTimeout(t)
  }, [phase, countdown])

  useEffect(() => {
    if (phase !== 'playing') return
    const t = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) { clearInterval(t); return 0 }
        return prev - 1
      })
    }, 1000)
    return () => clearInterval(t)
  }, [phase])

  useEffect(() => {
    if (phase === 'playing' && timeLeft === 0) setPhase('done')
  }, [phase, timeLeft])

  useEffect(() => {
    if (phase !== 'playing') return
    let released = false
    navigator.wakeLock?.request('screen').then(lock => {
      if (!released) wakeLockRef.current = lock
    }).catch(() => {})
    return () => {
      released = true
      wakeLockRef.current?.release().catch(() => {})
      wakeLockRef.current = null
    }
  }, [phase])

  useEffect(() => {
    if (phase !== 'done') return
    const save = async () => {
      try {
        const ref = doc(db, 'gameRooms', roomCode)
        const updated = (room?.players || []).map(p =>
          p.id === playerId
            ? { ...p, correct: correctRef.current, skipped: skippedRef.current, finished: true }
            : p
        )
        await updateDoc(ref, { players: updated })
      } catch {}
    }
    save()
  }, [phase]) // eslint-disable-line react-hooks/exhaustive-deps

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

  if (loading) return <div className="hu-splash"><div className="hu-spinner" /></div>

  if (!room) return (
    <div className="hu-splash hu-splash--error">
      <div className="hu-splash-icon"><IconAlertTriangle size={40} /></div>
      <div>Room not found or expired.</div>
    </div>
  )

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
        autoCapitalize="words"
        autoFocus maxLength={20}
      />
      <button className="hu-join-btn" onClick={join} disabled={!name.trim() || !room}>
        Join Game
      </button>
    </div>
  )

  if (phase === 'ready') return (
    <div className="hu-ready">
      <div className="hu-ready-icon"><IconSmartphone size={56} /></div>
      <div className="hu-ready-title">Get Ready!</div>
      <div className="hu-ready-cat">{category}</div>
      <div className="hu-ready-instructions">
        <p>Hold your phone to your forehead.</p>
        <p>Others give you clues.</p>
        <p><IconCheckCircle size={14} /> Tilt forward = correct</p>
        <p><IconSkipForward size={14} /> Tilt back = skip</p>
      </div>
      <button className="hu-start-btn" onClick={requestTilt}>
        I'm Ready! →
      </button>
    </div>
  )

  if (phase === 'countdown') return (
    <div className="hu-countdown">
      <div className="hu-countdown-number">{countdown}</div>
    </div>
  )

  if (phase === 'playing') {
    const word = words[wordIdx % words.length] || '...'
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
          <span><IconCheckCircle size={16} /> {correct}</span>
          <span><IconSkipForward size={16} /> {skipped}</span>
        </div>
        <div className="hu-buttons">
          <button className="hu-btn hu-btn--skip" onClick={handleSkip}>
            <IconSkipForward size={28} />
            <span>Skip</span>
          </button>
          <button className="hu-btn hu-btn--correct" onClick={handleCorrect}>
            <IconCheckCircle size={28} />
            <span>Correct</span>
          </button>
        </div>
        {tiltFlash === 'correct' && (
          <div className="hu-flash hu-flash--correct"><IconCheckCircle size={64} /></div>
        )}
        {tiltFlash === 'skip' && (
          <div className="hu-flash hu-flash--skip"><IconSkipForward size={64} /></div>
        )}
      </div>
    )
  }

  return (
    <div className="hu-done">
      <div className="hu-done-icon"><IconStar size={56} /></div>
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
