import { useState, useEffect, useRef } from 'react'
import { useGameRoom } from '../hooks/useGameRoom'

const COLORS = ['#e21b3c', '#1368ce', '#d89e00', '#26890c']
const SHAPES  = ['▲', '●', '■', '★']

export default function PlayRoom({ roomCode }) {
  const [name, setName]     = useState('')
  const [joined, setJoined] = useState(false)
  const [playerId]          = useState(() => 'p' + Date.now().toString(36))
  const [timeLeft, setTimeLeft] = useState(20)
  const rafRef = useRef(null)

  const { room, players, payload, loading, addPlayer, updatePlayer } = useGameRoom(roomCode)

  const myPlayer    = players.find(p => p.id === playerId)
  const hasAnswered = myPlayer?.answer != null && myPlayer?.answer !== -1
  const phase       = payload.phase || 'lobby'

  // Timer driven from payload.questionStartedAt (cosmetic — host controls reveal)
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

  // ── Loading ──
  if (loading) return (
    <div className="play-splash"><div className="play-spinner" /></div>
  )

  // ── Room missing ──
  if (!room) return (
    <div className="play-splash play-splash--error">
      <div className="play-splash-icon">⚠️</div>
      <div className="play-splash-msg">Room not found or expired.</div>
    </div>
  )

  // ── Game over ──
  if (phase === 'done' || room.state === 'closed') {
    const sorted = [...players].sort((a, b) => (b.score || 0) - (a.score || 0))
    const myRank = sorted.findIndex(p => p.id === playerId) + 1
    return (
      <div className="play-splash play-splash--done">
        <div className="play-splash-icon">{myRank === 1 ? '🥇' : myRank === 2 ? '🥈' : myRank === 3 ? '🥉' : '🎉'}</div>
        <div className="play-splash-name">{name || myPlayer?.name}</div>
        <div className="play-splash-msg">#{myRank} — {(myPlayer?.score || 0).toLocaleString()} pts</div>
        <div className="play-splash-game-over">Game Over!</div>
      </div>
    )
  }

  // ── Join screen ──
  if (!joined) return (
    <div className="play-join">
      <div className="play-join-game">Trivia Showdown</div>
      <div className="play-join-code">Room {roomCode}</div>
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

  // ── Waiting for host ──
  if (room.state === 'waiting' || phase === 'lobby') return (
    <div className="play-splash play-splash--waiting">
      <div className="play-splash-icon">✓</div>
      <div className="play-splash-name">{name.trim()}</div>
      <div className="play-splash-msg">Ready! Waiting for host to start…</div>
      <div className="play-splash-players">{players.length} player{players.length !== 1 ? 's' : ''} joined</div>
    </div>
  )

  // ── Reveal screen ──
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
            ? '⏰ Time\'s up!'
            : wasCorrect ? '✅ Correct!' : '❌ Wrong!'}
        </div>
        {wasCorrect && pts > 0 && (
          <div className="play-pts-gained">+{pts.toLocaleString()}</div>
        )}
        {!wasCorrect && myAnswer !== -1 && myAnswer != null && payload.answer !== -1 && (
          <div className="play-correct-ans">
            <div className="play-correct-ans-label">Correct answer:</div>
            <div className="play-correct-ans-text" style={{ background: COLORS[payload.answer] }}>
              {SHAPES[payload.answer]} {(payload.options || [])[payload.answer]}
            </div>
          </div>
        )}
        <div className="play-total-score">{totalScore.toLocaleString()} pts total</div>
        {/* Mini leaderboard */}
        <div className="play-mini-lb">
          {[...players]
            .sort((a, b) => (b.score || 0) - (a.score || 0))
            .slice(0, 5)
            .map((p, i) => (
              <div key={p.id} className={`play-mini-lb-row ${p.id === playerId ? 'play-mini-lb-row--me' : ''}`}>
                <span className="play-mini-lb-rank">{i + 1}</span>
                <span className="play-mini-lb-name">{p.name}</span>
                <span className="play-mini-lb-pts">{(p.score || 0).toLocaleString()}</span>
              </div>
            ))}
        </div>
        <div className="play-waiting-next">Waiting for next question…</div>
      </div>
    )
  }

  // ── Question screen ──
  const timePct  = (timeLeft / (payload.timeLimit || 20)) * 100
  const timerClr = timeLeft > 10 ? '#22c55e' : timeLeft > 5 ? '#f59e0b' : '#ef4444'

  return (
    <div className="play-question-screen">
      {/* Timer */}
      <div className="play-timer-bar">
        <div className="play-timer-fill" style={{ width: `${timePct}%`, background: timerClr, transition: 'width 0.1s linear' }} />
      </div>
      <div className="play-timer-num" style={{ color: timerClr }}>{Math.ceil(timeLeft)}</div>

      {/* Question text */}
      <div className="play-q-text">{payload.questionText}</div>
      <div className="play-q-num">Q {(payload.questionIndex ?? 0) + 1}</div>

      {/* Answer buttons or locked state */}
      {!hasAnswered ? (
        <div className="play-answer-grid">
          {(payload.options || []).map((opt, i) => (
            <button
              key={i}
              className="play-answer-btn"
              style={{ background: COLORS[i] }}
              onClick={() => submitAnswer(i)}
            >
              <span className="play-ans-shape">{SHAPES[i]}</span>
              <span className="play-ans-text">{opt}</span>
            </button>
          ))}
        </div>
      ) : (
        <div className="play-locked">
          <div className="play-locked-icon" style={{ background: COLORS[myPlayer.answer] }}>
            {SHAPES[myPlayer.answer]}
          </div>
          <div className="play-locked-msg">Answer locked in!</div>
          <div className="play-locked-sub">Waiting for others…</div>
        </div>
      )}
    </div>
  )
}
