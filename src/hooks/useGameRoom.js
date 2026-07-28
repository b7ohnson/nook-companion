import { useState, useEffect } from 'react'
import { doc, onSnapshot, setDoc, updateDoc, deleteDoc, arrayUnion, serverTimestamp } from 'firebase/firestore'
import { ROOM_TTL_MS, ROOM_EXPIRY_WARNING_MS } from 'nook-core/constants'
import { gameRoom } from 'nook-core/paths'
import { db } from '../firebase'


export function generateRoomCode() {
  return Math.random().toString(36).slice(2, 8).toUpperCase()
}

export function useGameRoom(roomCode) {
  const [room, setRoom]       = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!roomCode) { setLoading(false); return }
    const ref = doc(db, ...gameRoom(roomCode))
    const unsub = onSnapshot(ref, snap => {
      if (snap.exists()) {
        const data = { id: snap.id, ...snap.data() }
        const created = data.createdAt?.toMillis?.() || 0
        setRoom(created && Date.now() - created > ROOM_TTL_MS ? null : data)
      } else {
        setRoom(null)
      }
      setLoading(false)
    }, () => setLoading(false))
    return unsub
  }, [roomCode])

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

  const addPlayer = async (player) => {
    if (!roomCode) return
    await updateDoc(doc(db, ...gameRoom(roomCode)), { players: arrayUnion(player) })
  }

  const updatePlayer = async (playerId, updates) => {
    if (!roomCode || !room) return
    const players = (room.players || []).map(p => p.id === playerId ? { ...p, ...updates } : p)
    await updateDoc(doc(db, ...gameRoom(roomCode)), { players })
  }

  const removeRoom = async () => {
    if (!roomCode) return
    await deleteDoc(doc(db, ...gameRoom(roomCode)))
  }

  const createdMs = room?.createdAt?.toMillis?.() || 0
  const expiringWarning = createdMs > 0 && Date.now() - createdMs > ROOM_TTL_MS - ROOM_EXPIRY_WARNING_MS

  return {
    room,
    players: room?.players || [],
    payload: room?.payload || {},
    loading,
    expiringWarning,
    createRoom,
    updateState,
    updatePayload,
    addPlayer,
    updatePlayer,
    removeRoom,
  }
}
