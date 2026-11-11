import { useEffect, useRef, useState } from 'react'
import { useGallery } from '../hooks/useGallery'
import { IconUploadCloud, IconTrash2, IconImage, IconX } from './Icons'

export default function GalleryPanel({ onClose }) {
  const { photos, upload, remove, uploading, progress, lastUpload, clearLastUpload } = useGallery()
  const [confirmDelete, setConfirmDelete] = useState(null)
  const fileRef = useRef(null)
  const confirmTimerRef = useRef(null)

  useEffect(() => () => clearTimeout(confirmTimerRef.current), [])

  const handleFiles = (e) => {
    if (e.target.files?.length) {
      upload(e.target.files)
      e.target.value = ''
    }
  }

  const handleDelete = async (photo) => {
    clearTimeout(confirmTimerRef.current)
    if (confirmDelete?.id === photo.id) {
      setConfirmDelete(null)
      await remove(photo)
    } else {
      setConfirmDelete(photo)
      confirmTimerRef.current = setTimeout(() => setConfirmDelete(null), 4000)
    }
  }

  return (
    <div className="gallery-panel-backdrop" onClick={onClose}>
      <div className="gallery-panel" onClick={e => e.stopPropagation()}>
        <div className="gallery-panel-header">
          <span className="gallery-panel-title">Photo Gallery</span>
          <button className="gallery-panel-close" onClick={onClose} aria-label="Close gallery"><IconX size={20} /></button>
        </div>

        <p className="gallery-panel-sub">
          Photos uploaded here appear as the screensaver on the display.
        </p>

        {uploading && (
          <div className="gallery-upload-progress">
            <div className="gallery-upload-bar" style={{ width: `${progress}%` }} />
            <span className="gallery-upload-pct">{progress}%</span>
          </div>
        )}

        {lastUpload?.failed > 0 && !uploading && (
          <div className="gallery-upload-result" role="alert">
            <div className="gallery-upload-result-head">
              <span>
                {lastUpload.uploaded} of {lastUpload.total} uploaded, {lastUpload.failed} failed
              </span>
              <button className="gallery-upload-result-close" onClick={clearLastUpload} aria-label="Dismiss upload errors"><IconX size={16} /></button>
            </div>
            <ul className="gallery-upload-result-list">
              {lastUpload.failures.map((f, i) => (
                <li key={i}>{f.name}: {f.reason}</li>
              ))}
            </ul>
          </div>
        )}

        {photos.length === 0 && !uploading ? (
          <div className="gallery-empty">
            <IconImage size={40} />
            <p>No photos yet</p>
            <p className="gallery-empty-sub">Tap the button below to add your first photo</p>
          </div>
        ) : (
          <div className="gallery-grid">
            {photos.map(photo => (
              <div key={photo.id} className="gallery-thumb-wrap">
                <img
                  className="gallery-thumb"
                  src={photo.url}
                  alt={photo.label || 'Gallery photo'}
                  loading="lazy"
                />
                {photo.label && <div className="gallery-thumb-name">{photo.label}</div>}
                <button
                  className={`gallery-thumb-del ${confirmDelete?.id === photo.id ? 'gallery-thumb-del--confirm' : ''}`}
                  onClick={() => handleDelete(photo)}
                  aria-label={confirmDelete?.id === photo.id
                    ? `Tap again to remove ${photo.label || 'this photo'}`
                    : `Remove ${photo.label || 'photo'}`}
                  title={confirmDelete?.id === photo.id ? 'Tap again to confirm' : 'Remove photo'}
                >
                  {confirmDelete?.id === photo.id ? '!' : <IconTrash2 size={13} />}
                </button>
              </div>
            ))}
          </div>
        )}

        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          multiple
          className="gallery-file-input"
          onChange={handleFiles}
        />

        <button
          className="gallery-upload-btn"
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
        >
          <IconUploadCloud size={18} />
          {uploading ? `Uploading… ${progress}%` : 'Add Photos'}
        </button>
      </div>
    </div>
  )
}
