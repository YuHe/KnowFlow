import React, { useRef, useState } from 'react'
import { uploadImage } from '@/api/upload'
import { kbApi } from '@/api/kb'
import { useKbStore } from '@/store/kbStore'
import KbIcon from './KbIcon'

interface KbIconEditorProps {
  kbId: string
  icon: string
  iconUrl?: string | null
  /** Size of the clickable area (Tailwind w-*/h-* classes) */
  sizeClass?: string
  emojiClass?: string
}

/**
 * KB avatar editor: click to upload a new image or clear back to emoji.
 * Only shows the edit overlay; callers are responsible for gating on role.
 */
const KbIconEditor: React.FC<KbIconEditorProps> = ({
  kbId,
  icon,
  iconUrl,
  sizeClass = 'w-20 h-20',
  emojiClass = 'text-5xl',
}) => {
  const inputRef = useRef<HTMLInputElement>(null)
  const [loading, setLoading] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const { updateKb } = useKbStore()

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setLoading(true)
    setMenuOpen(false)
    try {
      const url = await uploadImage(kbId, file)
      const updated = await kbApi.updateKb(kbId, { icon_url: url })
      updateKb(kbId, { icon_url: updated.icon_url })
    } finally {
      setLoading(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  const handleClear = async () => {
    setMenuOpen(false)
    setLoading(true)
    try {
      // Send empty string to signal clear; backend stores null
      const updated = await kbApi.updateKb(kbId, { icon_url: '' })
      updateKb(kbId, { icon_url: updated.icon_url })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="relative inline-block">
      {/* Avatar */}
      <button
        type="button"
        onClick={() => setMenuOpen((o) => !o)}
        className={`relative flex items-center justify-center rounded-full overflow-hidden ${sizeClass} group focus:outline-none`}
        disabled={loading}
      >
        <KbIcon icon={icon} iconUrl={iconUrl} className={sizeClass} emojiClass={emojiClass} />
        {/* Overlay on hover */}
        <span className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity rounded-full pointer-events-none">
          {loading ? (
            <svg className="w-5 h-5 text-white animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          ) : (
            <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          )}
        </span>
      </button>

      {/* Dropdown menu */}
      {menuOpen && (
        <>
          {/* Backdrop */}
          <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
          <div className="absolute left-1/2 -translate-x-1/2 mt-2 z-20 bg-background border rounded-xl shadow-lg py-1 min-w-[130px] text-sm">
            <button
              type="button"
              onClick={() => { setMenuOpen(false); inputRef.current?.click() }}
              className="w-full flex items-center gap-2 px-4 py-2 hover:bg-muted/60 transition text-left"
            >
              <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              上传图片
            </button>
            {iconUrl && (
              <button
                type="button"
                onClick={handleClear}
                className="w-full flex items-center gap-2 px-4 py-2 hover:bg-muted/60 transition text-left text-destructive"
              >
                <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
                恢复默认
              </button>
            )}
          </div>
        </>
      )}

      {/* Hidden file input */}
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/gif,image/webp"
        className="hidden"
        onChange={handleUpload}
      />
    </div>
  )
}

export default KbIconEditor
