import React, { useState, useRef, useEffect } from 'react'
import type { Editor } from '@tiptap/react'
import { ZoomIn, ZoomOut } from 'lucide-react'

interface EditorToolbarProps {
  editor: Editor
  zoom?: number
  onZoomChange?: (zoom: number) => void
  sourceMode?: boolean
  onSourceModeChange?: (v: boolean) => void
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

export default function EditorToolbar({ editor, zoom = 100, onZoomChange, sourceMode = false, onSourceModeChange }: EditorToolbarProps) {
  const [showLinkInput, setShowLinkInput] = useState(false)
  const [linkUrl, setLinkUrl] = useState('')
  const [showColorPicker, setShowColorPicker] = useState(false)
  const [showHighlightPicker, setShowHighlightPicker] = useState(false)
  const [showHeading, setShowHeading] = useState(false)
  const colorPickerRef = useRef<HTMLDivElement>(null)
  const highlightPickerRef = useRef<HTMLDivElement>(null)
  const headingRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!showColorPicker && !showHighlightPicker && !showHeading) return
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
    }
    document.addEventListener('mousedown', handle)
    return () => document.removeEventListener('mousedown', handle)
  }, [showColorPicker, showHighlightPicker, showHeading])

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

  const handleInsertImage = () => {
    const url = prompt('输入图片 URL:')
    if (url) editor.chain().focus().setImage({ src: url }).run()
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

      {/* Image */}
      <ToolbarButton onClick={handleInsertImage} title="插入图片">
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
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
            onClick={() => editor.chain().focus().addColumnAfter().run()}
            title="右侧插入列"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 3H5a2 2 0 00-2 2v14a2 2 0 002 2h4m6-18h4a2 2 0 012 2v14a2 2 0 01-2 2h-4M9 3v18M15 3v18" />
            </svg>
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
