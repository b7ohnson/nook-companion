import { useRef, useState } from 'react'
import { useGallery } from '../hooks/useGallery'
import { IconUploadCloud, IconTrash2, IconImage } from './Icons'

export default function GalleryPanel({ onClose }) {
  const { photos, upload, remove, uploading, progress } = useGallery()
  const [confirmDelete, setConfirmDelete] = useState(null)
  const fileRef = useRef(null)

  const handleFiles = (e) => {
    if (e.target.files?.length) {
      upload(e.target.files)
      e.target.value = ''
    }
  }

  const handleDelete = async (photo) => {
    if (confirmDelete?.id === photo.id) {
      await remove(photo)
      setConfirmDelete(null)
    } else {
      setConfirmDelete(photo)
    }
  }

  return (
    <div className="gallery-panel-backdrop" onClick={onClose}>
      <div className="gallery-panel" onClick={e => e.stopPropagation()}>
        <div className="gallery-panel-header">
          <span className="gallery-panel-title">Photo Gallery</span>
          <button className="gallery-panel-close" onClick={onClose}>✕</button>
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
                  alt={photo.name}
                  loading="lazy"
                />
                {photo.name && <div className="gallery-thumb-name">{photo.name}</div>}
                <button
                  className={`gallery-thumb-del ${confirmDelete?.id === photo.id ? 'gallery-thumb-del--confirm' : ''}`}
                  onClick={() => handleDelete(photo)}
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
