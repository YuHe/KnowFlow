import React, { useState, useRef, useEffect } from 'react'
import type { Editor } from '@tiptap/react'
import { ZoomIn, ZoomOut } from 'lucide-react'
import { FONT_SIZES } from './FontSize'

interface EditorToolbarProps {
  editor: Editor
  zoom?: number
  onZoomChange?: (zoom: number) => void
  sourceMode?: boolean
  onSourceModeChange?: (v: boolean) => void
  onFileUpload?: (file: File) => Promise<string | null>
}

/**
 * Re-render this toolbar when the editor's state changes.
 *
 * Everything conditional here — `editor.isActive(...)` for the active
 * highlights, `editor.can()` for disabled states, and the whole table control
 * cluster which is gated on `isActive('table')` — is evaluated during render.
 * But the toolbar is rendered by the *page*, not by the component that owns
 * `useEditor`, so nothing re-rendered it when the selection moved: the page only
 * re-renders when the document changes, via its word-count state.
 *
 * The visible consequence was that clicking into a table did not reveal the
 * table controls (including delete-table) — you had to type a character first —
 * and every active-state highlight lagged behind the cursor.
 *
 * Coalesced through rAF so a burst of transactions costs one render, not one per
 * transaction. `transaction` covers content edits; `selectionUpdate` is the one
 * that was missing.
 */
function useEditorRevision(editor: Editor | null): void {
  const [, setRevision] = useState(0)

  useEffect(() => {
    if (!editor) return

    let frame = 0
    const bump = () => {
      if (frame) return
      frame = requestAnimationFrame(() => {
        frame = 0
        setRevision((n) => n + 1)
      })
    }

    editor.on('transaction', bump)
    editor.on('selectionUpdate', bump)
    editor.on('focus', bump)
    editor.on('blur', bump)

    return () => {
      if (frame) cancelAnimationFrame(frame)
      editor.off('transaction', bump)
      editor.off('selectionUpdate', bump)
      editor.off('focus', bump)
      editor.off('blur', bump)
    }
  }, [editor])
}

const ToolbarButton: React.FC<{
  onClick: () => void
  active?: boolean
  title?: string
  disabled?: boolean
  children: React.ReactNode
}> = ({ onClick, active, title, disabled, children }) => (
  <button
    type="button"
    onClick={onClick}
    disabled={disabled}
    title={title}
    className={`w-7 h-7 flex items-center justify-center rounded text-sm transition ${
      active ? 'bg-indigo-100 text-indigo-700' : 'text-gray-600 hover:bg-gray-100'
    } disabled:opacity-40`}
  >
    {children}
  </button>
)

const Divider = () => <div className="w-px h-5 bg-gray-200 mx-1" />

const ZOOM_LEVELS = [50, 75, 90, 100, 110, 125, 150, 175, 200]

// Heading levels + body text — combined dropdown replacing individual H1/H2/H3 buttons
const HEADING_OPTIONS = [
  { label: '正文', level: 0 },
  { label: '标题 1', level: 1 },
  { label: '标题 2', level: 2 },
  { label: '标题 3', level: 3 },
  { label: '标题 4', level: 4 },
  { label: '标题 5', level: 5 },
  { label: '标题 6', level: 6 },
]

const HEADING_FONT_SIZES: Record<number, string> = {
  0: '14px',
  1: '28px',
  2: '22px',
  3: '18px',
  4: '16px',
  5: '14px',
  6: '13px',
}

const TEXT_COLORS = [
  { label: '默认', value: '' },
  { label: '红色', value: '#ef4444' },
  { label: '橙色', value: '#f97316' },
  { label: '黄色', value: '#eab308' },
  { label: '绿色', value: '#22c55e' },
  { label: '青色', value: '#06b6d4' },
  { label: '蓝色', value: '#3b82f6' },
  { label: '紫色', value: '#a855f7' },
  { label: '粉色', value: '#ec4899' },
  { label: '灰色', value: '#6b7280' },
  { label: '深灰', value: '#374151' },
  { label: '棕色', value: '#92400e' },
]

const HIGHLIGHT_COLORS = [
  { label: '无', value: '' },
  { label: '黄色', value: '#fef08a' },
  { label: '绿色', value: '#bbf7d0' },
  { label: '蓝色', value: '#bfdbfe' },
  { label: '粉色', value: '#fbcfe8' },
  { label: '紫色', value: '#e9d5ff' },
  { label: '橙色', value: '#fed7aa' },
  { label: '红色', value: '#fecaca' },
  { label: '青色', value: '#a5f3fc' },
]

// Cell fill palette. Deliberately paler than HIGHLIGHT_COLORS: a highlight sits
// behind a few words, a cell fill sits behind a whole block, so it has to stay
// readable. 飞书 and Notion both ship a fixed palette rather than a colour picker.
const CELL_FILL_COLORS = [
  { label: '无填充', value: '' },
  { label: '灰', value: '#f3f4f6' },
  { label: '红', value: '#fee2e2' },
  { label: '橙', value: '#ffedd5' },
  { label: '黄', value: '#fef9c3' },
  { label: '绿', value: '#dcfce7' },
  { label: '青', value: '#cffafe' },
  { label: '蓝', value: '#dbeafe' },
  { label: '紫', value: '#f3e8ff' },
]

const VERTICAL_ALIGN_OPTIONS: { label: string; value: 'top' | 'middle' | 'bottom' }[] = [
  { label: '顶端对齐', value: 'top' },
  { label: '垂直居中', value: 'middle' },
  { label: '底端对齐', value: 'bottom' },
]

// Presets for the row-height menu. Dragging a row's bottom border does the same
// thing continuously; this is the keyboard-reachable path and the way to apply
// one height to several rows at once (select cells across them first).
const ROW_HEIGHT_OPTIONS: { label: string; value: number | null }[] = [
  { label: '自适应', value: null },
  { label: '紧凑 (28px)', value: 28 },
  { label: '标准 (36px)', value: 36 },
  { label: '宽松 (48px)', value: 48 },
  { label: '很宽松 (64px)', value: 64 },
  { label: '超宽 (96px)', value: 96 },
]

export default function EditorToolbar({ editor, zoom = 100, onZoomChange, sourceMode = false, onSourceModeChange, onFileUpload }: EditorToolbarProps) {
  // Without this, every isActive/can() below is whatever it was at the last
  // page-level render.
  useEditorRevision(editor)
  const [showLinkInput, setShowLinkInput] = useState(false)
  const [linkUrl, setLinkUrl] = useState('')
  const [showColorPicker, setShowColorPicker] = useState(false)
  const [showHighlightPicker, setShowHighlightPicker] = useState(false)
  const [showHeading, setShowHeading] = useState(false)
  const [showImageMenu, setShowImageMenu] = useState(false)
  const [showRowHeight, setShowRowHeight] = useState(false)
  const [showCellFill, setShowCellFill] = useState(false)
  const [showFontSize, setShowFontSize] = useState(false)
  const [showEmbed, setShowEmbed] = useState(false)
  const [embedUrl, setEmbedUrl] = useState('')
  const [embedError, setEmbedError] = useState('')
  const [imageUrl, setImageUrl] = useState('')
  const [isUploading, setIsUploading] = useState(false)
  const colorPickerRef = useRef<HTMLDivElement>(null)
  const highlightPickerRef = useRef<HTMLDivElement>(null)
  const headingRef = useRef<HTMLDivElement>(null)
  const imageMenuRef = useRef<HTMLDivElement>(null)
  const rowHeightRef = useRef<HTMLDivElement>(null)
  const cellFillRef = useRef<HTMLDivElement>(null)
  const fontSizeRef = useRef<HTMLDivElement>(null)
  const embedRef = useRef<HTMLDivElement>(null)
  const imageFileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!showColorPicker && !showHighlightPicker && !showHeading && !showImageMenu && !showRowHeight && !showCellFill && !showFontSize && !showEmbed) return
    const handle = (e: MouseEvent) => {
      if (showColorPicker && colorPickerRef.current && !colorPickerRef.current.contains(e.target as Node)) {
        setShowColorPicker(false)
      }
      if (showHighlightPicker && highlightPickerRef.current && !highlightPickerRef.current.contains(e.target as Node)) {
        setShowHighlightPicker(false)
      }
      if (showHeading && headingRef.current && !headingRef.current.contains(e.target as Node)) {
        setShowHeading(false)
      }
      if (showImageMenu && imageMenuRef.current && !imageMenuRef.current.contains(e.target as Node)) {
        setShowImageMenu(false)
      }
      if (showRowHeight && rowHeightRef.current && !rowHeightRef.current.contains(e.target as Node)) {
        setShowRowHeight(false)
      }
      if (showCellFill && cellFillRef.current && !cellFillRef.current.contains(e.target as Node)) {
        setShowCellFill(false)
      }
      if (showFontSize && fontSizeRef.current && !fontSizeRef.current.contains(e.target as Node)) {
        setShowFontSize(false)
      }
      if (showEmbed && embedRef.current && !embedRef.current.contains(e.target as Node)) {
        setShowEmbed(false)
      }
    }
    document.addEventListener('mousedown', handle)
    return () => document.removeEventListener('mousedown', handle)
  }, [showColorPicker, showHighlightPicker, showHeading, showImageMenu, showRowHeight, showCellFill, showFontSize, showEmbed])

  if (!editor) return null

  const handleLinkSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (linkUrl) {
      editor.chain().focus().setLink({ href: linkUrl }).run()
    } else {
      editor.chain().focus().unsetLink().run()
    }
    setShowLinkInput(false)
    setLinkUrl('')
  }

  const handleInsertImageUrl = (e: React.FormEvent) => {
    e.preventDefault()
    if (imageUrl) {
      editor.chain().focus().setImage({ src: imageUrl }).run()
    }
    setImageUrl('')
    setShowImageMenu(false)
  }

  /**
   * Insert an embed, or say why not.
   *
   * `setEmbed` returns false for a host that is not on the allow-list, and that
   * is the only feedback the command gives — without surfacing it, an unsupported
   * link would look like a dead button.
   */
  const handleInsertEmbed = (e: React.FormEvent) => {
    e.preventDefault()
    if (!embedUrl.trim()) return
    if (!editor.chain().focus().setEmbed(embedUrl.trim()).run()) {
      setEmbedError('暂不支持这个链接，目前可嵌入 B 站、YouTube、腾讯视频、Vimeo')
      return
    }
    setEmbedUrl('')
    setEmbedError('')
    setShowEmbed(false)
  }

  const handleImageFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file || !onFileUpload) return
    if (!file.type.startsWith('image/')) return
    setShowImageMenu(false)
    setIsUploading(true)
    try {
      const url = await onFileUpload(file)
      if (url) {
        editor.chain().focus().setImage({ src: url, alt: file.name }).run()
      }
    } finally {
      setIsUploading(false)
    }
  }

  const handleInsertTable = () => {
    editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()
  }

  const currentColor = editor.getAttributes('textStyle').color || ''
  const currentHighlight = editor.getAttributes('highlight').color || ''

  // Determine current heading level
  const currentHeadingLevel = (() => {
    for (let i = 1; i <= 6; i++) {
      if (editor.isActive('heading', { level: i })) return i
    }
    return 0
  })()
  const currentHeadingLabel = HEADING_OPTIONS.find(h => h.level === currentHeadingLevel)?.label || '正文'

  // The size on the textStyle mark at the caret, or '' when it inherits.
  const currentFontSize: string = editor.getAttributes('textStyle').fontSize || ''

  return (
    <div className="border-b border-gray-200 sticky top-0 bg-white z-10 px-3 py-1.5 flex items-center gap-0.5 flex-wrap shadow-sm">
      {/* Undo */}
      <ToolbarButton
        onClick={() => editor.chain().focus().undo().run()}
        disabled={!editor.can().undo()}
        title="撤销 (Ctrl+Z)"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
        </svg>
      </ToolbarButton>

      {/* Redo */}
      <ToolbarButton
        onClick={() => editor.chain().focus().redo().run()}
        disabled={!editor.can().redo()}
        title="重做 (Ctrl+Y)"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 10H11a8 8 0 00-8 8v2M21 10l-6 6m6-6l-6-6" />
        </svg>
      </ToolbarButton>

      <Divider />

      {/* Heading / Body dropdown (replaces H1/H2/H3 buttons) */}
      <div className="relative" ref={headingRef}>
        <button
          type="button"
          onClick={() => setShowHeading(v => !v)}
          title="段落样式"
          className="h-7 px-1.5 flex items-center justify-between gap-1 rounded text-xs text-gray-600 hover:bg-gray-100 border border-gray-200 min-w-[60px]"
        >
          <span>{currentHeadingLabel}</span>
          <svg className="w-3 h-3 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
        {showHeading && (
          <div className="absolute top-full left-0 mt-0.5 bg-white border border-gray-200 rounded-lg shadow-lg z-50 w-32 py-1">
            {HEADING_OPTIONS.map(h => (
              <button
                key={h.level}
                type="button"
                onClick={() => {
                  if (h.level === 0) {
                    editor.chain().focus().setParagraph().run()
                  } else {
                    editor.chain().focus().toggleHeading({ level: h.level as 1|2|3|4|5|6 }).run()
                  }
                  setShowHeading(false)
                }}
                className={`w-full text-left px-3 py-1.5 hover:bg-gray-50 transition flex items-baseline gap-2 ${
                  currentHeadingLevel === h.level ? 'text-indigo-600 font-semibold' : 'text-gray-700'
                }`}
                style={{ fontSize: HEADING_FONT_SIZES[h.level] }}
              >
                {h.label}
              </button>
            ))}
          </div>
        )}
      </div>

      <Divider />

      {/* Font size. 飞书 and Google Docs both sit one next to the font controls;
          Notion has none. Stored as an inline style on the textStyle mark, the
          same way text colour already is. */}
      <div className="relative" ref={fontSizeRef}>
        <button
          type="button"
          onClick={() => setShowFontSize(v => !v)}
          title="字号"
          className="h-7 px-1.5 flex items-center justify-between gap-1 rounded text-xs text-gray-600 hover:bg-gray-100 border border-gray-200 min-w-[52px]"
        >
          <span>{currentFontSize ? currentFontSize.replace('px', '') : '默认'}</span>
          <svg className="w-3 h-3 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
        {showFontSize && (
          <div className="absolute top-full left-0 mt-0.5 bg-white border border-gray-200 rounded-lg shadow-lg z-50 w-24 py-1 max-h-64 overflow-y-auto">
            <button
              type="button"
              onClick={() => {
                editor.chain().focus().unsetFontSize().run()
                setShowFontSize(false)
              }}
              className={`w-full text-left px-3 py-1.5 text-xs hover:bg-gray-50 transition ${
                currentFontSize ? 'text-gray-700' : 'text-indigo-600 font-semibold'
              }`}
            >
              默认
            </button>
            {FONT_SIZES.map(size => (
              <button
                key={size}
                type="button"
                onClick={() => {
                  editor.chain().focus().setFontSize(size).run()
                  setShowFontSize(false)
                }}
                className={`w-full text-left px-3 py-1.5 hover:bg-gray-50 transition ${
                  currentFontSize === size ? 'text-indigo-600 font-semibold' : 'text-gray-700'
                }`}
                style={{ fontSize: size }}
              >
                {size.replace('px', '')}
              </button>
            ))}
          </div>
        )}
      </div>

      <Divider />

      {/* Bold */}
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleBold().run()}
        active={editor.isActive('bold')}
        title="加粗 (Ctrl+B)"
      >
        <span className="font-bold text-sm">B</span>
      </ToolbarButton>

      {/* Italic */}
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleItalic().run()}
        active={editor.isActive('italic')}
        title="斜体 (Ctrl+I)"
      >
        <span className="italic text-sm">I</span>
      </ToolbarButton>

      {/* Underline */}
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleUnderline().run()}
        active={editor.isActive('underline')}
        title="下划线 (Ctrl+U)"
      >
        <span className="underline text-sm">U</span>
      </ToolbarButton>

      {/* Strike */}
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleStrike().run()}
        active={editor.isActive('strike')}
        title="删除线"
      >
        <span className="line-through text-sm">S</span>
      </ToolbarButton>

      {/* Superscript / Subscript. The two exclude each other, so the active
          states are mutually exclusive by construction. */}
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleSuperscript().run()}
        active={editor.isActive('superscript')}
        title="上标 (Ctrl+.)"
      >
        <span className="text-sm">x²</span>
      </ToolbarButton>

      <ToolbarButton
        onClick={() => editor.chain().focus().toggleSubscript().run()}
        active={editor.isActive('subscript')}
        title="下标 (Ctrl+,)"
      >
        <span className="text-sm">x₂</span>
      </ToolbarButton>

      {/* Highlight — multi-color picker */}
      <div className="relative" ref={highlightPickerRef}>
        <button
          type="button"
          onClick={() => setShowHighlightPicker(v => !v)}
          title="文字高亮"
          className={`w-7 h-7 flex flex-col items-center justify-center rounded text-sm transition hover:bg-gray-100 ${
            editor.isActive('highlight') ? 'bg-indigo-100 text-indigo-700' : 'text-gray-600'
          }`}
        >
          <span className="font-bold text-sm leading-none" style={{ fontFamily: 'serif' }}>A</span>
          <span
            className="w-4 h-1 rounded-sm mt-0.5"
            style={{ backgroundColor: currentHighlight || '#fef08a' }}
          />
        </button>
        {showHighlightPicker && (
          <div className="absolute top-full left-0 mt-0.5 bg-white border border-gray-200 rounded-lg shadow-lg p-2 z-50 w-44">
            <p className="text-xs text-gray-400 mb-1.5 px-1">背景高亮</p>
            <div className="grid grid-cols-4 gap-1">
              {HIGHLIGHT_COLORS.map((c) => (
                <button
                  key={c.value}
                  type="button"
                  title={c.label}
                  onClick={() => {
                    if (c.value) {
                      editor.chain().focus().setHighlight({ color: c.value }).run()
                    } else {
                      editor.chain().focus().unsetHighlight().run()
                    }
                    setShowHighlightPicker(false)
                  }}
                  className="w-8 h-8 rounded border border-gray-200 hover:scale-110 transition-transform flex items-center justify-center"
                  style={{ backgroundColor: c.value || '#ffffff' }}
                >
                  {!c.value && <span className="text-xs text-gray-400">✕</span>}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Text Color — uses setColor which preserves bold/italic/underline marks */}
      <div className="relative" ref={colorPickerRef}>
        <button
          type="button"
          onClick={() => setShowColorPicker((v) => !v)}
          title="文字颜色"
          className="w-7 h-7 flex flex-col items-center justify-center rounded text-sm transition text-gray-600 hover:bg-gray-100"
        >
          <span className="font-bold text-sm leading-none">A</span>
          <span
            className="w-4 h-1 rounded-sm mt-0.5"
            style={{ backgroundColor: currentColor || '#374151' }}
          />
        </button>
        {showColorPicker && (
          <div className="absolute top-full left-0 mt-0.5 bg-white border border-gray-200 rounded-lg shadow-lg p-2 z-50 w-48">
            <p className="text-xs text-gray-400 mb-1.5 px-1">文字颜色</p>
            <div className="grid grid-cols-4 gap-1">
              {TEXT_COLORS.map((c) => (
                <button
                  key={c.value}
                  type="button"
                  title={c.label}
                  onClick={() => {
                    if (c.value) {
                      editor.chain().focus().setColor(c.value).run()
                    } else {
                      editor.chain().focus().unsetColor().run()
                    }
                    setShowColorPicker(false)
                  }}
                  className="w-8 h-8 rounded border border-gray-200 hover:scale-110 transition-transform flex items-center justify-center"
                  style={{ backgroundColor: c.value || '#ffffff' }}
                >
                  {!c.value && <span className="text-xs text-gray-400">✕</span>}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Inline Code */}
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleCode().run()}
        active={editor.isActive('code')}
        title="行内代码"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 9l-3 3 3 3m8-6l3 3-3 3" />
        </svg>
      </ToolbarButton>

      <Divider />

      {/* Text Align */}
      <ToolbarButton
        onClick={() => editor.chain().focus().setTextAlign('left').run()}
        active={editor.isActive({ textAlign: 'left' })}
        title="左对齐"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h10M4 14h16M4 18h10" />
        </svg>
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().setTextAlign('center').run()}
        active={editor.isActive({ textAlign: 'center' })}
        title="居中对齐"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M7 10h10M4 14h16M7 18h10" />
        </svg>
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().setTextAlign('right').run()}
        active={editor.isActive({ textAlign: 'right' })}
        title="右对齐"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M10 10h10M4 14h16M10 18h10" />
        </svg>
      </ToolbarButton>

      <Divider />

      {/* BulletList */}
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleBulletList().run()}
        active={editor.isActive('bulletList')}
        title="无序列表"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" />
        </svg>
      </ToolbarButton>

      {/* OrderedList */}
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
        active={editor.isActive('orderedList')}
        title="有序列表"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 8h10M7 12h10M7 16h10M3 8h.01M3 12h.01M3 16h.01" />
        </svg>
      </ToolbarButton>

      {/* TaskList */}
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleTaskList().run()}
        active={editor.isActive('taskList')}
        title="任务列表"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
        </svg>
      </ToolbarButton>

      <Divider />

      {/* Blockquote */}
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleBlockquote().run()}
        active={editor.isActive('blockquote')}
        title="引用"
      >
        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
          <path d="M6 17h3l2-4V7H5v6h3zm8 0h3l2-4V7h-6v6h3z" />
        </svg>
      </ToolbarButton>

      {/* CodeBlock */}
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleCodeBlock().run()}
        active={editor.isActive('codeBlock')}
        title="代码块"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
        </svg>
      </ToolbarButton>

      {/* HorizontalRule */}
      <ToolbarButton
        onClick={() => editor.chain().focus().setHorizontalRule().run()}
        title="分隔线"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14" />
        </svg>
      </ToolbarButton>

      <Divider />

      {/* Link */}
      <div className="relative">
        <ToolbarButton
          onClick={() => {
            setShowLinkInput((v) => !v)
            if (!showLinkInput) setLinkUrl(editor.getAttributes('link').href || '')
          }}
          active={editor.isActive('link')}
          title="链接"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
          </svg>
        </ToolbarButton>
        {showLinkInput && (
          <div className="absolute top-full left-0 mt-0.5 bg-white border border-gray-200 rounded-lg shadow-lg p-2 z-50 w-56">
            <form onSubmit={handleLinkSubmit} className="flex items-center gap-1">
              <input
                type="url"
                value={linkUrl}
                onChange={(e) => setLinkUrl(e.target.value)}
                placeholder="https://..."
                autoFocus
                className="flex-1 text-xs px-2 py-1.5 border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
              <button type="submit" className="px-2 py-1.5 bg-indigo-600 text-white text-xs rounded hover:bg-indigo-700 transition">
                确认
              </button>
            </form>
            {editor.isActive('link') && (
              <button
                onClick={() => { editor.chain().focus().unsetLink().run(); setShowLinkInput(false) }}
                className="mt-1 w-full text-xs text-red-500 hover:text-red-700 py-0.5"
              >
                移除链接
              </button>
            )}
          </div>
        )}
      </div>

      {/* Image — insert from URL or upload local file */}
      <div className="relative" ref={imageMenuRef}>
        <ToolbarButton
          onClick={() => setShowImageMenu((v) => !v)}
          disabled={isUploading}
          title="插入图片"
        >
          {isUploading ? (
            <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          ) : (
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          )}
        </ToolbarButton>
        {showImageMenu && (
          <div className="absolute top-full left-0 mt-0.5 bg-white border border-gray-200 rounded-lg shadow-lg p-2 z-50 w-64">
            {onFileUpload && (
              <>
                <input
                  ref={imageFileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleImageFileSelected}
                />
                <button
                  type="button"
                  onClick={() => imageFileInputRef.current?.click()}
                  className="w-full flex items-center gap-2 px-2 py-1.5 text-xs text-gray-700 hover:bg-gray-100 rounded transition"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                  </svg>
                  上传本地图片
                </button>
                <div className="my-1 border-t border-gray-100" />
              </>
            )}
            <form onSubmit={handleInsertImageUrl} className="flex items-center gap-1">
              <input
                type="url"
                value={imageUrl}
                onChange={(e) => setImageUrl(e.target.value)}
                placeholder="粘贴图片 URL..."
                autoFocus
                className="flex-1 text-xs px-2 py-1.5 border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
              <button type="submit" className="px-2 py-1.5 bg-indigo-600 text-white text-xs rounded hover:bg-indigo-700 transition">
                插入
              </button>
            </form>
          </div>
        )}
      </div>

      {/* Video embed. The URL is host-checked; a rejected one says so rather
          than inserting an empty frame. */}
      <div className="relative" ref={embedRef}>
        <ToolbarButton onClick={() => setShowEmbed((v) => !v)} title="嵌入视频">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
          </svg>
        </ToolbarButton>
        {showEmbed && (
          <div className="absolute top-full left-0 mt-0.5 bg-white border border-gray-200 rounded-lg shadow-lg p-2 z-50 w-72">
            <form onSubmit={handleInsertEmbed} className="flex items-center gap-1">
              <input
                type="url"
                value={embedUrl}
                onChange={(e) => { setEmbedUrl(e.target.value); setEmbedError('') }}
                placeholder="B 站 / YouTube / 腾讯视频 / Vimeo 链接"
                autoFocus
                className="flex-1 min-w-0 text-xs px-2 py-1.5 border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
              <button type="submit" className="px-2 py-1.5 bg-indigo-600 text-white text-xs rounded hover:bg-indigo-700 transition">
                嵌入
              </button>
            </form>
            {embedError && <p className="mt-1 text-xs text-red-600">{embedError}</p>}
          </div>
        )}
      </div>

      {/* Collapsible block — 飞书's 折叠块 */}
      <ToolbarButton
        onClick={() => editor.chain().focus().setDetails().run()}
        active={editor.isActive('details')}
        title="折叠块"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
      </ToolbarButton>

      {/* Table */}
      <ToolbarButton onClick={handleInsertTable} title="插入表格">
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M3 14h18M10 3v18M14 3v18" />
        </svg>
      </ToolbarButton>

      {/* Table operations (shown when inside table) */}
      {editor.isActive('table') && (
        <>
          <Divider />
          <ToolbarButton
            onClick={() => editor.chain().focus().addColumnBefore().run()}
            title="左侧插入列"
          >
            <span className="text-xs font-medium">+列前</span>
          </ToolbarButton>
          <ToolbarButton
            onClick={() => editor.chain().focus().addColumnAfter().run()}
            title="右侧插入列"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 3H5a2 2 0 00-2 2v14a2 2 0 002 2h4m6-18h4a2 2 0 012 2v14a2 2 0 01-2 2h-4M9 3v18M15 3v18" />
            </svg>
          </ToolbarButton>
          <ToolbarButton
            onClick={() => editor.chain().focus().addRowBefore().run()}
            title="上方插入行"
          >
            <span className="text-xs font-medium">+行上</span>
          </ToolbarButton>
          <ToolbarButton
            onClick={() => editor.chain().focus().addRowAfter().run()}
            title="下方插入行"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9h18M3 15h18M9 3v18M15 3v18" />
            </svg>
          </ToolbarButton>
          <ToolbarButton
            onClick={() => editor.chain().focus().deleteColumn().run()}
            title="删除当前列"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </ToolbarButton>
          <ToolbarButton
            onClick={() => editor.chain().focus().deleteRow().run()}
            title="删除当前行"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </ToolbarButton>
          <ToolbarButton
            onClick={() => editor.chain().focus().mergeOrSplit().run()}
            disabled={!editor.can().mergeOrSplit()}
            title="合并 / 拆分单元格（先拖选多个单元格）"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 5h16M4 19h16M9 9l3 3-3 3m6-6l-3 3 3 3" />
            </svg>
          </ToolbarButton>
          <ToolbarButton
            onClick={() => editor.chain().focus().toggleHeaderRow().run()}
            title="切换表头行"
          >
            <span className="text-xs font-medium">表头</span>
          </ToolbarButton>
          <ToolbarButton
            onClick={() => editor.chain().focus().toggleHeaderColumn().run()}
            title="切换表头列"
          >
            <span className="text-xs font-medium">表头列</span>
          </ToolbarButton>

          {/* Distribute columns evenly — 飞书's 均分列宽. Dragging one border
              inevitably leaves the rest lopsided, and until now a botched drag
              could only be undone. */}
          <ToolbarButton
            onClick={() => editor.chain().focus().distributeTableColumns().run()}
            title="均分列宽"
          >
            <span className="text-xs font-medium">均分</span>
          </ToolbarButton>

          {/* Cell fill colour — 飞书/Notion both have this; stock TipTap has no
              attribute for it, see TableCellAttributes. */}
          <div className="relative" ref={cellFillRef}>
            <button
              type="button"
              onClick={() => setShowCellFill((v) => !v)}
              title="单元格填充色"
              className={`h-7 px-1.5 flex items-center gap-1 rounded text-xs transition ${
                showCellFill ? 'bg-indigo-100 text-indigo-700' : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              <span className="w-3.5 h-3.5 rounded border border-gray-300" style={{ backgroundColor: '#dbeafe' }} />
              填充
            </button>
            {showCellFill && (
              <div className="absolute top-full left-0 mt-0.5 bg-white border border-gray-200 rounded-lg shadow-lg p-2 z-50 w-44">
                <p className="text-xs text-gray-400 mb-1.5 px-1">单元格填充</p>
                <div className="grid grid-cols-4 gap-1">
                  {CELL_FILL_COLORS.map((c) => (
                    <button
                      key={c.value}
                      type="button"
                      title={c.label}
                      onClick={() => {
                        editor
                          .chain()
                          .focus()
                          .setCellAttribute('backgroundColor', c.value || null)
                          .run()
                        setShowCellFill(false)
                      }}
                      className="w-8 h-8 rounded border border-gray-200 hover:scale-110 transition-transform flex items-center justify-center"
                      style={{ backgroundColor: c.value || '#ffffff' }}
                    >
                      {!c.value && <span className="text-xs text-gray-400">✕</span>}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Vertical alignment. Horizontal alignment is the existing TextAlign
              buttons acting on the cell's paragraph — one mechanism, not two. */}
          {VERTICAL_ALIGN_OPTIONS.map((option) => (
            <ToolbarButton
              key={option.value}
              onClick={() => editor.chain().focus().setCellAttribute('verticalAlign', option.value).run()}
              title={option.label}
            >
              <span className="text-xs leading-none">
                {option.value === 'top' ? '⌜' : option.value === 'middle' ? '⌷' : '⌞'}
              </span>
            </ToolbarButton>
          ))}

          {/* Row height — presets; the same value can also be set by dragging a
              row's bottom border in the editor. */}
          <div className="relative" ref={rowHeightRef}>
            <button
              type="button"
              onClick={() => setShowRowHeight((v) => !v)}
              title="行高（也可拖拽行的下边框调整）"
              className={`h-7 px-1.5 flex items-center gap-1 rounded text-xs transition ${
                showRowHeight ? 'bg-indigo-100 text-indigo-700' : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7l4-4 4 4M8 17l4 4 4-4M4 12h16" />
              </svg>
              行高
            </button>
            {showRowHeight && (
              <div className="absolute top-full left-0 mt-0.5 bg-white border border-gray-200 rounded-lg shadow-lg z-50 w-36 py-1">
                {ROW_HEIGHT_OPTIONS.map((option) => (
                  <button
                    key={option.label}
                    type="button"
                    onClick={() => {
                      editor.chain().focus().setTableRowHeight(option.value).run()
                      setShowRowHeight(false)
                    }}
                    className="w-full text-left px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50 transition"
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          <ToolbarButton
            onClick={() => editor.chain().focus().deleteTable().run()}
            title="删除表格"
          >
            <span className="text-xs text-red-500 font-medium">删表</span>
          </ToolbarButton>
        </>
      )}

      {/* Source / Preview toggle */}
      {onSourceModeChange && (
        <button
          type="button"
          onClick={() => onSourceModeChange(!sourceMode)}
          title={sourceMode ? '切换到富文本模式' : '查看/编辑源码'}
          className={`h-7 px-2 flex items-center gap-1 rounded text-xs transition ml-1 ${
            sourceMode ? 'bg-indigo-100 text-indigo-700' : 'text-gray-500 hover:bg-gray-100'
          }`}
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
          </svg>
          源码
        </button>
      )}
      <div className="flex-1" />

      {/* Zoom controls */}
      {onZoomChange && (
        <div className="flex items-center gap-1 ml-2">
          <button
            type="button"
            onClick={() => onZoomChange(Math.max(50, ZOOM_LEVELS[ZOOM_LEVELS.indexOf(zoom) - 1] ?? 50))}
            className="p-1 rounded hover:bg-gray-100 text-gray-500 transition"
            title="缩小"
          >
            <ZoomOut className="w-3.5 h-3.5" />
          </button>
          <span className="text-xs text-gray-500 w-10 text-center">{zoom}%</span>
          <button
            type="button"
            onClick={() => onZoomChange(Math.min(200, ZOOM_LEVELS[ZOOM_LEVELS.indexOf(zoom) + 1] ?? 200))}
            className="p-1 rounded hover:bg-gray-100 text-gray-500 transition"
            title="放大"
          >
            <ZoomIn className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </div>
  )
}
