import React, { useEffect, useRef, useState } from 'react'
import type { Editor } from '@tiptap/react'
import {
  Undo2, Redo2, Heading, Bold, Italic, Underline, Strikethrough, Superscript, Subscript,
  Highlighter, Baseline, Code, SquareCode, RemoveFormatting,
  AlignLeft, AlignCenter, AlignRight,
  List, ListOrdered, ListTodo, TextQuote, Minus, ListCollapse,
  Link as LinkIcon, Image as ImageIcon, Video, Table as TableIcon,
  Rows3, Columns3, Grid2x2, Trash2, ChevronDown, ChevronUp, ChevronLeft, ChevronRight,
  ArrowUpToLine, ArrowDownToLine, ArrowLeftToLine, ArrowRightToLine,
  TableColumnsSplit, StretchHorizontal, PanelTop, PanelLeft, MoveVertical,
  AlignVerticalJustifyStart, AlignVerticalJustifyCenter, AlignVerticalJustifyEnd,
  FileCode, ZoomIn, ZoomOut,
} from 'lucide-react'
import Tooltip from '@/components/ui/Tooltip'
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

/**
 * An icon button.
 *
 * `label` is both the hover text and the accessible name. There is deliberately
 * no `title`: the browser would then show its own slow tooltip on top of ours.
 */
const ToolbarButton: React.FC<{
  onClick: () => void
  label: string
  shortcut?: string
  active?: boolean
  disabled?: boolean
  danger?: boolean
  children: React.ReactNode
}> = ({ onClick, label, shortcut, active, disabled, danger, children }) => (
  <Tooltip label={label} shortcut={shortcut}>
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      aria-pressed={active}
      className={`flex h-7 w-7 items-center justify-center rounded transition disabled:opacity-40 ${
        active
          ? 'bg-indigo-100 text-indigo-700'
          : danger
            ? 'text-red-500 hover:bg-red-50'
            : 'text-gray-600 hover:bg-gray-100'
      }`}
    >
      {children}
    </button>
  </Tooltip>
)

/** Icon size used by every control here, so the row reads as one set. */
const ICON = 'w-[17px] h-[17px]'

const Divider = () => <div className="mx-1 h-5 w-px bg-gray-200" />

/**
 * A dropdown, owning its own open state and dismissal.
 *
 * Previously each menu contributed a `useState`, a `useRef` and a clause to one
 * shared outside-click effect — eight of each by the end, and adding a ninth
 * meant editing four places. Each menu now closes itself on an outside mousedown
 * or Escape, which also means opening one closes any other: its trigger is
 * outside theirs.
 */
const ToolbarMenu: React.FC<{
  label: string
  /** Text in the trigger; omitted for icon-only triggers. */
  text?: string
  icon?: React.ReactNode
  width?: string
  active?: boolean
  children: (close: () => void) => React.ReactNode
}> = ({ label, text, icon, width = 'w-44', active, children }) => {
  const ref = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (!open) return
    const onDown = (event: MouseEvent) => {
      if (!ref.current?.contains(event.target as Node)) setOpen(false)
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div className="relative" ref={ref}>
      <Tooltip label={label}>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-label={label}
          aria-expanded={open}
          className={`flex h-7 items-center gap-1 rounded text-xs transition ${text ? 'px-1.5' : 'w-7 justify-center'} ${
            open || active ? 'bg-indigo-100 text-indigo-700' : 'text-gray-600 hover:bg-gray-100'
          }`}
        >
          {icon}
          {text && <span>{text}</span>}
          <ChevronDown className="h-3 w-3 text-gray-400" />
        </button>
      </Tooltip>
      {open && (
        <div
          role="menu"
          className={`absolute left-0 top-full z-50 mt-1 rounded-lg border border-gray-200 bg-white py-1 shadow-lg ${width}`}
        >
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  )
}

/** A row in a dropdown: icon, then the words for what it does. */
const MenuItem: React.FC<{
  icon?: React.ReactNode
  label: string
  onClick: () => void
  disabled?: boolean
  danger?: boolean
}> = ({ icon, label, onClick, disabled, danger }) => (
  <button
    type="button"
    role="menuitem"
    disabled={disabled}
    onClick={onClick}
    className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs transition ${
      disabled
        ? 'cursor-not-allowed text-gray-300'
        : danger
          ? 'text-red-600 hover:bg-red-50'
          : 'text-gray-700 hover:bg-gray-50'
    }`}
  >
    <span className="flex h-4 w-4 shrink-0 items-center justify-center text-gray-400">{icon}</span>
    {label}
  </button>
)

const MenuSection: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div className="border-t border-gray-100 pt-1.5 mt-1">
    <p className="px-3 pb-1 text-[11px] text-gray-400">{label}</p>
    {children}
  </div>
)

const MenuDivider = () => <div className="my-1 border-t border-gray-100" />

/** A colour swatch grid, shared by text colour, highlight and cell fill. */
const Swatches: React.FC<{
  colors: { label: string; value: string }[]
  onPick: (value: string) => void
}> = ({ colors, onPick }) => (
  <div className="grid grid-cols-5 gap-1 px-3 pb-1">
    {colors.map((color) => (
      <Tooltip key={color.value} label={color.label}>
        <button
          type="button"
          aria-label={color.label}
          onClick={() => onPick(color.value)}
          className="flex h-6 w-6 items-center justify-center rounded border border-gray-200 transition hover:scale-110"
          style={{ backgroundColor: color.value || '#ffffff' }}
        >
          {!color.value && <span className="text-[10px] text-gray-400">✕</span>}
        </button>
      </Tooltip>
    ))}
  </div>
)

const ZOOM_LEVELS = [50, 75, 90, 100, 110, 125, 150, 175, 200]

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
  0: '14px', 1: '28px', 2: '22px', 3: '18px', 4: '16px', 5: '14px', 6: '13px',
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

// Deliberately paler than HIGHLIGHT_COLORS: a highlight sits behind a few words,
// a cell fill sits behind a whole block, so it has to stay readable. 飞书 and
// Notion both ship a fixed palette rather than a colour picker.
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

// Row-height presets. Dragging a row's bottom border does the same thing
// continuously; this is the keyboard-reachable path and the way to apply one
// height to several rows at once (select cells across them first).
const ROW_HEIGHT_OPTIONS: { label: string; value: number | null }[] = [
  { label: '自适应', value: null },
  { label: '紧凑 28px', value: 28 },
  { label: '标准 36px', value: 36 },
  { label: '宽松 48px', value: 48 },
  { label: '很宽松 64px', value: 64 },
  { label: '超宽 96px', value: 96 },
]

export default function EditorToolbar({
  editor, zoom = 100, onZoomChange, sourceMode = false, onSourceModeChange, onFileUpload,
}: EditorToolbarProps) {
  // Without this, every isActive/can() below is whatever it was at the last
  // page-level render.
  useEditorRevision(editor)

  const [linkUrl, setLinkUrl] = useState('')
  const [imageUrl, setImageUrl] = useState('')
  const [embedUrl, setEmbedUrl] = useState('')
  const [embedError, setEmbedError] = useState('')
  const [isUploading, setIsUploading] = useState(false)
  const imageFileInputRef = useRef<HTMLInputElement>(null)

  if (!editor) return null

  const currentColor = editor.getAttributes('textStyle').color || ''
  const currentHighlight = editor.getAttributes('highlight').color || ''
  const currentFontSize: string = editor.getAttributes('textStyle').fontSize || ''

  const currentHeadingLevel = (() => {
    for (let i = 1; i <= 6; i++) if (editor.isActive('heading', { level: i })) return i
    return 0
  })()
  const currentHeadingLabel =
    HEADING_OPTIONS.find((h) => h.level === currentHeadingLevel)?.label || '正文'

  const uploadPickedImage = async (file: File) => {
    if (!onFileUpload || !file.type.startsWith('image/')) return
    setIsUploading(true)
    try {
      const url = await onFileUpload(file)
      if (url) editor.chain().focus().setImage({ src: url, alt: file.name }).run()
    } finally {
      setIsUploading(false)
    }
  }

  /**
   * Insert an embed, or say why not.
   *
   * `setEmbed` returns false for a host that is not on the allow-list, and that
   * is the only feedback the command gives — without surfacing it, an unsupported
   * link would look like a dead button.
   */
  const insertEmbed = (close: () => void) => (event: React.FormEvent) => {
    event.preventDefault()
    if (!embedUrl.trim()) return
    if (!editor.chain().focus().setEmbed(embedUrl.trim()).run()) {
      setEmbedError('暂不支持这个链接，目前可嵌入 B 站、YouTube、腾讯视频、Vimeo')
      return
    }
    setEmbedUrl('')
    setEmbedError('')
    close()
  }

  const inTable = editor.isActive('table')

  return (
    <div className="sticky top-0 z-10 flex flex-wrap items-center gap-0.5 border-b border-gray-200 bg-white px-3 py-1.5 shadow-sm">
      <ToolbarButton
        onClick={() => editor.chain().focus().undo().run()}
        disabled={!editor.can().undo()}
        label="撤销"
        shortcut="Ctrl+Z"
      >
        <Undo2 className={ICON} />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().redo().run()}
        disabled={!editor.can().redo()}
        label="重做"
        shortcut="Ctrl+Y"
      >
        <Redo2 className={ICON} />
      </ToolbarButton>

      <Divider />

      {/* Paragraph style */}
      <ToolbarMenu
        label="段落样式"
        text={currentHeadingLabel}
        icon={<Heading className="h-3.5 w-3.5" />}
        width="w-32"
        active={currentHeadingLevel > 0}
      >
        {(close) => (
          <>
            {HEADING_OPTIONS.map((h) => (
              <button
                key={h.level}
                type="button"
                role="menuitem"
                onClick={() => {
                  if (h.level === 0) editor.chain().focus().setParagraph().run()
                  else editor.chain().focus().toggleHeading({ level: h.level as 1 | 2 | 3 | 4 | 5 | 6 }).run()
                  close()
                }}
                className={`flex w-full items-baseline px-3 py-1.5 text-left transition hover:bg-gray-50 ${
                  currentHeadingLevel === h.level ? 'font-semibold text-indigo-600' : 'text-gray-700'
                }`}
                style={{ fontSize: HEADING_FONT_SIZES[h.level] }}
              >
                {h.label}
              </button>
            ))}
          </>
        )}
      </ToolbarMenu>
      {/* Font size */}
      <ToolbarMenu
        label="字号"
        text={currentFontSize ? currentFontSize.replace('px', '') : '默认'}
        width="w-24"
        active={Boolean(currentFontSize)}
      >
        {(close) => (
          <>
            <button
              type="button"
              role="menuitem"
              onClick={() => { editor.chain().focus().unsetFontSize().run(); close() }}
              className={`w-full px-3 py-1.5 text-left text-xs transition hover:bg-gray-50 ${
                currentFontSize ? 'text-gray-700' : 'font-semibold text-indigo-600'
              }`}
            >
              默认
            </button>
            {FONT_SIZES.map((size) => (
              <button
                key={size}
                type="button"
                role="menuitem"
                onClick={() => { editor.chain().focus().setFontSize(size).run(); close() }}
                className={`w-full px-3 py-1.5 text-left transition hover:bg-gray-50 ${
                  currentFontSize === size ? 'font-semibold text-indigo-600' : 'text-gray-700'
                }`}
                style={{ fontSize: size }}
              >
                {size.replace('px', '')}
              </button>
            ))}
          </>
        )}
      </ToolbarMenu>

      <Divider />

      <ToolbarButton onClick={() => editor.chain().focus().toggleBold().run()} active={editor.isActive('bold')} label="加粗" shortcut="Ctrl+B">
        <Bold className={ICON} />
      </ToolbarButton>
      <ToolbarButton onClick={() => editor.chain().focus().toggleItalic().run()} active={editor.isActive('italic')} label="斜体" shortcut="Ctrl+I">
        <Italic className={ICON} />
      </ToolbarButton>
      <ToolbarButton onClick={() => editor.chain().focus().toggleUnderline().run()} active={editor.isActive('underline')} label="下划线" shortcut="Ctrl+U">
        <Underline className={ICON} />
      </ToolbarButton>
      <ToolbarButton onClick={() => editor.chain().focus().toggleStrike().run()} active={editor.isActive('strike')} label="删除线">
        <Strikethrough className={ICON} />
      </ToolbarButton>
      <ToolbarButton onClick={() => editor.chain().focus().toggleSuperscript().run()} active={editor.isActive('superscript')} label="上标" shortcut="Ctrl+.">
        <Superscript className={ICON} />
      </ToolbarButton>
      <ToolbarButton onClick={() => editor.chain().focus().toggleSubscript().run()} active={editor.isActive('subscript')} label="下标" shortcut="Ctrl+,">
        <Subscript className={ICON} />
      </ToolbarButton>
      {/* Text colour and highlight. The icon carries a swatch of the colour in
          force, which is the only way to tell at a glance what the button will
          apply — Google Docs and 飞书 both do this. */}
      <ToolbarMenu
        label="文字颜色"
        width="w-52"
        active={Boolean(currentColor)}
        icon={
          <span className="flex flex-col items-center">
            <Baseline className="h-3.5 w-3.5" />
            <span className="mt-[1px] h-[3px] w-4 rounded-sm" style={{ backgroundColor: currentColor || '#374151' }} />
          </span>
        }
      >
        {(close) => (
          <>
            <p className="px-3 pb-1 text-[11px] text-gray-400">文字颜色</p>
            <Swatches
              colors={TEXT_COLORS}
              onPick={(value) => {
                if (value) editor.chain().focus().setColor(value).run()
                else editor.chain().focus().unsetColor().run()
                close()
              }}
            />
          </>
        )}
      </ToolbarMenu>

      <ToolbarMenu
        label="文字高亮"
        width="w-52"
        active={editor.isActive('highlight')}
        icon={
          <span className="flex flex-col items-center">
            <Highlighter className="h-3.5 w-3.5" />
            <span className="mt-[1px] h-[3px] w-4 rounded-sm" style={{ backgroundColor: currentHighlight || '#fef08a' }} />
          </span>
        }
      >
        {(close) => (
          <>
            <p className="px-3 pb-1 text-[11px] text-gray-400">背景高亮</p>
            <Swatches
              colors={HIGHLIGHT_COLORS}
              onPick={(value) => {
                if (value) editor.chain().focus().setHighlight({ color: value }).run()
                else editor.chain().focus().unsetHighlight().run()
                close()
              }}
            />
          </>
        )}
      </ToolbarMenu>

      <ToolbarButton
        onClick={() => editor.chain().focus().unsetAllMarks().run()}
        label="清除文字格式"
      >
        <RemoveFormatting className={ICON} />
      </ToolbarButton>
      <Divider />

      <ToolbarButton onClick={() => editor.chain().focus().setTextAlign('left').run()} active={editor.isActive({ textAlign: 'left' })} label="左对齐">
        <AlignLeft className={ICON} />
      </ToolbarButton>
      <ToolbarButton onClick={() => editor.chain().focus().setTextAlign('center').run()} active={editor.isActive({ textAlign: 'center' })} label="居中对齐">
        <AlignCenter className={ICON} />
      </ToolbarButton>
      <ToolbarButton onClick={() => editor.chain().focus().setTextAlign('right').run()} active={editor.isActive({ textAlign: 'right' })} label="右对齐">
        <AlignRight className={ICON} />
      </ToolbarButton>

      <Divider />

      <ToolbarButton onClick={() => editor.chain().focus().toggleBulletList().run()} active={editor.isActive('bulletList')} label="无序列表">
        <List className={ICON} />
      </ToolbarButton>
      <ToolbarButton onClick={() => editor.chain().focus().toggleOrderedList().run()} active={editor.isActive('orderedList')} label="有序列表">
        <ListOrdered className={ICON} />
      </ToolbarButton>
      <ToolbarButton onClick={() => editor.chain().focus().toggleTaskList().run()} active={editor.isActive('taskList')} label="任务列表">
        <ListTodo className={ICON} />
      </ToolbarButton>

      <Divider />

      <ToolbarButton onClick={() => editor.chain().focus().toggleBlockquote().run()} active={editor.isActive('blockquote')} label="引用">
        <TextQuote className={ICON} />
      </ToolbarButton>
      <ToolbarButton onClick={() => editor.chain().focus().toggleCode().run()} active={editor.isActive('code')} label="行内代码">
        <Code className={ICON} />
      </ToolbarButton>
      <ToolbarButton onClick={() => editor.chain().focus().toggleCodeBlock().run()} active={editor.isActive('codeBlock')} label="代码块">
        <SquareCode className={ICON} />
      </ToolbarButton>
      <ToolbarButton onClick={() => editor.chain().focus().setDetails().run()} active={editor.isActive('details')} label="折叠块">
        <ListCollapse className={ICON} />
      </ToolbarButton>
      <ToolbarButton onClick={() => editor.chain().focus().setHorizontalRule().run()} label="分隔线">
        <Minus className={ICON} />
      </ToolbarButton>
      <Divider />

      {/* Link */}
      <ToolbarMenu label="链接" width="w-60" active={editor.isActive('link')} icon={<LinkIcon className={ICON} />}>
        {(close) => (
          <div className="px-2 py-1">
            <form
              onSubmit={(event) => {
                event.preventDefault()
                if (linkUrl) editor.chain().focus().setLink({ href: linkUrl }).run()
                else editor.chain().focus().unsetLink().run()
                setLinkUrl('')
                close()
              }}
              className="flex items-center gap-1"
            >
              <input
                type="url"
                value={linkUrl}
                onChange={(e) => setLinkUrl(e.target.value)}
                placeholder="https://..."
                autoFocus
                aria-label="链接地址"
                className="min-w-0 flex-1 rounded border border-gray-300 px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
              <button type="submit" className="rounded bg-indigo-600 px-2 py-1.5 text-xs text-white transition hover:bg-indigo-700">
                确认
              </button>
            </form>
            {editor.isActive('link') && (
              <button
                type="button"
                onClick={() => { editor.chain().focus().unsetLink().run(); close() }}
                className="mt-1 w-full py-0.5 text-xs text-red-500 transition hover:text-red-700"
              >
                移除链接
              </button>
            )}
          </div>
        )}
      </ToolbarMenu>
      {/* Image: upload or URL */}
      <ToolbarMenu
        label={isUploading ? '正在上传图片' : '插入图片'}
        width="w-64"
        icon={
          isUploading ? (
            <svg className={`${ICON} animate-spin`} fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          ) : (
            <ImageIcon className={ICON} />
          )
        }
      >
        {(close) => (
          <div className="px-2 py-1">
            {onFileUpload && (
              <>
                {/* The file is read before `close()`, which unmounts this input:
                    reaching through the event afterwards would be reading a
                    detached node. */}
                <input
                  ref={imageFileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(event) => {
                    const file = event.target.files?.[0]
                    event.target.value = ''
                    close()
                    if (file) void uploadPickedImage(file)
                  }}
                />
                <button
                  type="button"
                  onClick={() => imageFileInputRef.current?.click()}
                  className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-xs text-gray-700 transition hover:bg-gray-100"
                >
                  <ImageIcon className="h-4 w-4 text-gray-400" />
                  上传本地图片
                </button>
                <div className="my-1 border-t border-gray-100" />
              </>
            )}
            <form
              onSubmit={(event) => {
                event.preventDefault()
                if (imageUrl) editor.chain().focus().setImage({ src: imageUrl }).run()
                setImageUrl('')
                close()
              }}
              className="flex items-center gap-1"
            >
              <input
                type="url"
                value={imageUrl}
                onChange={(e) => setImageUrl(e.target.value)}
                placeholder="粘贴图片 URL..."
                aria-label="图片地址"
                className="min-w-0 flex-1 rounded border border-gray-300 px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
              <button type="submit" className="rounded bg-indigo-600 px-2 py-1.5 text-xs text-white transition hover:bg-indigo-700">
                插入
              </button>
            </form>
          </div>
        )}
      </ToolbarMenu>
      {/* Video embed. The URL is host-checked; a rejected one says so rather than
          inserting an empty frame. */}
      <ToolbarMenu label="嵌入视频" width="w-72" icon={<Video className={ICON} />}>
        {(close) => (
          <div className="px-2 py-1">
            <form onSubmit={insertEmbed(close)} className="flex items-center gap-1">
              <input
                type="url"
                value={embedUrl}
                onChange={(e) => { setEmbedUrl(e.target.value); setEmbedError('') }}
                placeholder="B 站 / YouTube / 腾讯视频 / Vimeo 链接"
                autoFocus
                aria-label="视频链接"
                className="min-w-0 flex-1 rounded border border-gray-300 px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
              <button type="submit" className="rounded bg-indigo-600 px-2 py-1.5 text-xs text-white transition hover:bg-indigo-700">
                嵌入
              </button>
            </form>
            {embedError && <p className="mt-1 text-xs text-red-600">{embedError}</p>}
          </div>
        )}
      </ToolbarMenu>

      <ToolbarButton
        onClick={() => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}
        label="插入表格"
      >
        <TableIcon className={ICON} />
      </ToolbarButton>
      {/* Table controls.
          Previously fifteen flat controls, six of which were bare Chinese words
          ("+列前", "表头列", "均分", "删表") and three of which were the box-drawing
          glyphs ⌜ ⌷ ⌞ — unreadable as icons and cramped enough to wrap the
          toolbar onto a second line. Google Docs and 飞书 both put table editing
          behind a small number of menus instead, because these operations need
          words, not pictograms. Three menus, one icon button, everything labelled.
          The same operations remain on the right-click menu. */}
      {inTable && (
        <>
          <Divider />

          <ToolbarMenu label="行操作" text="行" icon={<Rows3 className="h-3.5 w-3.5" />} width="w-40">
            {(close) => (
              <>
                <MenuItem icon={<ArrowUpToLine className="h-3.5 w-3.5" />} label="上方插入行" onClick={() => { editor.chain().focus().addRowBefore().run(); close() }} />
                <MenuItem icon={<ArrowDownToLine className="h-3.5 w-3.5" />} label="下方插入行" onClick={() => { editor.chain().focus().addRowAfter().run(); close() }} />
                <MenuDivider />
                <MenuItem icon={<ChevronUp className="h-3.5 w-3.5" />} label="上移一行" disabled={!editor.can().moveRowUp()} onClick={() => { editor.chain().focus().moveRowUp().run(); close() }} />
                <MenuItem icon={<ChevronDown className="h-3.5 w-3.5" />} label="下移一行" disabled={!editor.can().moveRowDown()} onClick={() => { editor.chain().focus().moveRowDown().run(); close() }} />
                <MenuSection label="行高（也可拖拽行下边框）">
                  {ROW_HEIGHT_OPTIONS.map((option) => (
                    <MenuItem
                      key={option.label}
                      icon={<MoveVertical className="h-3.5 w-3.5" />}
                      label={option.label}
                      onClick={() => { editor.chain().focus().setTableRowHeight(option.value).run(); close() }}
                    />
                  ))}
                </MenuSection>
                <MenuDivider />
                <MenuItem icon={<Trash2 className="h-3.5 w-3.5" />} label="删除当前行" danger onClick={() => { editor.chain().focus().deleteRow().run(); close() }} />
              </>
            )}
          </ToolbarMenu>

          <ToolbarMenu label="列操作" text="列" icon={<Columns3 className="h-3.5 w-3.5" />} width="w-40">
            {(close) => (
              <>
                <MenuItem icon={<ArrowLeftToLine className="h-3.5 w-3.5" />} label="左侧插入列" onClick={() => { editor.chain().focus().addColumnBefore().run(); close() }} />
                <MenuItem icon={<ArrowRightToLine className="h-3.5 w-3.5" />} label="右侧插入列" onClick={() => { editor.chain().focus().addColumnAfter().run(); close() }} />
                <MenuDivider />
                <MenuItem icon={<ChevronLeft className="h-3.5 w-3.5" />} label="左移一列" disabled={!editor.can().moveColumnLeft()} onClick={() => { editor.chain().focus().moveColumnLeft().run(); close() }} />
                <MenuItem icon={<ChevronRight className="h-3.5 w-3.5" />} label="右移一列" disabled={!editor.can().moveColumnRight()} onClick={() => { editor.chain().focus().moveColumnRight().run(); close() }} />
                <MenuDivider />
                <MenuItem icon={<StretchHorizontal className="h-3.5 w-3.5" />} label="均分列宽" onClick={() => { editor.chain().focus().distributeTableColumns().run(); close() }} />
                <MenuDivider />
                <MenuItem icon={<Trash2 className="h-3.5 w-3.5" />} label="删除当前列" danger onClick={() => { editor.chain().focus().deleteColumn().run(); close() }} />
              </>
            )}
          </ToolbarMenu>
          <ToolbarMenu label="单元格" text="单元格" icon={<Grid2x2 className="h-3.5 w-3.5" />} width="w-48">
            {(close) => (
              <>
                <MenuItem
                  icon={<TableColumnsSplit className="h-3.5 w-3.5" />}
                  label="合并 / 拆分单元格"
                  disabled={!editor.can().mergeOrSplit()}
                  onClick={() => { editor.chain().focus().mergeOrSplit().run(); close() }}
                />
                <MenuDivider />
                <MenuItem icon={<PanelTop className="h-3.5 w-3.5" />} label="切换表头行" onClick={() => { editor.chain().focus().toggleHeaderRow().run(); close() }} />
                <MenuItem icon={<PanelLeft className="h-3.5 w-3.5" />} label="切换表头列" onClick={() => { editor.chain().focus().toggleHeaderColumn().run(); close() }} />
                <MenuSection label="垂直对齐">
                  <MenuItem icon={<AlignVerticalJustifyStart className="h-3.5 w-3.5" />} label="顶端对齐" onClick={() => { editor.chain().focus().setCellAttribute('verticalAlign', 'top').run(); close() }} />
                  <MenuItem icon={<AlignVerticalJustifyCenter className="h-3.5 w-3.5" />} label="垂直居中" onClick={() => { editor.chain().focus().setCellAttribute('verticalAlign', 'middle').run(); close() }} />
                  <MenuItem icon={<AlignVerticalJustifyEnd className="h-3.5 w-3.5" />} label="底端对齐" onClick={() => { editor.chain().focus().setCellAttribute('verticalAlign', 'bottom').run(); close() }} />
                </MenuSection>
                <MenuSection label="填充色">
                  <Swatches
                    colors={CELL_FILL_COLORS}
                    onPick={(value) => {
                      editor.chain().focus().setCellAttribute('backgroundColor', value || null).run()
                      close()
                    }}
                  />
                </MenuSection>
              </>
            )}
          </ToolbarMenu>

          <ToolbarButton onClick={() => editor.chain().focus().deleteTable().run()} label="删除表格" danger>
            <Trash2 className={ICON} />
          </ToolbarButton>
        </>
      )}
      {onSourceModeChange && (
        <>
          <Divider />
          <Tooltip label={sourceMode ? '切换回富文本' : '查看 / 编辑源码'}>
            <button
              type="button"
              onClick={() => onSourceModeChange(!sourceMode)}
              aria-label={sourceMode ? '切换回富文本' : '查看 / 编辑源码'}
              aria-pressed={sourceMode}
              className={`flex h-7 items-center gap-1 rounded px-2 text-xs transition ${
                sourceMode ? 'bg-indigo-100 text-indigo-700' : 'text-gray-500 hover:bg-gray-100'
              }`}
            >
              <FileCode className="h-3.5 w-3.5" />
              源码
            </button>
          </Tooltip>
        </>
      )}

      <div className="flex-1" />

      {onZoomChange && (
        <div className="ml-2 flex items-center gap-1">
          <Tooltip label="缩小" placement="bottom">
            <button
              type="button"
              onClick={() => onZoomChange(Math.max(50, ZOOM_LEVELS[ZOOM_LEVELS.indexOf(zoom) - 1] ?? 50))}
              aria-label="缩小"
              className="rounded p-1 text-gray-500 transition hover:bg-gray-100"
            >
              <ZoomOut className="h-3.5 w-3.5" />
            </button>
          </Tooltip>
          <span className="w-10 text-center text-xs text-gray-500">{zoom}%</span>
          <Tooltip label="放大" placement="bottom">
            <button
              type="button"
              onClick={() => onZoomChange(Math.min(200, ZOOM_LEVELS[ZOOM_LEVELS.indexOf(zoom) + 1] ?? 200))}
              aria-label="放大"
              className="rounded p-1 text-gray-500 transition hover:bg-gray-100"
            >
              <ZoomIn className="h-3.5 w-3.5" />
            </button>
          </Tooltip>
        </div>
      )}
    </div>
  )
}





