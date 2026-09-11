import { Extension } from '@tiptap/core'
import type { Editor, Range } from '@tiptap/core'
import { ReactRenderer } from '@tiptap/react'
import Suggestion from '@tiptap/suggestion'
import type { EditorState } from '@tiptap/pm/state'
import { useState, useEffect, forwardRef, useImperativeHandle } from 'react'

/**
 * The `/` command menu.
 *
 * 飞书, Notion and 语雀 all have one, and this file has existed in the tree for a
 * while — unregistered, so typing `/` did nothing. What it needed was not much
 * code but three corrections:
 *
 * 1. **No tippy.** The original positioned the popup with `tippy.js`, which we do
 *    not depend on — it was only reachable because `@tiptap/react` pulls it in for
 *    the bubble/floating menus, and TipTap drops it in v3. The popup is now
 *    positioned by hand, the same way `TableContextMenu` already does it.
 * 2. **Chinese titles do not survive `toLowerCase`.** Filtering compared a
 *    lowercased query against 表格/代码块/…, so `/table` and `/h1` matched nothing.
 *    Each item now carries English and pinyin aliases.
 * 3. **`/` fires anywhere.** With `startOfLine: false` and no `allow` guard, the
 *    menu opened inside `and/or`, inside `https://…` and inside code blocks.
 *
 * Links and images that need a URL stay in the toolbar, which has proper inline
 * inputs — the original called `window.prompt`, which several browsers suppress.
 * The image entry here opens a file picker and reuses the editor's upload path.
 */

export interface SlashCommandItem {
  title: string
  description: string
  icon: string
  /** Latin aliases, so a query typed in English or pinyin still matches. */
  keywords: string[]
  command: (params: { editor: Editor; range: Range }) => void
}

export interface SlashCommandOptions {
  /**
   * Upload a picked file and hand back its URL. Supplied by the editor so the
   * slash menu goes through the same downscale-and-upload path as paste and drop.
   */
  uploadImage?: (file: File) => Promise<string | null>
}

/** Ask for a file without leaving the document; resolves null if cancelled. */
function pickImageFile(): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'image/*'
    // A cancelled picker fires nothing in some browsers, so the promise is
    // allowed to stay pending rather than leaking a fake resolve.
    input.onchange = () => resolve(input.files?.[0] ?? null)
    input.click()
  })
}

export function buildCommandItems(options: SlashCommandOptions = {}): SlashCommandItem[] {
  const items: SlashCommandItem[] = [
    {
      title: '标题 1',
      description: '一级标题',
      icon: 'H1',
      keywords: ['h1', 'heading1', 'biaoti'],
      command: ({ editor, range }) =>
        editor.chain().focus().deleteRange(range).setHeading({ level: 1 }).run(),
    },
    {
      title: '标题 2',
      description: '二级标题',
      icon: 'H2',
      keywords: ['h2', 'heading2', 'biaoti'],
      command: ({ editor, range }) =>
        editor.chain().focus().deleteRange(range).setHeading({ level: 2 }).run(),
    },
    {
      title: '标题 3',
      description: '三级标题',
      icon: 'H3',
      keywords: ['h3', 'heading3', 'biaoti'],
      command: ({ editor, range }) =>
        editor.chain().focus().deleteRange(range).setHeading({ level: 3 }).run(),
    },
    {
      title: '无序列表',
      description: '圆点列表',
      icon: '•',
      keywords: ['ul', 'list', 'bullet', 'liebiao'],
      command: ({ editor, range }) =>
        editor.chain().focus().deleteRange(range).toggleBulletList().run(),
    },
    {
      title: '有序列表',
      description: '编号列表',
      icon: '1.',
      keywords: ['ol', 'list', 'number', 'ordered', 'liebiao'],
      command: ({ editor, range }) =>
        editor.chain().focus().deleteRange(range).toggleOrderedList().run(),
    },
    {
      title: '任务列表',
      description: '可勾选的清单',
      icon: '☑',
      keywords: ['todo', 'task', 'check', 'renwu'],
      command: ({ editor, range }) =>
        editor.chain().focus().deleteRange(range).toggleTaskList().run(),
    },
    {
      title: '表格',
      description: '插入 3×3 表格',
      icon: '⊞',
      keywords: ['table', 'grid', 'biaoge'],
      command: ({ editor, range }) =>
        editor
          .chain()
          .focus()
          .deleteRange(range)
          .insertTable({ rows: 3, cols: 3, withHeaderRow: true })
          .run(),
    },
    {
      title: '代码块',
      description: '带语法高亮的代码块',
      icon: '</>',
      keywords: ['code', 'pre', 'daima'],
      command: ({ editor, range }) =>
        editor.chain().focus().deleteRange(range).toggleCodeBlock().run(),
    },
    {
      title: '折叠块',
      description: '可展开收起的内容',
      icon: '▸',
      keywords: ['toggle', 'details', 'collapse', 'fold', 'zhedie'],
      command: ({ editor, range }) =>
        editor.chain().focus().deleteRange(range).setDetails().run(),
    },
    {
      title: '引用',
      description: '引用块',
      icon: '❝',
      keywords: ['quote', 'blockquote', 'yinyong'],
      command: ({ editor, range }) =>
        editor.chain().focus().deleteRange(range).toggleBlockquote().run(),
    },
    {
      title: '分割线',
      description: '水平分割线',
      icon: '—',
      keywords: ['hr', 'divider', 'rule', 'fengexian'],
      command: ({ editor, range }) =>
        editor.chain().focus().deleteRange(range).setHorizontalRule().run(),
    },
  ]

  const upload = options.uploadImage
  if (upload) {
    items.push({
      title: '图片',
      description: '从本地上传',
      icon: '🖼',
      keywords: ['image', 'img', 'picture', 'tupian'],
      command: ({ editor, range }) => {
        // Drop the `/query` first: the picker is async and leaving the text in
        // place means the range is stale by the time the file arrives.
        editor.chain().focus().deleteRange(range).run()
        void pickImageFile().then(async (file) => {
          if (!file) return
          const url = await upload(file)
          if (url) editor.chain().focus().setImage({ src: url }).run()
        })
      },
    })
  }

  return items
}

/** Match on the Chinese title, the description, or a Latin alias. */
export function filterCommandItems(items: SlashCommandItem[], query: string): SlashCommandItem[] {
  const q = query.trim().toLowerCase()
  if (!q) return items
  return items.filter(
    (item) =>
      item.title.toLowerCase().includes(q) ||
      item.description.toLowerCase().includes(q) ||
      item.keywords.some((keyword) => keyword.includes(q)),
  )
}

/**
 * Only open at the start of a block or after whitespace, and never inside code.
 *
 * Without this the menu appeared while typing `and/or`, `24/7` and every URL, and
 * inside code blocks where none of the commands make sense.
 */
export function isSlashAllowed(state: EditorState, range: { from: number }): boolean {
  const $from = state.doc.resolve(range.from)
  if ($from.parent.type.spec.code) return false
  if (state.schema.marks.code && state.schema.marks.code.isInSet($from.marks())) return false
  if ($from.parentOffset === 0) return true
  const before = $from.parent.textBetween($from.parentOffset - 1, $from.parentOffset)
  return /\s/.test(before)
}

interface CommandListProps {
  items: SlashCommandItem[]
  command: (item: SlashCommandItem) => void
}

export interface CommandListRef {
  onKeyDown: (props: { event: KeyboardEvent }) => boolean
}

export const CommandList = forwardRef<CommandListRef, CommandListProps>((props, ref) => {
  const [selected, setSelected] = useState(0)

  useEffect(() => setSelected(0), [props.items])

  useImperativeHandle(ref, () => ({
    onKeyDown({ event }) {
      if (props.items.length === 0) return false
      if (event.key === 'ArrowUp') {
        setSelected((i) => (i - 1 + props.items.length) % props.items.length)
        return true
      }
      if (event.key === 'ArrowDown') {
        setSelected((i) => (i + 1) % props.items.length)
        return true
      }
      // Tab as well as Enter: 飞书 accepts both, and Tab would otherwise move
      // focus out of the editor while the menu is open.
      if (event.key === 'Enter' || event.key === 'Tab') {
        const item = props.items[selected]
        if (item) props.command(item)
        return true
      }
      return false
    },
  }))

  if (props.items.length === 0) {
    return (
      <div className="w-60 rounded-lg border border-gray-200 bg-white p-3 text-sm text-gray-400 shadow-xl">
        无匹配命令
      </div>
    )
  }

  return (
    <div
      role="menu"
      className="max-h-72 w-60 overflow-y-auto rounded-lg border border-gray-200 bg-white py-1 shadow-xl"
    >
      {props.items.map((item, index) => (
        <button
          key={item.title}
          type="button"
          role="menuitem"
          // mousedown, not click: the editor loses the selection on blur, and a
          // click fires after that.
          onMouseDown={(event) => {
            event.preventDefault()
            props.command(item)
          }}
          onMouseEnter={() => setSelected(index)}
          className={`flex w-full items-center gap-3 px-3 py-1.5 text-left text-sm transition ${
            index === selected ? 'bg-indigo-50 text-indigo-700' : 'text-gray-700'
          }`}
        >
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded bg-gray-100 font-mono text-xs">
            {item.icon}
          </span>
          <span className="min-w-0">
            <span className="block truncate text-xs font-medium">{item.title}</span>
            <span className="block truncate text-xs text-gray-400">{item.description}</span>
          </span>
        </button>
      ))}
    </div>
  )
})

CommandList.displayName = 'CommandList'

const POPUP_MARGIN = 8

/** Place the popup under the caret, flipping up or clamping at the edges. */
function positionPopup(element: HTMLElement, rect: DOMRect | null): void {
  if (!rect) return
  const box = element.getBoundingClientRect()
  const below = rect.bottom + POPUP_MARGIN
  const fitsBelow = below + box.height <= window.innerHeight
  const top = fitsBelow ? below : Math.max(POPUP_MARGIN, rect.top - POPUP_MARGIN - box.height)
  const left = Math.min(rect.left, Math.max(POPUP_MARGIN, window.innerWidth - box.width - POPUP_MARGIN))
  element.style.top = `${top}px`
  element.style.left = `${left}px`
}

interface SuggestionRenderProps {
  editor: Editor
  clientRect?: (() => DOMRect | null) | null
}

export const SlashCommand = Extension.create<SlashCommandOptions>({
  name: 'slashCommand',

  addOptions() {
    return {}
  },

  addProseMirrorPlugins() {
    const options = this.options

    return [
      Suggestion<SlashCommandItem>({
        editor: this.editor,
        char: '/',
        allowSpaces: false,
        startOfLine: false,
        allow: ({ state, range }) => isSlashAllowed(state, range),
        items: ({ query }) => filterCommandItems(buildCommandItems(options), query),
        command: ({ editor, range, props }) => props.command({ editor, range }),
        render: () => {
          let renderer: ReactRenderer<CommandListRef> | null = null
          let container: HTMLDivElement | null = null

          const place = (props: SuggestionRenderProps) =>
            container && positionPopup(container, props.clientRect?.() ?? null)

          return {
            onStart: (props) => {
              renderer = new ReactRenderer(CommandList, { props, editor: props.editor })
              container = document.createElement('div')
              // `fixed` matches the rects the suggestion plugin reports, which are
              // viewport-relative; z-40 keeps it under modals but over the toolbar.
              container.className = 'fixed z-40'
              container.appendChild(renderer.element)
              document.body.appendChild(container)
              place(props)
            },
            onUpdate: (props) => {
              renderer?.updateProps(props)
              place(props)
            },
            onKeyDown: (props) => {
              if (props.event.key === 'Escape') {
                container?.remove()
                container = null
                return true
              }
              return renderer?.ref?.onKeyDown(props) ?? false
            },
            onExit: () => {
              container?.remove()
              container = null
              renderer?.destroy()
              renderer = null
            },
          }
        },
      }),
    ]
  },
})

export default SlashCommand


