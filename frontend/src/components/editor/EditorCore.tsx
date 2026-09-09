import { useEffect, useRef, useState } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Highlight from '@tiptap/extension-highlight'
import Underline from '@tiptap/extension-underline'
import Link from '@tiptap/extension-link'
import { ResizableImage } from './ResizableImage'
import Table from '@tiptap/extension-table'
import { ResizableTableRow } from './TableRowHeight'
import TableHeader from '@tiptap/extension-table-header'
import TableCell from '@tiptap/extension-table-cell'
import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight'
import Placeholder from '@tiptap/extension-placeholder'
import TaskList from '@tiptap/extension-task-list'
import TaskItem from '@tiptap/extension-task-item'
import CharacterCount from '@tiptap/extension-character-count'
import TextStyle from '@tiptap/extension-text-style'
import Color from '@tiptap/extension-color'
import TextAlign from '@tiptap/extension-text-align'
import { Extension } from '@tiptap/core'
import { createLowlight, common } from 'lowlight'
import TurndownService from 'turndown'
import * as turndownPluginGfm from 'turndown-plugin-gfm'
import { uploadImage } from '../../api/upload'
import { markdownToHtml } from '../../utils/markdown'
import { localizeRemoteImages, type FailedImage } from '../../utils/remoteImages'
import { toast } from '@/components/ui/use-toast'
import { saveDraft, clearDraft } from '@/utils/crashReport'
import FailedImagesNotice from './FailedImagesNotice'

// Shared turndown instance for HTML → Markdown conversion
const turndown = new TurndownService({ headingStyle: 'atx', codeBlockStyle: 'fenced', bulletListMarker: '-' })
// GFM plugin handles tables and strikethrough (~~del~~).
turndown.use(turndownPluginGfm.gfm)
// Highlight (<mark>) → ==text== (parsed back by our marked highlight extension).
turndown.addRule('highlight', {
  filter: ['mark'],
  replacement: (content) => `==${content}==`,
})
// TipTap task lists render as <li data-type="taskItem" data-checked="..."> with
// no checkbox input, so the GFM plugin can't detect them — match explicitly.
turndown.addRule('taskItem', {
  filter: (node) => node.nodeName === 'LI' && (node as HTMLElement).getAttribute('data-type') === 'taskItem',
  replacement(content, node) {
    const checked = (node as HTMLElement).getAttribute('data-checked') === 'true'
    return `- [${checked ? 'x' : ' '}] ${content.trim()}\n`
  },
})
// A GFM pipe table can only express *inline* content in a cell, on a single
// line. Three kinds of table therefore cannot survive an HTML→MD→HTML round
// trip as a pipe table — and one round trip happens on every save (content_md
// is stored alongside content_html) and on every source-mode toggle:
//
//   1. merged cells      — the plugin silently drops every colspan/rowspan
//   2. explicit row heights — likewise dropped
//   3. block content in a cell (<p>, <img>, lists, nested tables…)
//
// (3) is the one that shatters the table outright rather than just losing an
// attribute: turndown-plugin-gfm's cell() does not collapse newlines, so a
// <p>-wrapped cell becomes `| \nA\n\n |` and marked renders the row as a pile
// of loose <p> — the table stops being a table. TipTap wraps every cell in <p>,
// so this applies to essentially all editor-authored tables; it was masked only
// because TipTap also emits a <colgroup>, which happens to defeat the plugin's
// isFirstTbody() heuristic and send the table down its own raw-HTML keep()
// path. Anything without a colgroup — notably the backend importer's
// Python-Markdown output, which emits <thead> and no colgroup — took the pipe
// path and shattered. Depending on that accident is what this rule replaces.
//
// Emit such tables as raw HTML instead; marked passes HTML through and our
// sanitizer keeps colspan/rowspan, the inline height style, and <img> in cells.
const MERGED_CELL_SELECTOR =
  'td[colspan]:not([colspan="1"]), td[rowspan]:not([rowspan="1"]), th[colspan]:not([colspan="1"]), th[rowspan]:not([rowspan="1"])'

// Block-level content inside a cell. `img` is included because TipTap's image
// node is block-level (group: 'block'), so it is a cell's direct child and has
// no inline pipe-table representation that keeps its width.
const CELL_BLOCK_CONTENT_SELECTOR = [
  'p', 'img', 'ul', 'ol', 'pre', 'blockquote', 'table', 'div',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
]
  .flatMap((tag) => [`td > ${tag}`, `th > ${tag}`])
  .join(', ')

function tableNeedsRawHtml(table: HTMLElement): boolean {
  if (table.querySelector(MERGED_CELL_SELECTOR)) return true
  if (table.querySelector(CELL_BLOCK_CONTENT_SELECTOR)) return true
  return Array.from(table.querySelectorAll('tr')).some(
    (row) => Boolean((row as HTMLElement).style?.height),
  )
}

turndown.addRule('tableNeedsRawHtml', {
  filter: (node) => node.nodeName === 'TABLE' && tableNeedsRawHtml(node as HTMLElement),
  replacement: (_content, node) => `\n\n${(node as HTMLElement).outerHTML}\n\n`,
})

// turndown's stock image rule emits only alt/src/title, so an image carrying a
// width (set by the resize handles) or any other sizing attribute would lose it
// on the first round trip. Keep such images as raw HTML — the same escape hatch
// the table rule above uses, for the same reason.
const SIZED_IMAGE_ATTRS = ['width', 'height', 'style', 'class']

turndown.addRule('sizedImage', {
  filter: (node) =>
    node.nodeName === 'IMG' &&
    SIZED_IMAGE_ATTRS.some((attr) => Boolean((node as HTMLElement).getAttribute(attr))),
  replacement: (_content, node) => (node as HTMLElement).outerHTML,
})

/** Convert HTML to Markdown */
export function htmlToMarkdown(html: string): string {
  return turndown.turndown(html)
}

/**
 * The Markdown source of a stored document.
 *
 * content_md is what an export would hand back, so it wins. Documents saved
 * before content_md was persisted — and any whose markdown column ended up
 * empty — fall back to converting the stored HTML.
 */
export function documentMarkdown(doc: {
  content_md?: string | null
  content_html?: string | null
}): string {
  const stored = (doc.content_md || '').trim()
  if (stored) return stored
  return htmlToMarkdown(doc.content_html || '').trim()
}

// Extend TextStyle to also support fontSize attribute
const FontSize = Extension.create({
  name: 'fontSize',
  addGlobalAttributes() {
    return [
      {
        types: ['textStyle'],
        attributes: {
          fontSize: {
            default: null,
            parseHTML: (element) => element.style.fontSize || null,
            renderHTML: (attributes) => {
              if (!attributes.fontSize) return {}
              return { style: `font-size: ${attributes.fontSize}` }
            },
          },
        },
      },
    ]
  },
})

const lowlight = createLowlight(common)

// Markdown rendering (GFM + mermaid) is configured in utils/markdown.

/** Detect if text looks like markdown (has md syntax patterns) */
function looksLikeMarkdown(text: string): boolean {
  const mdPatterns = [
    /^#{1,6}\s+\S/m,          // headings
    /\*\*[^*]+\*\*/,           // bold
    /^[-*+]\s+\S/m,            // unordered list
    /^\d+\.\s+\S/m,            // ordered list
    /^>\s+\S/m,                // blockquote
    /\[.+\]\(.+\)/,            // link
    /```[\s\S]+```/,           // fenced code block
    /^---+$/m,                 // hr
    /^\|.+\|.+\|/m,            // pipe table
  ]
  const matched = mdPatterns.filter(p => p.test(text)).length
  return matched >= 2 || (matched >= 1 && text.length > 200)
}

interface EditorCoreProps {
  content: string
  kbId: string
  docId?: string
  onEditorReady: (editor: any) => void
  onUpdate: (html: string, wordCount: number) => void
  editable?: boolean
  sourceMode?: boolean
}

export default function EditorCore({ content, kbId, docId, onEditorReady, onUpdate, editable = true, sourceMode = false }: EditorCoreProps) {
  const isFirstLoad = useRef(true)
  const [mdPrompt, setMdPrompt] = useState<{ text: string } | null>(null)
  const [mdLoading, setMdLoading] = useState(false)
  const [mdProgress, setMdProgress] = useState<{ done: number; total: number } | null>(null)
  // Images that could not be localized, reported in a dialog after insert.
  const [mdFailures, setMdFailures] = useState<FailedImage[]>([])
  // Lets the cancel button abort in-flight image downloads, and unmount abort
  // them so orphaned assets aren't created for a document the user left.
  const mdAbortRef = useRef<AbortController | null>(null)
  const [sourceContent, setSourceContent] = useState('')

  useEffect(() => {
    return () => mdAbortRef.current?.abort()
  }, [])

  const handleImageUpload = async (file: File): Promise<string | null> => {
    if (!file.type.startsWith('image/')) return null
    try {
      const res = await uploadImage(kbId, file)
      return res
    } catch {
      return null
    }
  }

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ codeBlock: false }),
      Highlight.configure({ multicolor: true }),
      Underline,
      Link.configure({
        openOnClick: false,
        HTMLAttributes: { class: 'text-indigo-600 underline hover:text-indigo-800' },
      }),
      ResizableImage.configure({
        allowBase64: true,
        HTMLAttributes: { class: 'max-w-full rounded-lg my-2' },
      }),
      Table.configure({ resizable: true }),
      ResizableTableRow,
      TableHeader,
      TableCell,
      CodeBlockLowlight.configure({ lowlight }),
      Placeholder.configure({ placeholder: '开始输入，或输入 / 来插入内容...' }),
      TaskList,
      TaskItem.configure({ nested: true }),
      CharacterCount,
      TextStyle,
      Color,
      FontSize,
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
    ],
    content,
    editable: editable && !sourceMode,
    onUpdate: ({ editor }) => {
      const wordCount = editor.storage.characterCount.characters()
      onUpdate(editor.getHTML(), wordCount)
    },
    editorProps: {
      attributes: {
        class: 'prose prose-gray max-w-none focus:outline-none min-h-[400px] text-gray-800 leading-relaxed',
      },
      handlePaste(view, event) {
        const items = Array.from(event.clipboardData?.items || [])

        // Handle image paste
        const imageItem = items.find((item) => item.type.startsWith('image/'))
        if (imageItem) {
          event.preventDefault()
          const file = imageItem.getAsFile()
          if (file) {
            handleImageUpload(file).then((url) => {
              if (url) {
                view.dispatch(
                  view.state.tr.replaceSelectionWith(
                    view.state.schema.nodes.image.create({ src: url })
                  )
                )
              }
            })
          }
          return true
        }

        // Handle markdown paste detection
        const textItem = event.clipboardData?.getData('text/plain') || ''
        if (textItem.length > 50 && looksLikeMarkdown(textItem)) {
          event.preventDefault()
          setMdPrompt({ text: textItem })
          return true
        }

        return false
      },
      handleDrop(view, event, _slice, moved) {
        if (!moved && event.dataTransfer?.files?.length) {
          const file = event.dataTransfer.files[0]
          if (file?.type.startsWith('image/')) {
            event.preventDefault()
            const { schema } = view.state
            const coordinates = view.posAtCoords({ left: event.clientX, top: event.clientY })
            handleImageUpload(file).then((url) => {
              if (url && coordinates) {
                const node = schema.nodes.image.create({ src: url })
                const transaction = view.state.tr.insert(coordinates.pos, node)
                view.dispatch(transaction)
              }
            })
            return true
          }
        }
        return false
      },
    },
  })

  useEffect(() => {
    if (editor) {
      onEditorReady(editor)
    }
  }, [editor])

  useEffect(() => {
    if (editor && content && isFirstLoad.current) {
      isFirstLoad.current = false
      if (editor.isEmpty) {
        editor.commands.setContent(content)
        setSourceContent(content)
      }
    }
  }, [content, editor])

  // Sync source mode: enter → HTML→MD; exit → MD→HTML
  useEffect(() => {
    if (sourceMode && editor) {
      // Convert current rich-text content to Markdown for display in textarea
      setSourceContent(htmlToMarkdown(editor.getHTML()))
    } else if (!sourceMode && editor && sourceContent) {
      // Convert Markdown back to HTML and load into editor — keep mermaid as
      // an editable fenced code block in the editor.
      const html = markdownToHtml(sourceContent, false)
      editor.commands.setContent(html)
    }
  }, [sourceMode])

  const handleMdConfirm = async () => {
    if (!mdPrompt || !editor) return

    // Stash the raw paste before touching it. Everything below can throw, and
    // until now a throw meant the clipboard content was gone for good.
    const draftKey = docId || `kb-${kbId}`
    saveDraft(draftKey, 'md-paste', mdPrompt.text)

    const controller = new AbortController()
    mdAbortRef.current = controller
    setMdLoading(true)
    setMdProgress(null)

    try {
      // Localize external image links before rendering: download each remote
      // image server-side (CORS blocks browser fetch) and rewrite the markdown
      // to point at the local copy. Failures keep the original URL.
      const { md: localMd, failed, failures } = await localizeRemoteImages(
        mdPrompt.text,
        kbId,
        docId,
        {
          signal: controller.signal,
          onProgress: (done, total) => setMdProgress({ done, total }),
        },
      )

      const html = markdownToHtml(localMd, false)

      // The editor can be torn down mid-download (user leaves edit mode or
      // navigates to another doc); writing to a destroyed instance throws.
      if (editor.isDestroyed) return

      editor.chain().focus().insertContent(html).run()
      clearDraft(draftKey)
      setMdPrompt(null)

      if (failed > 0) {
        // An inline banner, not a modal: the document did render, and a dark
        // overlay over it would suggest otherwise. Details on demand.
        setMdFailures(failures)
      }
    } catch (e) {
      // Insert the original markdown as-is rather than dropping the paste —
      // losing clipboard content the user can no longer recover is worse than
      // an unrendered block. The draft stays in localStorage as a backstop.
      console.error('[EditorCore] markdown paste failed', e)
      if (editor.isDestroyed) return
      try {
        editor.chain().focus().insertContent(mdPrompt.text).run()
        setMdPrompt(null)
        toast({ title: '渲染失败，已插入原始文本', variant: 'destructive' })
      } catch (inner) {
        // Even the plain-text fallback failed. Leave the banner up so the text
        // stays on screen, and point the user at the saved draft.
        console.error('[EditorCore] plain-text fallback failed', inner)
        toast({
          title: '插入失败，内容已备份到本地草稿',
          variant: 'destructive',
        })
      }
    } finally {
      mdAbortRef.current = null
      setMdLoading(false)
      setMdProgress(null)
    }
  }

  /** Abort in-flight downloads and keep the pasted text as-is. */
  const handleMdCancel = () => {
    if (mdLoading) {
      mdAbortRef.current?.abort()
      return
    }
    setMdPrompt(null)
  }

  const handleMdInsertPlain = () => {
    if (!mdPrompt || !editor) return
    editor.chain().focus().insertContent(mdPrompt.text).run()
    setMdPrompt(null)
  }

  return (
    <div className="relative">
      <FailedImagesNotice images={mdFailures} onDismiss={() => setMdFailures([])} />
      {/* Markdown paste prompt banner */}
      {mdPrompt && (
        <div className="mb-3 flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-4 py-2.5 text-sm">
          {mdLoading ? (
            <svg className="w-4 h-4 text-blue-500 flex-shrink-0 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          ) : (
            <svg className="w-4 h-4 text-blue-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          )}
          <span className="flex-1 text-blue-700">
            {mdLoading
              ? mdProgress && mdProgress.total > 0
                ? `正在下载外链图片并本地化… (${mdProgress.done}/${mdProgress.total})`
                : '正在下载外链图片并本地化…'
              : '检测到您粘贴的内容可能是 Markdown 格式，是否渲染为富文本？'}
          </span>
          <button
            type="button"
            onClick={handleMdConfirm}
            disabled={mdLoading}
            className="px-3 py-1 bg-blue-600 text-white text-xs rounded hover:bg-blue-700 transition disabled:opacity-50 disabled:cursor-wait"
          >
            {mdLoading ? '处理中…' : '渲染为富文本'}
          </button>
          <button
            type="button"
            onClick={handleMdInsertPlain}
            disabled={mdLoading}
            className="px-3 py-1 border border-gray-300 text-gray-600 text-xs rounded hover:bg-gray-50 transition disabled:opacity-50"
          >
            保留原始文本
          </button>
          {/* Stays enabled while loading: cancels the downloads instead of
              leaving the user with no way out of a slow batch. */}
          <button
            type="button"
            onClick={handleMdCancel}
            title={mdLoading ? '取消下载' : '关闭'}
            className="p-1 text-gray-400 hover:text-gray-600 transition"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}

      {/* Source mode (raw HTML editor) */}
      {sourceMode ? (
        <textarea
          className="w-full min-h-[400px] font-mono text-xs text-gray-700 bg-gray-50 border border-gray-200 rounded p-4 resize-none focus:outline-none focus:ring-1 focus:ring-indigo-400"
          value={sourceContent}
          onChange={(e) => {
            const md = e.target.value
            setSourceContent(md)
            // Convert Markdown → HTML before passing to onUpdate so auto-save
            // gets correct HTML. Mermaid is kept as a code block; the read view
            // renders it (renderMermaidBlocks handles language-mermaid).
            onUpdate(markdownToHtml(md, false), md.length)
          }}
          spellCheck={false}
        />
      ) : (
        <EditorContent
          editor={editor}
          className="prose prose-gray max-w-none focus:outline-none [&_.ProseMirror]:outline-none [&_.ProseMirror]:min-h-[400px]"
        />
      )}
    </div>
  )
}
