import { useState, useEffect, useRef } from 'react'
import { doc, onSnapshot, setDoc } from 'firebase/firestore'
import { ref, uploadBytesResumable, getDownloadURL, deleteObject } from 'firebase/storage'
import { db, storage } from '../firebase'

const GAL_REF = doc(db, 'skylight', 'gallery')

export function useGallery() {
  const [photos, setPhotos]     = useState([])
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState(0)
  const photosRef = useRef([])

  useEffect(() => {
    return onSnapshot(GAL_REF, snap => {
      const list = snap.data()?.photos || []
      photosRef.current = list
      setPhotos(list)
    }, err => { console.error(err); setPhotos([]) })
  }, [])

  const upload = (files) => {
    const fileArray = Array.from(files)
    if (!fileArray.length) return

    const uploadOne = (file, done) => {
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
      const id       = `${Date.now()}_${safeName}`
      const storageRef = ref(storage, `gallery/${id}`)
      const task = uploadBytesResumable(storageRef, file)

      task.on('state_changed',
        snap => setProgress(Math.round(snap.bytesTransferred / snap.totalBytes * 100)),
        err  => { console.error('Upload error:', err); done(null) },
        async () => {
          const url = await getDownloadURL(task.snapshot.ref)
          done({ id, url, label: '', uploadedAt: Date.now() })
        }
      )
    }

    setUploading(true)
    setProgress(0)

    let remaining = fileArray.length
    fileArray.forEach(file => {
      uploadOne(file, async (photo) => {
        remaining--
        if (photo) {
          const updated = [...photosRef.current, photo]
          photosRef.current = updated
          await setDoc(GAL_REF, { photos: updated })
        }
        if (remaining === 0) {
          setUploading(false)
          setProgress(0)
        }
      })
    })
  }

  const remove = async (photo) => {
    const updated = photosRef.current.filter(p => p.id !== photo.id)
    photosRef.current = updated
    await setDoc(GAL_REF, { photos: updated })
    try {
      await deleteObject(ref(storage, `gallery/${photo.id}`))
    } catch (_) { /* already deleted or not found */ }
  }

  const reorder = async (from, to) => {
    const arr  = [...photosRef.current]
    const [item] = arr.splice(from, 1)
    arr.splice(to, 0, item)
    photosRef.current = arr
    setPhotos(arr)
    await setDoc(GAL_REF, { photos: arr })
  }

  return { photos, upload, remove, reorder, uploading, progress }
}
