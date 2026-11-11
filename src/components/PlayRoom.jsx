import { useState, useEffect, useRef, useMemo } from 'react'
import { doc, updateDoc } from 'firebase/firestore'
import { gameRoom } from 'nook-core/paths'
import { db } from '../firebase'
import {
  useGameRoom, normalizeRoomCode, getGuestId, roomErrorMessage, ROOM_STATUS_COPY,
} from '../hooks/useGameRoom'
import {
  IconUser, IconAlertTriangle, IconCheck, IconBell, IconTv, IconTrophy,
  IconClock, IconCheckCircle, IconXCircle, IconStar,
} from './Icons'

const COLORS      = ['#e21b3c', '#1368ce', '#d89e00', '#26890c']
const SHAPES      = ['▲', '●', '■', '★']
const RANK_COLORS = ['#f59e0b', '#94a3b8', '#b45309']
const TEAM_COLORS_JEOP = ['#3b82f6', '#8b5cf6', '#ec4899', '#f59e0b']

// ── Icons missing from Icons.jsx, drawn in the same stroke style ──
function LocalSvg({ size = 16, children }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
      aria-hidden="true" focusable="false">
      {children}
    </svg>
  )
}
const IconZap = ({ size }) => (
  <LocalSvg size={size}><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" /></LocalSvg>
)
const IconLightbulb = ({ size }) => (
  <LocalSvg size={size}>
    <path d="M9 18h6M10 22h4" />
    <path d="M12 2a7 7 0 00-4 12.74V16h8v-1.26A7 7 0 0012 2z" />
  </LocalSvg>
)
const IconHourglass = ({ size }) => (
  <LocalSvg size={size}>
    <path d="M6 2h12M6 22h12" />
    <path d="M7 2v4a5 5 0 005 5 5 5 0 005-5V2M7 22v-4a5 5 0 015-5 5 5 0 015 5v4" />
  </LocalSvg>
)
const IconPause = ({ size }) => (
  <LocalSvg size={size}><rect x="6" y="4" width="4" height="16" /><rect x="14" y="4" width="4" height="16" /></LocalSvg>
)

// Guests may write only the buzz/answer keys of `payload`, and only while the
// room is live (firestore.rules), so a refusal here almost always means the
// game has ended or someone else already reopened or closed the buzzers.
function payloadWriteMessage(err, what) {
  if (err?.code === 'permission-denied') {
    return `Couldn't ${what}. The game may have ended; check the big screen.`
  }
  return `Couldn't ${what}. Check your connection and try again.`
}

// ── Shared components ──────────────────────────────────────────
function Splash({ icon, title, sub, children, className }) {
  return (
    <div className={`play-splash${className ? ` ${className}` : ''}`}>
      {icon  && <div className="play-splash-icon">{icon}</div>}
      {title && <div className="play-splash-name">{title}</div>}
      {sub   && <div className="play-splash-msg">{sub}</div>}
      {children}
    </div>
  )
}

function Notice({ children }) {
  if (!children) return null
  return <div className="play-notice" role="alert">{children}</div>
}

function RoomStatus({ status, onRetry }) {
  const copy = ROOM_STATUS_COPY[status] || ROOM_STATUS_COPY.missing
  return (
    <div className="play-splash play-splash--error">
      <div className="play-splash-icon"><IconAlertTriangle size={40} /></div>
      <div className="play-splash-name">{copy.title}</div>
      <div className="play-splash-msg play-splash-msg--plain">{copy.sub}</div>
      {copy.canRetry && (
        <button className="play-join-btn play-retry-btn" onClick={onRetry}>Try again</button>
      )}
    </div>
  )
}

/** Wraps addPlayer so a full or finished room says so instead of failing silently. */
function useJoin(addPlayer) {
  const [joining, setJoining] = useState(false)
  const [error, setError]     = useState('')
  const join = async (player) => {
    if (joining) return
    setJoining(true)
    setError('')
    try {
      await addPlayer(player)
    } catch (err) {
      console.error('Joining the game failed', err)
      setError(roomErrorMessage(err))
    } finally {
      setJoining(false)
    }
  }
  return { join, joining, error }
}

function BuzzButton({ onBuzz, disabled, busy }) {
  return (
    <button
      className={`buzz-btn ${disabled || busy ? 'buzz-btn--disabled' : ''}`}
      onClick={onBuzz}
      disabled={disabled || busy}
    >
      <span className="buzz-btn-icon"><IconBell size={56} /></span>
      <span className="buzz-btn-label">{busy ? 'Buzzing…' : 'Buzz in'}</span>
    </button>
  )
}

function BuzzScreen({ onBuzz, busy, error }) {
  return (
    <div className="buzz-screen">
      <Notice>{error}</Notice>
      <BuzzButton onBuzz={onBuzz} disabled={false} busy={busy} />
    </div>
  )
}

function AnswerScreen({ prompt, clueText, onSubmit, error }) {
  const [text, setText] = useState('')
  return (
    <div className="play-answer-screen">
      {clueText && <div className="play-clue-preview">{clueText}</div>}
      {prompt   && <div className="play-answer-prompt">{prompt}</div>}
      <Notice>{error}</Notice>
      <input
        className="play-answer-input"
        placeholder="Type your answer…"
        aria-label="Your answer"
        value={text}
        onChange={e => setText(e.target.value)}
        onKeyDown={e => e.key === 'Enter' && text.trim() && onSubmit(text.trim())}
        autoFocus
        maxLength={80}
      />
      <button
        className="play-submit-btn"
        onClick={() => onSubmit(text.trim())}
        disabled={!text.trim()}
      >
        Send answer
      </button>
    </div>
  )
}

// ── Jeopardy phone UI ─────────────────────────────────────────
function JeopardyPhone({ room, players, payload, playerId, myPlayer, addPlayer }) {
  const roomDocRef   = useRef(doc(db, ...gameRoom(room.id)))
  const [name, setName]                 = useState('')
  const [mySubmission, setMySubmission] = useState(null)
  const [buzzing, setBuzzing]           = useState(false)
  const [writeError, setWriteError]     = useState('')
  const { join, joining, error: joinError } = useJoin(addPlayer)

  const phase          = payload.phase || 'board'
  const buzzedBy       = payload.buzzedBy
  const buzzersOpen    = payload.buzzersOpen
  const answerResult   = payload.answerResult
  const wrongAnswerers = payload.wrongAnswerers || []
  const teamNames      = payload.teamNames || ['Team 1', 'Team 2']
  const answeredBy     = payload.answeredBy

  // Clear my submission state when the clue resets
  useEffect(() => {
    if (!buzzedBy && !answerResult) setMySubmission(null)
  }, [buzzedBy, answerResult])

  // A failed write only matters for the clue it happened on.
  useEffect(() => { setWriteError('') }, [payload.clueText, phase])

  const iBuzzed         = buzzedBy?.id === playerId
  const iWasWrong       = wrongAnswerers.includes(playerId)
  const iCanBuzz        = buzzersOpen && !iWasWrong && !buzzedBy
  const myResult        = mySubmission ? answerResult : null

  const buzz = async () => {
    if (!iCanBuzz || !myPlayer || buzzing) return
    setBuzzing(true)
    setWriteError('')
    try {
      await updateDoc(roomDocRef.current, {
        'payload.buzzedBy':    { id: playerId, name: myPlayer.name, teamIdx: myPlayer.teamIdx },
        'payload.buzzersOpen': false,
      })
    } catch (err) {
      console.error('Buzz failed', err)
      setWriteError(payloadWriteMessage(err, 'buzz in'))
    } finally {
      setBuzzing(false)
    }
  }

  const submitAnswer = async (text) => {
    if (!iBuzzed || !myPlayer) return
    setMySubmission({ text })
    setWriteError('')
    try {
      await updateDoc(roomDocRef.current, {
        'payload.submittedAnswer': {
          id:          playerId,
          name:        myPlayer.name,
          teamIdx:     myPlayer.teamIdx ?? 0,
          text,
          submittedAt: Date.now(),
        },
      })
    } catch (err) {
      console.error('Sending the answer failed', err)
      setMySubmission(null)
      setWriteError(payloadWriteMessage(err, 'send your answer'))
    }
  }

  // ── Join screen ──
  if (!myPlayer) {
    return (
      <div className="play-join play-join--jeopardy">
        <div className="play-join-game">Jeopardy!</div>
        <div className="play-join-code">Room {room.code || room.id}</div>
        <input
          className="play-join-input"
          placeholder="Your name"
          aria-label="Your name"
          value={name}
          onChange={e => setName(e.target.value)}
          maxLength={20}
          autoCapitalize="words"
          spellCheck={false}
          autoFocus
        />
        <Notice>{joinError}</Notice>
        {name.trim() && (
          <div className="feud-team-pick">
            <div className="feud-team-pick-label">Pick your team</div>
            {teamNames.map((tn, i) => (
              <button
                key={i}
                className="feud-team-btn"
                style={{ background: TEAM_COLORS_JEOP[i] || '#6366f1' }}
                disabled={joining}
                onClick={() => join({ id: playerId, name: name.trim(), teamIdx: i })}
              >
                {tn}
              </button>
            ))}
          </div>
        )}
      </div>
    )
  }

  // ── Result screens ──
  if (myResult === 'correct') {
    return (
      <Splash
        className="play-splash--correct"
        icon={<IconCheckCircle size={64} />}
        title="Correct"
        sub={`+$${payload.clueValue || ''}`}
      />
    )
  }
  if (myResult === 'wrong') {
    return (
      <Splash
        className="play-splash--wrong"
        icon={<IconXCircle size={64} />}
        title="Not quite"
        sub="Good try."
      />
    )
  }
  if (answerResult === 'correct' && !myResult) {
    return (
      <Splash
        icon={<IconTrophy size={48} />}
        title={`${answeredBy?.name || buzzedBy?.name || 'Someone'} got it`}
        sub={`+$${payload.clueValue || ''}`}
      />
    )
  }

  // ── I buzzed in: waiting for my submission to be checked ──
  if (iBuzzed && mySubmission) {
    return <Splash className="play-splash--checking" icon={<div className="play-spinner" />} title="Checking…" />
  }

  // ── I buzzed in: show answer input ──
  if (iBuzzed) {
    return (
      <AnswerScreen
        clueText={payload.clueText}
        prompt="What is…"
        onSubmit={submitAnswer}
        error={writeError}
      />
    )
  }

  // ── Someone else buzzed ──
  if (buzzedBy) {
    return (
      <Splash
        icon={<IconZap size={48} />}
        title={`${buzzedBy.name} is answering…`}
        sub="Hang on a moment."
      />
    )
  }

  // ── Clue active: I can buzz ──
  if (phase === 'clue' && iCanBuzz) {
    return <BuzzScreen onBuzz={buzz} busy={buzzing} error={writeError} />
  }

  // ── Clue active: I already answered wrong ──
  if (phase === 'clue' && iWasWrong) {
    return (
      <Splash
        icon={<span style={{ color: '#ef4444' }}><IconXCircle size={48} /></span>}
        title="You're out for this one"
        sub="Let the others have a go."
      />
    )
  }

  // ── Clue active: waiting for buzzers ──
  if (phase === 'clue') {
    return (
      <Splash
        icon={<IconLightbulb size={48} />}
        title="Clue is up"
        sub={buzzersOpen ? 'Buzzers are open.' : 'Waiting for buzzers…'}
      />
    )
  }

  // ── Board: waiting for host to pick ──
  const myTeamColor = myPlayer.teamIdx != null ? TEAM_COLORS_JEOP[myPlayer.teamIdx] : '#6366f1'
  return (
    <Splash
      icon={<IconTv size={48} />}
      title={myPlayer.name}
      sub={myPlayer.teamIdx != null ? teamNames[myPlayer.teamIdx] : "You're in"}
    >
      <div className="play-splash-players" style={{ color: myTeamColor, fontWeight: 700 }}>
        {players.length} player{players.length !== 1 ? 's' : ''} connected
      </div>
    </Splash>
  )
}

// ── Family Feud phone UI ──────────────────────────────────────
function FamilyFeudPhone({ room, players, payload, playerId, myPlayer, addPlayer }) {
  const roomDocRef = useRef(doc(db, ...gameRoom(room.id)))
  const [name, setName]                 = useState('')
  const [mySubmission, setMySubmission] = useState(null)
  const [fmText, setFmText]             = useState('')
  const [fmTimeLeft, setFmTimeLeft]     = useState(null)
  const [buzzing, setBuzzing]           = useState(false)
  const [writeError, setWriteError]     = useState('')
  const fmRafRef = useRef(null)
  const { join, joining, error: joinError } = useJoin(addPlayer)

  const gamePhase    = payload.phase || 'board'
  const faceofState  = payload.faceofState || 'open'
  const activeTeam   = payload.activeTeam ?? null
  const buzzedBy     = payload.buzzedBy
  const buzzersOpen  = payload.buzzersOpen
  const answerResult = payload.answerResult
  const teamNames    = payload.teamNames || ['Family 1', 'Family 2']
  const stealing     = payload.stealing || false
  const stealTeam    = payload.stealTeam ?? null
  const strikes      = payload.strikes || 0
  const questionText = payload.questionText || ''
  const fmPhase      = payload.fmPhase || 'intro'
  const fmTeam       = payload.fmTeam ?? 0
  const fmCurrentQ   = payload.fmCurrentQ ?? 0
  const fmDuplicate  = payload.fmDuplicate || false
  const fmTimerStart = payload.fmTimerStart || null

  useEffect(() => {
    if (!buzzedBy && !answerResult) setMySubmission(null)
  }, [buzzedBy, answerResult])

  useEffect(() => {
    if (!fmDuplicate) setFmText('')
  }, [fmDuplicate])

  useEffect(() => { setWriteError('') }, [questionText, gamePhase, fmCurrentQ])

  useEffect(() => {
    cancelAnimationFrame(fmRafRef.current)
    if (!fmTimerStart || (fmPhase !== 'p1' && fmPhase !== 'p2')) {
      setFmTimeLeft(null)
      return
    }
    const limitMs = fmPhase === 'p2' ? 25000 : 20000
    const tick = () => {
      const remaining = Math.max(0, limitMs - (Date.now() - fmTimerStart))
      setFmTimeLeft(Math.ceil(remaining / 1000))
      if (remaining > 0) fmRafRef.current = requestAnimationFrame(tick)
    }
    fmRafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(fmRafRef.current)
  }, [fmTimerStart, fmPhase])

  const myTeam  = myPlayer?.team
  const iBuzzed = buzzedBy?.id === playerId

  const iCanBuzz = buzzersOpen && !buzzedBy && (() => {
    if (gamePhase === 'faceof') {
      if (faceofState === 'open') return true
      if (faceofState === 'counter') return activeTeam === null || activeTeam === myTeam
      return false
    }
    if (stealing) return stealTeam === myTeam
    return activeTeam === null || activeTeam === myTeam
  })()

  const myResult = mySubmission ? answerResult : null

  const buzz = async () => {
    if (!iCanBuzz || !myPlayer || buzzing) return
    setBuzzing(true)
    setWriteError('')
    try {
      await updateDoc(roomDocRef.current, {
        'payload.buzzedBy':    { id: playerId, name: myPlayer.name, team: myTeam },
        'payload.buzzersOpen': false,
      })
    } catch (err) {
      console.error('Buzz failed', err)
      setWriteError(payloadWriteMessage(err, 'buzz in'))
    } finally {
      setBuzzing(false)
    }
  }

  const submitAnswer = async (text) => {
    if (!iBuzzed || !myPlayer) return
    setMySubmission({ text })
    setWriteError('')
    try {
      await updateDoc(roomDocRef.current, {
        'payload.submittedAnswer': {
          id: playerId, name: myPlayer.name, team: myTeam, text, submittedAt: Date.now(),
        },
      })
    } catch (err) {
      console.error('Sending the answer failed', err)
      setMySubmission(null)
      setWriteError(payloadWriteMessage(err, 'send your answer'))
    }
  }

  const submitFmAnswer = async () => {
    const text = fmText.trim()
    if (!text) return
    setFmText('')
    setWriteError('')
    try {
      await updateDoc(roomDocRef.current, {
        'payload.fmSubmit': {
          playerId, qIdx: fmCurrentQ, text, submittedAt: Date.now(),
        },
        'payload.fmDuplicate': false,
      })
    } catch (err) {
      console.error('Sending the Fast Money answer failed', err)
      setFmText(text)
      setWriteError(payloadWriteMessage(err, 'send your answer'))
    }
  }

  // ── Join screen ──
  if (!myPlayer) {
    return (
      <div className="play-join play-join--feud">
        <div className="play-join-game">Family Feud</div>
        <div className="play-join-code">Room {room.code || room.id}</div>
        <input
          className="play-join-input"
          placeholder="Your name"
          aria-label="Your name"
          value={name}
          onChange={e => setName(e.target.value)}
          maxLength={20}
          autoCapitalize="words"
          spellCheck={false}
          autoFocus
        />
        <Notice>{joinError}</Notice>
        {name.trim() && (
          <div className="feud-team-pick">
            <div className="feud-team-pick-label">Pick your family</div>
            <button className="feud-team-btn" style={{ background: '#e11d48' }} disabled={joining}
              onClick={() => join({ id: playerId, name: name.trim(), team: 0, score: 0 })}>
              {teamNames[0]}
            </button>
            <button className="feud-team-btn" style={{ background: '#2563eb' }} disabled={joining}
              onClick={() => join({ id: playerId, name: name.trim(), team: 1, score: 0 })}>
              {teamNames[1]}
            </button>
          </div>
        )}
      </div>
    )
  }

  // ── Fast Money ──
  if (gamePhase === 'fastmoney') {
    if (myTeam !== fmTeam) {
      return (
        <Splash
          icon={<IconHourglass size={48} />}
          title="Fast Money"
          sub={`${teamNames[fmTeam]} is playing…`}
        />
      )
    }
    if (fmPhase === 'intro') {
      return (
        <Splash
          icon={<IconStar size={48} />}
          title="Fast Money"
          sub="Your family is up next."
        />
      )
    }
    if (fmPhase === 'p1' || fmPhase === 'p2') {
      const timerUrgency = fmTimeLeft !== null
        ? (fmTimeLeft <= 5 ? 'critical' : fmTimeLeft <= 10 ? 'warning' : 'ok')
        : 'ok'
      return (
        <div className="fm-phone-answer">
          <div className="fm-phone-phase">{fmPhase === 'p1' ? 'Player 1' : 'Player 2'}</div>
          {fmTimeLeft !== null && (
            <div className="fm-phone-timer" data-urgency={timerUrgency}>{fmTimeLeft}s</div>
          )}
          <div className="fm-phone-q-num">Q{fmCurrentQ + 1} of 5</div>
          <div className="fm-phone-q">{questionText}</div>
          {fmDuplicate && (
            <div className="fm-phone-dup">
              <IconAlertTriangle size={14} /> Already said. Try a different answer.
            </div>
          )}
          <Notice>{writeError}</Notice>
          <input
            className="play-answer-input"
            placeholder="Type your answer…"
            aria-label="Your answer"
            value={fmText}
            onChange={e => setFmText(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && fmText.trim() && submitFmAnswer()}
            autoFocus
            maxLength={80}
          />
          <button
            className="play-submit-btn"
            onClick={submitFmAnswer}
            disabled={!fmText.trim()}
          >
            Send answer
          </button>
        </div>
      )
    }
    if (fmPhase === 'p1_done') {
      return (
        <Splash
          icon={<IconPause size={48} />}
          title="Player 1 is done"
          sub="Waiting for Player 2 to start…"
        />
      )
    }
    return (
      <Splash
        icon={<IconTrophy size={48} />}
        title="Fast Money is over"
        sub="Results are on the big screen."
      />
    )
  }

  // ── Result screens for board/face-off ──
  if (myResult === 'found') {
    return (
      <Splash className="play-splash--found" icon={<IconCheckCircle size={64} />} title="On the board" sub="Good answer." />
    )
  }
  if (myResult === 'strike') {
    return (
      <Splash className="play-splash--strike" icon={<IconXCircle size={64} />} title={`Strike ${strikes} of 3`} sub="Not on the board." />
    )
  }
  if (answerResult === 'found' && !myResult && buzzedBy) {
    return (
      <Splash icon={<IconCheckCircle size={48} />} title={`${buzzedBy.name} found one`} sub={buzzedBy.team != null ? teamNames[buzzedBy.team] : ''} />
    )
  }
  if (answerResult === 'strike' && !myResult && buzzedBy) {
    return (
      <Splash icon={<span style={{ color: '#ef4444' }}><IconXCircle size={48} /></span>} title={`Strike for ${buzzedBy.name}`} sub={`${strikes} of 3 strikes`} />
    )
  }

  if (iBuzzed && mySubmission) {
    return <Splash className="play-splash--checking" icon={<div className="play-spinner" />} title="Checking…" />
  }

  if (iBuzzed) {
    return <AnswerScreen clueText={questionText} onSubmit={submitAnswer} error={writeError} />
  }

  if (buzzedBy) {
    return (
      <Splash icon={<IconZap size={48} />} title={`${buzzedBy.name} is answering…`} sub={buzzedBy.team != null ? teamNames[buzzedBy.team] : ''} />
    )
  }

  if (stealing && stealTeam !== myTeam) {
    return (
      <Splash icon={<IconHourglass size={48} />} title="Waiting…" sub={`${teamNames[stealTeam ?? 0]} is trying to steal`} />
    )
  }

  if (stealing && stealTeam === myTeam && iCanBuzz) {
    return (
      <div className="play-steal-screen">
        <div className="play-steal-banner"><IconStar size={22} /> Steal</div>
        <div className="play-steal-sub">Your family can steal. Buzz in when you're ready.</div>
        <BuzzScreen onBuzz={buzz} busy={buzzing} error={writeError} />
      </div>
    )
  }

  if (gamePhase === 'faceof' && !iCanBuzz && faceofState === 'counter') {
    return (
      <Splash icon={<IconHourglass size={48} />} title="Counter chance" sub={`${teamNames[activeTeam ?? 0]} is answering…`} />
    )
  }

  if (iCanBuzz) {
    return <BuzzScreen onBuzz={buzz} busy={buzzing} error={writeError} />
  }

  const myTeamColor = myTeam != null ? ['#e11d48', '#2563eb'][myTeam] : '#6366f1'
  return (
    <Splash icon={<span style={{ color: myTeamColor }}><IconUser size={48} /></span>} title={myPlayer.name} sub={myTeam != null ? teamNames[myTeam] : "You're in"}>
      {questionText
        ? <div className="play-question-hint">{questionText}</div>
        : <div className="play-splash-players"><IconUser size={14} /> {players.length} player{players.length !== 1 ? 's' : ''} joined</div>
      }
    </Splash>
  )
}

// ── Trivia Showdown phone UI ──────────────────────────────────
function ShowdownPhone({ room, players, payload, playerId, myPlayer, addPlayer, updatePlayer }) {
  const [name, setName]         = useState('')
  const [timeLeft, setTimeLeft] = useState(20)
  const [sending, setSending]   = useState(false)
  const [answerError, setAnswerError] = useState('')
  const rafRef = useRef(null)
  const { join: joinRoom, joining, error: joinError } = useJoin(addPlayer)

  const hasAnswered = myPlayer?.answer != null && myPlayer?.answer !== -1
  const phase       = payload.phase || 'lobby'

  useEffect(() => {
    cancelAnimationFrame(rafRef.current)
    if (phase !== 'question' || !payload.questionStartedAt) return
    const startedAt = payload.questionStartedAt
    const limit     = payload.timeLimit || 20
    const tick = () => {
      const remaining = Math.max(0, limit - (Date.now() - startedAt) / 1000)
      setTimeLeft(remaining)
      if (remaining > 0) rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [phase, payload.questionStartedAt]) // eslint-disable-line

  useEffect(() => { setAnswerError('') }, [payload.questionIndex, phase])

  const join = () => {
    if (!name.trim() || !room) return
    joinRoom({ id: playerId, name: name.trim(), score: 0, answer: -1, answeredAt: null, lastPoints: 0 })
  }

  const submitAnswer = async (idx) => {
    if (hasAnswered || sending) return
    setSending(true)
    setAnswerError('')
    try {
      await updatePlayer(playerId, { answer: idx, answeredAt: Date.now() })
    } catch (err) {
      console.error('Sending the answer failed', err)
      setAnswerError(roomErrorMessage(err))
    } finally {
      setSending(false)
    }
  }

  if (phase === 'done' || room.state === 'closed') {
    const sorted = [...players].sort((a, b) => (b.score || 0) - (a.score || 0))
    const myRank = sorted.findIndex(p => p.id === playerId) + 1
    return (
      <div className="play-splash play-splash--done">
        <div className="play-splash-icon" style={{ color: myRank > 0 && myRank <= 3 ? RANK_COLORS[myRank - 1] : undefined }}>
          <IconStar size={56} />
        </div>
        <div className="play-splash-name">{myPlayer?.name || name}</div>
        {myRank > 0 && (
          <div className="play-splash-rank" style={myRank <= 3 ? { color: RANK_COLORS[myRank - 1], fontWeight: 700 } : {}}>
            #{myRank}
          </div>
        )}
        <div className="play-splash-msg">{(myPlayer?.score || 0).toLocaleString()} pts</div>
        <div className="play-splash-game-over">That's the game. Thanks for playing.</div>
      </div>
    )
  }

  // Whether we're in the game comes from the room itself, so a reload (or a
  // tab the phone discarded) goes straight back in rather than asking for a
  // name again and adding a second entry.
  if (!myPlayer) return (
    <div className="play-join">
      <div className="play-join-game">Trivia Showdown</div>
      <div className="play-join-code">Room {room.code || room.id}</div>
      <input
        className="play-join-input"
        placeholder="Your name"
        aria-label="Your name"
        value={name}
        onChange={e => setName(e.target.value)}
        onKeyDown={e => e.key === 'Enter' && join()}
        autoCapitalize="words"
        spellCheck={false}
        autoFocus maxLength={20}
      />
      <Notice>{joinError}</Notice>
      <button className="play-join-btn" onClick={join} disabled={!name.trim() || joining}>
        {joining ? 'Joining…' : 'Join game'}
      </button>
    </div>
  )

  if (room.state === 'waiting' || phase === 'lobby') return (
    <div className="play-splash play-splash--waiting">
      <div className="play-splash-icon"><IconCheck size={40} /></div>
      <div className="play-splash-name">{myPlayer.name}</div>
      <div className="play-splash-msg">You're in. Waiting for the game to start…</div>
      <div className="play-splash-players">
        <IconUser size={14} /> {players.length} player{players.length !== 1 ? 's' : ''} joined
      </div>
    </div>
  )

  if (phase === 'reveal') {
    const myAnswer   = myPlayer.answer
    const correct    = payload.answer
    const wasCorrect = myAnswer === correct && myAnswer !== -1
    const pts        = myPlayer.lastPoints || 0
    const totalScore = myPlayer.score || 0
    return (
      <div className="play-reveal-screen">
        <div className={`play-verdict ${wasCorrect ? 'play-verdict--correct' : 'play-verdict--wrong'}`}>
          {myAnswer === -1 || myAnswer == null
            ? <><IconClock size={20} /> Out of time</>
            : wasCorrect
              ? <><IconCheckCircle size={20} /> Correct</>
              : <><IconXCircle size={20} /> Not quite</>}
        </div>
        {wasCorrect && pts > 0 && <div className="play-pts-gained">+{pts.toLocaleString()}</div>}
        {!wasCorrect && myAnswer !== -1 && myAnswer != null && payload.answer !== -1 && (
          <div className="play-correct-ans">
            <div className="play-correct-ans-label">The answer was</div>
            <div className="play-correct-ans-text" style={{ background: COLORS[payload.answer] }}>
              <span aria-hidden="true">{SHAPES[payload.answer]}</span> {(payload.options || [])[payload.answer]}
            </div>
          </div>
        )}
        <div className="play-total-score">{totalScore.toLocaleString()} pts total</div>
        <div className="play-mini-lb">
          {[...players].sort((a, b) => (b.score || 0) - (a.score || 0)).slice(0, 5).map((p, i) => (
            <div key={p.id} className={`play-mini-lb-row ${p.id === playerId ? 'play-mini-lb-row--me' : ''}`}>
              <span className="play-mini-lb-rank" style={i < 3 ? { color: RANK_COLORS[i], fontWeight: 700 } : {}}>{i < 3 ? `#${i+1}` : `${i+1}.`}</span>
              <span className="play-mini-lb-name">{p.name}</span>
              <span className="play-mini-lb-pts">{(p.score || 0).toLocaleString()}</span>
            </div>
          ))}
        </div>
        <div className="play-waiting-next">Waiting for the next question…</div>
      </div>
    )
  }

  const timePct  = (timeLeft / (payload.timeLimit || 20)) * 100
  const timerClr = timeLeft > 10 ? '#22c55e' : timeLeft > 5 ? '#f59e0b' : '#ef4444'

  return (
    <div className="play-question-screen">
      <div className="play-timer-bar">
        <div className="play-timer-fill" style={{ width: `${timePct}%`, background: timerClr, transition: 'width 0.1s linear' }} />
      </div>
      <div className="play-timer-num" style={{ color: timerClr }}>{Math.ceil(timeLeft)}</div>
      <div className="play-q-text">{payload.questionText}</div>
      <div className="play-q-num">Q {(payload.questionIndex ?? 0) + 1}</div>
      <Notice>{answerError}</Notice>
      {!hasAnswered ? (
        <div className="play-answer-grid">
          {(payload.options || []).map((opt, i) => (
            <button key={i} className="play-answer-btn" style={{ background: COLORS[i] }}
              disabled={sending} onClick={() => submitAnswer(i)}>
              <span className="play-ans-shape" aria-hidden="true">{SHAPES[i]}</span>
              <span className="play-ans-text">{opt}</span>
            </button>
          ))}
        </div>
      ) : (
        <div className="play-locked">
          <div className="play-locked-icon" style={{ background: COLORS[myPlayer.answer] }} aria-hidden="true">{SHAPES[myPlayer.answer]}</div>
          <div className="play-locked-msg">Answer locked in</div>
          <div className="play-locked-sub">Waiting for everyone else…</div>
        </div>
      )}
    </div>
  )
}

// ── Root PlayRoom ─────────────────────────────────────────────
export default function PlayRoom({ roomCode: rawRoomCode }) {
  const roomCode = useMemo(() => normalizeRoomCode(rawRoomCode), [rawRoomCode])
  // Kept in localStorage per room, so coming back to a discarded tab rejoins
  // as the same player.
  const playerId = useMemo(() => getGuestId(roomCode), [roomCode])

  const { room, players, payload, status, retry, addPlayer, updatePlayer } = useGameRoom(roomCode)

  const myPlayer = players.find(p => p.id === playerId)
  const game     = room?.game

  if (status === 'loading') return (
    <div className="play-splash" role="status" aria-label="Loading the game"><div className="play-spinner" /></div>
  )

  if (!room) return <RoomStatus status={status} onRetry={retry} />

  if (game === 'jeopardy') {
    return (
      <JeopardyPhone
        room={room}
        players={players}
        payload={payload}
        playerId={playerId}
        myPlayer={myPlayer}
        addPlayer={addPlayer}
      />
    )
  }

  if (game === 'feud') {
    return (
      <FamilyFeudPhone
        room={room}
        players={players}
        payload={payload}
        playerId={playerId}
        myPlayer={myPlayer}
        addPlayer={addPlayer}
      />
    )
  }

  return (
    <ShowdownPhone
      room={room}
      players={players}
      payload={payload}
      playerId={playerId}
      myPlayer={myPlayer}
      addPlayer={addPlayer}
      updatePlayer={updatePlayer}
    />
  )
}
