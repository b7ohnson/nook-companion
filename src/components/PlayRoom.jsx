import { useState, useEffect, useRef } from 'react'
import { doc, updateDoc } from 'firebase/firestore'
import { db } from '../firebase'
import { useGameRoom } from '../hooks/useGameRoom'
import {
  IconUser, IconAlertTriangle, IconCheck,
  IconClock, IconCheckCircle, IconXCircle, IconStar,
} from './Icons'

const COLORS      = ['#e21b3c', '#1368ce', '#d89e00', '#26890c']
const SHAPES      = ['▲', '●', '■', '★']
const RANK_COLORS = ['#f59e0b', '#94a3b8', '#b45309']
const TEAM_COLORS_JEOP = ['#3b82f6', '#8b5cf6', '#ec4899', '#f59e0b']

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

function BuzzButton({ onBuzz, disabled }) {
  return (
    <div className="buzz-screen">
      <button
        className={`buzz-btn ${disabled ? 'buzz-btn--disabled' : ''}`}
        onClick={onBuzz}
        disabled={disabled}
      >
        <span className="buzz-btn-icon">🔔</span>
        <span className="buzz-btn-label">BUZZ IN!</span>
      </button>
    </div>
  )
}

function AnswerScreen({ prompt, clueText, onSubmit }) {
  const [text, setText] = useState('')
  return (
    <div className="play-answer-screen">
      {clueText && <div className="play-clue-preview">{clueText}</div>}
      {prompt   && <div className="play-answer-prompt">{prompt}</div>}
      <input
        className="play-answer-input"
        placeholder="Type your answer…"
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
        Submit Answer
      </button>
    </div>
  )
}

// ── Jeopardy phone UI ─────────────────────────────────────────
function JeopardyPhone({ room, players, payload, playerId, myPlayer, addPlayer }) {
  const roomDocRef   = useRef(doc(db, 'gameRooms', room.id))
  const [name, setName]             = useState('')
  const [mySubmission, setMySubmission] = useState(null)

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

  const iBuzzed         = buzzedBy?.id === playerId
  const iWasWrong       = wrongAnswerers.includes(playerId)
  const iCanBuzz        = buzzersOpen && !iWasWrong && !buzzedBy
  const myResult        = mySubmission ? answerResult : null

  const buzz = async () => {
    if (!iCanBuzz || !myPlayer) return
    await updateDoc(roomDocRef.current, {
      'payload.buzzedBy':    { id: playerId, name: myPlayer.name, teamIdx: myPlayer.teamIdx },
      'payload.buzzersOpen': false,
    })
  }

  const submitAnswer = async (text) => {
    if (!iBuzzed || !myPlayer) return
    setMySubmission({ text })
    await updateDoc(roomDocRef.current, {
      'payload.submittedAnswer': {
        id:          playerId,
        name:        myPlayer.name,
        teamIdx:     myPlayer.teamIdx ?? 0,
        text,
        submittedAt: Date.now(),
      },
    })
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
          value={name}
          onChange={e => setName(e.target.value)}
          maxLength={20}
          autoFocus
        />
        {name.trim() && (
          <div className="feud-team-pick">
            <div className="feud-team-pick-label">Pick your team:</div>
            {teamNames.map((tn, i) => (
              <button
                key={i}
                className="feud-team-btn"
                style={{ background: TEAM_COLORS_JEOP[i] || '#6366f1' }}
                onClick={() => addPlayer({ id: playerId, name: name.trim(), teamIdx: i })}
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
        icon={<span style={{ fontSize: 64 }}>✓</span>}
        title="CORRECT!"
        sub={`+$${payload.clueValue || ''}`}
      />
    )
  }
  if (myResult === 'wrong') {
    return (
      <Splash
        className="play-splash--wrong"
        icon={<span style={{ fontSize: 64 }}>✗</span>}
        title="WRONG!"
        sub="Nice try!"
      />
    )
  }
  if (answerResult === 'correct' && !myResult) {
    return (
      <Splash
        icon={<span style={{ fontSize: 48 }}>🎉</span>}
        title={`${answeredBy?.name || buzzedBy?.name || 'Someone'} got it!`}
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
      />
    )
  }

  // ── Someone else buzzed ──
  if (buzzedBy) {
    return (
      <Splash
        icon={<span style={{ fontSize: 48 }}>⚡</span>}
        title={`${buzzedBy.name} is answering…`}
        sub="Wait for your turn!"
      />
    )
  }

  // ── Clue active: I can buzz ──
  if (phase === 'clue' && iCanBuzz) {
    return <BuzzButton onBuzz={buzz} disabled={false} />
  }

  // ── Clue active: I already answered wrong ──
  if (phase === 'clue' && iWasWrong) {
    return (
      <Splash
        icon={<span style={{ fontSize: 48, color: '#ef4444' }}>✗</span>}
        title="You're out!"
        sub="Let the others try…"
      />
    )
  }

  // ── Clue active: waiting for buzzers ──
  if (phase === 'clue') {
    return (
      <Splash
        icon={<span style={{ fontSize: 48 }}>💡</span>}
        title="Clue is active"
        sub={buzzersOpen ? 'Get ready to buzz!' : 'Waiting for buzzers…'}
      />
    )
  }

  // ── Board: waiting for host to pick ──
  const myTeamColor = myPlayer.teamIdx != null ? TEAM_COLORS_JEOP[myPlayer.teamIdx] : '#6366f1'
  return (
    <Splash
      icon={<span style={{ fontSize: 48 }}>📺</span>}
      title={myPlayer.name}
      sub={myPlayer.teamIdx != null ? teamNames[myPlayer.teamIdx] : 'Ready!'}
    >
      <div className="play-splash-players" style={{ color: myTeamColor, fontWeight: 700 }}>
        {players.length} player{players.length !== 1 ? 's' : ''} connected
      </div>
    </Splash>
  )
}

// ── Family Feud phone UI ──────────────────────────────────────
function FamilyFeudPhone({ room, players, payload, playerId, myPlayer, addPlayer }) {
  const roomDocRef = useRef(doc(db, 'gameRooms', room.id))
  const [name, setName]                 = useState('')
  const [mySubmission, setMySubmission] = useState(null)
  const [fmText, setFmText]             = useState('')
  const [fmTimeLeft, setFmTimeLeft]     = useState(null)
  const fmRafRef = useRef(null)

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
    if (!iCanBuzz || !myPlayer) return
    await updateDoc(roomDocRef.current, {
      'payload.buzzedBy':    { id: playerId, name: myPlayer.name, team: myTeam },
      'payload.buzzersOpen': false,
    })
  }

  const submitAnswer = async (text) => {
    if (!iBuzzed || !myPlayer) return
    setMySubmission({ text })
    await updateDoc(roomDocRef.current, {
      'payload.submittedAnswer': {
        id: playerId, name: myPlayer.name, team: myTeam, text, submittedAt: Date.now(),
      },
    })
  }

  const submitFmAnswer = async () => {
    const text = fmText.trim()
    if (!text) return
    setFmText('')
    await updateDoc(roomDocRef.current, {
      'payload.fmSubmit': {
        playerId, qIdx: fmCurrentQ, text, submittedAt: Date.now(),
      },
      'payload.fmDuplicate': false,
    })
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
          value={name}
          onChange={e => setName(e.target.value)}
          maxLength={20}
          autoFocus
        />
        {name.trim() && (
          <div className="feud-team-pick">
            <div className="feud-team-pick-label">Pick your family:</div>
            <button className="feud-team-btn" style={{ background: '#e11d48' }}
              onClick={() => addPlayer({ id: playerId, name: name.trim(), team: 0, score: 0 })}>
              {teamNames[0]}
            </button>
            <button className="feud-team-btn" style={{ background: '#2563eb' }}
              onClick={() => addPlayer({ id: playerId, name: name.trim(), team: 1, score: 0 })}>
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
          icon={<span style={{ fontSize: 48 }}>⏳</span>}
          title="Fast Money!"
          sub={`${teamNames[fmTeam]} is playing…`}
        />
      )
    }
    if (fmPhase === 'intro') {
      return (
        <Splash
          icon={<span style={{ fontSize: 48 }}>⭐</span>}
          title="Fast Money!"
          sub="Get ready — your team is up!"
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
            <div className="fm-phone-dup">⚠ Duplicate — try a different answer!</div>
          )}
          <input
            className="play-answer-input"
            placeholder="Type your answer…"
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
            Submit Answer
          </button>
        </div>
      )
    }
    if (fmPhase === 'p1_done') {
      return (
        <Splash
          icon={<span style={{ fontSize: 48 }}>⏸</span>}
          title="Player 1 done!"
          sub="Waiting for Player 2 to start…"
        />
      )
    }
    return (
      <Splash
        icon={<span style={{ fontSize: 48 }}>🎉</span>}
        title="Fast Money done!"
        sub="See the results on screen!"
      />
    )
  }

  // ── Result screens for board/face-off ──
  if (myResult === 'found') {
    return (
      <Splash className="play-splash--found" icon={<span style={{ fontSize: 64 }}>✓</span>} title="FOUND IT!" sub="Great answer!" />
    )
  }
  if (myResult === 'strike') {
    return (
      <Splash className="play-splash--strike" icon={<span style={{ fontSize: 64 }}>✗</span>} title={`Strike ${strikes}/3`} sub="Not on the board!" />
    )
  }
  if (answerResult === 'found' && !myResult && buzzedBy) {
    return (
      <Splash icon={<span style={{ fontSize: 48 }}>✓</span>} title={`${buzzedBy.name} found it!`} sub={buzzedBy.team != null ? teamNames[buzzedBy.team] : ''} />
    )
  }
  if (answerResult === 'strike' && !myResult && buzzedBy) {
    return (
      <Splash icon={<span style={{ fontSize: 48, color: '#ef4444' }}>✗</span>} title={`${buzzedBy.name} — strike!`} sub={`${strikes}/3 strikes`} />
    )
  }

  if (iBuzzed && mySubmission) {
    return <Splash className="play-splash--checking" icon={<div className="play-spinner" />} title="Checking…" />
  }

  if (iBuzzed) {
    return <AnswerScreen clueText={questionText} onSubmit={submitAnswer} />
  }

  if (buzzedBy) {
    return (
      <Splash icon={<span style={{ fontSize: 48 }}>⚡</span>} title={`${buzzedBy.name} is answering…`} sub={buzzedBy.team != null ? teamNames[buzzedBy.team] : ''} />
    )
  }

  if (stealing && stealTeam !== myTeam) {
    return (
      <Splash icon={<span style={{ fontSize: 48 }}>⏳</span>} title="Waiting…" sub={`${teamNames[stealTeam ?? 0]} is attempting the steal`} />
    )
  }

  if (stealing && stealTeam === myTeam && iCanBuzz) {
    return (
      <div className="play-steal-screen">
        <div className="play-steal-banner">⭐ STEAL!</div>
        <div className="play-steal-sub">Your chance — buzz in!</div>
        <BuzzButton onBuzz={buzz} disabled={false} />
      </div>
    )
  }

  if (gamePhase === 'faceof' && !iCanBuzz && faceofState === 'counter') {
    return (
      <Splash icon={<span style={{ fontSize: 48 }}>⏳</span>} title="Counter chance!" sub={`${teamNames[activeTeam ?? 0]} is answering…`} />
    )
  }

  if (iCanBuzz) {
    return <BuzzButton onBuzz={buzz} disabled={false} />
  }

  const myTeamColor = myTeam != null ? ['#e11d48', '#2563eb'][myTeam] : '#6366f1'
  return (
    <Splash icon={<span style={{ fontSize: 48, color: myTeamColor }}>●</span>} title={myPlayer.name} sub={myTeam != null ? teamNames[myTeam] : 'Ready!'}>
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
  const [joined, setJoined]     = useState(false)
  const [timeLeft, setTimeLeft] = useState(20)
  const rafRef = useRef(null)

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

  const join = async () => {
    if (!name.trim() || !room) return
    await addPlayer({ id: playerId, name: name.trim(), score: 0, answer: -1, answeredAt: null, lastPoints: 0 })
    setJoined(true)
  }

  const submitAnswer = async (idx) => {
    if (hasAnswered) return
    await updatePlayer(playerId, { answer: idx, answeredAt: Date.now() })
  }

  if (phase === 'done' || room.state === 'closed') {
    const sorted = [...players].sort((a, b) => (b.score || 0) - (a.score || 0))
    const myRank = sorted.findIndex(p => p.id === playerId) + 1
    return (
      <div className="play-splash play-splash--done">
        <div className="play-splash-icon" style={{ color: myRank <= 3 ? RANK_COLORS[myRank - 1] : undefined }}>
          <IconStar size={56} />
        </div>
        <div className="play-splash-name">{name || myPlayer?.name}</div>
        <div className="play-splash-rank" style={myRank <= 3 ? { color: RANK_COLORS[myRank - 1], fontWeight: 700 } : {}}>
          #{myRank}
        </div>
        <div className="play-splash-msg">{(myPlayer?.score || 0).toLocaleString()} pts</div>
        <div className="play-splash-game-over">Game Over!</div>
      </div>
    )
  }

  if (!joined) return (
    <div className="play-join">
      <div className="play-join-game">Trivia Showdown</div>
      <div className="play-join-code">Room {room.code}</div>
      <input
        className="play-join-input"
        placeholder="Your name"
        value={name}
        onChange={e => setName(e.target.value)}
        onKeyDown={e => e.key === 'Enter' && join()}
        autoFocus maxLength={20}
      />
      <button className="play-join-btn" onClick={join} disabled={!name.trim()}>
        Join Game
      </button>
    </div>
  )

  if (room.state === 'waiting' || phase === 'lobby') return (
    <div className="play-splash play-splash--waiting">
      <div className="play-splash-icon"><IconCheck size={40} /></div>
      <div className="play-splash-name">{name.trim()}</div>
      <div className="play-splash-msg">Ready! Waiting for host to start…</div>
      <div className="play-splash-players">
        <IconUser size={14} /> {players.length} player{players.length !== 1 ? 's' : ''} joined
      </div>
    </div>
  )

  if (phase === 'reveal') {
    const myAnswer   = myPlayer?.answer
    const correct    = payload.answer
    const wasCorrect = myAnswer === correct && myAnswer !== -1
    const pts        = myPlayer?.lastPoints || 0
    const totalScore = myPlayer?.score || 0
    return (
      <div className="play-reveal-screen">
        <div className={`play-verdict ${wasCorrect ? 'play-verdict--correct' : 'play-verdict--wrong'}`}>
          {myAnswer === -1 || myAnswer == null
            ? <><IconClock size={20} /> Time's up!</>
            : wasCorrect
              ? <><IconCheckCircle size={20} /> Correct!</>
              : <><IconXCircle size={20} /> Wrong!</>}
        </div>
        {wasCorrect && pts > 0 && <div className="play-pts-gained">+{pts.toLocaleString()}</div>}
        {!wasCorrect && myAnswer !== -1 && myAnswer != null && payload.answer !== -1 && (
          <div className="play-correct-ans">
            <div className="play-correct-ans-label">Correct answer:</div>
            <div className="play-correct-ans-text" style={{ background: COLORS[payload.answer] }}>
              {SHAPES[payload.answer]} {(payload.options || [])[payload.answer]}
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
        <div className="play-waiting-next">Waiting for next question…</div>
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
      {!hasAnswered ? (
        <div className="play-answer-grid">
          {(payload.options || []).map((opt, i) => (
            <button key={i} className="play-answer-btn" style={{ background: COLORS[i] }} onClick={() => submitAnswer(i)}>
              <span className="play-ans-shape">{SHAPES[i]}</span>
              <span className="play-ans-text">{opt}</span>
            </button>
          ))}
        </div>
      ) : (
        <div className="play-locked">
          <div className="play-locked-icon" style={{ background: COLORS[myPlayer.answer] }}>{SHAPES[myPlayer.answer]}</div>
          <div className="play-locked-msg">Answer locked in!</div>
          <div className="play-locked-sub">Waiting for others…</div>
        </div>
      )}
    </div>
  )
}

// ── Root PlayRoom ─────────────────────────────────────────────
export default function PlayRoom({ roomCode }) {
  const [playerId] = useState(() => {
    const key = 'nook_pid_' + roomCode
    const existing = sessionStorage.getItem(key)
    if (existing) return existing
    const id = 'p' + (crypto.randomUUID?.() || Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2))
    sessionStorage.setItem(key, id)
    return id
  })

  const { room, players, payload, loading, addPlayer, updatePlayer } = useGameRoom(roomCode)

  const myPlayer = players.find(p => p.id === playerId)
  const game     = room?.game

  if (loading) return (
    <div className="play-splash"><div className="play-spinner" /></div>
  )

  if (!room) return (
    <div className="play-splash play-splash--error">
      <div className="play-splash-icon"><IconAlertTriangle size={40} /></div>
      <div className="play-splash-msg">Room not found or expired.</div>
    </div>
  )

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
