import { useState, useEffect, useRef } from 'react'
import { doc, onSnapshot, setDoc, arrayUnion, runTransaction } from 'firebase/firestore'
import { ref, uploadBytesResumable, getDownloadURL, deleteObject } from 'firebase/storage'
import { GALLERY } from 'nook-core/paths'
import { db, storage } from '../firebase'
import { notifyFailure } from './useToasts'
import { useSyncStatus } from './useSyncStatus'

const GAL_REF      = doc(db, ...GALLERY)
const MAX_EDGE     = 2000
const JPEG_QUALITY = 0.85

// Decode with the browser, honouring EXIF rotation. A file the browser cannot
// decode (HEIC on Chrome, a renamed PDF) rejects here, which is the point:
// the display runs in a browser too and could not show it either.
async function decode(file) {
  if ('createImageBitmap' in window) {
    try {
      return await createImageBitmap(file, { imageOrientation: 'from-image' })
    } catch { /* fall through to <img>, which older Safari handles better */ }
  }
  const url = URL.createObjectURL(file)
  try {
    const img = new Image()
    img.src = url
    await img.decode()
    return img
  } finally {
    URL.revokeObjectURL(url)
  }
}

async function toJpeg(file) {
  let source
  try {
    source = await decode(file)
  } catch {
    throw new Error('This photo format is not supported')
  }
  const srcW  = source.naturalWidth || source.width
  const srcH  = source.naturalHeight || source.height
  const scale = Math.min(1, MAX_EDGE / Math.max(srcW, srcH))
  const canvas = document.createElement('canvas')
  canvas.width  = Math.max(1, Math.round(srcW * scale))
  canvas.height = Math.max(1, Math.round(srcH * scale))
  const ctx = canvas.getContext('2d')
  // JPEG has no alpha; without this a transparent PNG comes out black.
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height)
  source.close?.()
  const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY))
  if (!blob) throw new Error('Could not process this photo')
  return blob
}

export function useGallery() {
  const [photos, setPhotos]         = useState([])
  const [uploading, setUploading]   = useState(false)
  const [progress, setProgress]     = useState(0)
  const [lastUpload, setLastUpload] = useState(null)
  const [error, setError]           = useState(null)
  const photosRef = useRef([])
  const { status, track, during } = useSyncStatus()

  useEffect(() => {
    return onSnapshot(GAL_REF, { includeMetadataChanges: true }, snap => {
      track(snap)
      const list = snap.data()?.photos || []
      photosRef.current = list
      setPhotos(list)
      setError(null)
    }, err => { console.error(err); setError(err.message) })
  }, [track])

  /**
   * Resolves { total, uploaded, failed, failures: [{ name, reason }] }.
   * Never rejects, and `uploading` is always cleared.
   */
  const upload = async (files) => {
    const fileArray = Array.from(files || [])
    if (!fileArray.length) return null

    setUploading(true)
    setProgress(0)
    setLastUpload(null)

    const fractions = fileArray.map(() => 0)
    const report = (i, f) => {
      fractions[i] = f
      setProgress(Math.round(fractions.reduce((a, b) => a + b, 0) / fractions.length * 100))
    }

    const uploadOne = async (file, i) => {
      try {
        if (!navigator.onLine) throw new Error('No connection')
        const blob       = await toJpeg(file)
        const id         = crypto.randomUUID()
        const storageRef = ref(storage, `gallery/${id}`)
        await new Promise((resolve, reject) => {
          const task = uploadBytesResumable(storageRef, blob, { contentType: 'image/jpeg' })
          // Hold the last 5% back for the document write.
          task.on('state_changed',
            snap => report(i, snap.totalBytes ? snap.bytesTransferred / snap.totalBytes * 0.95 : 0),
            reject, resolve)
        })
        try {
          const url = await getDownloadURL(storageRef)
          // merge + arrayUnion appends without reading the array, and creates
          // the document on a fresh project where updateDoc would fail.
          await setDoc(GAL_REF, {
            photos: arrayUnion({ id, url, label: '', uploadedAt: Date.now() }),
          }, { merge: true })
        } catch (err) {
          // Nothing points at the object now; don't leave it orphaned.
          await deleteObject(storageRef).catch(() => {})
          throw err
        }
      } finally {
        report(i, 1)
      }
    }

    // Two at a time: decoding a dozen 12 MP photos at once can get a phone
    // tab killed. Still one promise per file, so one failure stops nothing.
    const lanes = [Promise.resolve(), Promise.resolve()]
    const jobs = fileArray.map((file, i) => {
      const run  = () => uploadOne(file, i)
      const lane = i % lanes.length
      return (lanes[lane] = lanes[lane].then(run, run))
    })

    try {
      const settled  = await Promise.allSettled(jobs)
      const failures = settled
        .map((r, i) => (r.status === 'rejected'
          ? { name: fileArray[i].name, reason: r.reason?.message || 'Upload failed' }
          : null))
        .filter(Boolean)
      failures.forEach(f => console.error('Gallery upload failed:', f.name, f.reason))
      const result = {
        total: fileArray.length,
        uploaded: fileArray.length - failures.length,
        failed: failures.length,
        failures,
      }
      setLastUpload(result)
      return result
    } finally {
      setUploading(false)
      setProgress(0)
    }
  }

  const clearLastUpload = () => setLastUpload(null)

  const mutate = (change, failMsg) => {
    setPhotos(prev => change(prev))
    return during(runTransaction(db, async txn => {
      const snap = await txn.get(GAL_REF)
      txn.set(GAL_REF, { photos: change(snap.data()?.photos || []) }, { merge: true })
    })).then(() => true, err => {
      setPhotos(photosRef.current)
      return notifyFailure(failMsg, err)
    })
  }

  const remove = async (photo) => {
    const ok = await mutate(list => list.filter(p => p.id !== photo.id), 'Could not remove the photo.')
    if (ok) {
      try {
        await deleteObject(ref(storage, `gallery/${photo.id}`))
      } catch { /* already deleted or not found */ }
    }
    return ok
  }

  const reorder = (from, to) => {
    const moved = photosRef.current[from]
    if (!moved) return Promise.resolve(false)
    // Move by id: the indexes came from this phone's copy of the list, which
    // may no longer line up with the server's.
    return mutate(list => {
      const idx = list.findIndex(p => p.id === moved.id)
      if (idx === -1) return list
      const arr = [...list]
      const [item] = arr.splice(idx, 1)
      arr.splice(Math.min(to, arr.length), 0, item)
      return arr
    }, 'Could not reorder photos.')
  }

  return { photos, upload, remove, reorder, uploading, progress, lastUpload, clearLastUpload, status, error }
}
