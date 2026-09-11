import { useCallback, useEffect, useRef, useState } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import type { Editor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Highlight from '@tiptap/extension-highlight'
import Underline from '@tiptap/extension-underline'
import Link from '@tiptap/extension-link'
import { ResizableImage } from './ResizableImage'
import Table from '@tiptap/extension-table'
import { ResizableTableRow } from './TableRowHeight'
import { TableColumnWidth, TABLE_CELL_MIN_WIDTH } from './TableColumnWidth'
import { TableDeleteShortcuts } from './TableDeleteShortcuts'
import TableContextMenu, { type TableContextMenuPosition } from './TableContextMenu'
import { SearchAndReplace } from './SearchAndReplace'
import FindReplacePanel from './FindReplacePanel'
import { TrailingNode } from './TrailingNode'
import { StyledTableCell, StyledTableHeader } from './TableCellAttributes'
import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight'
import Placeholder from '@tiptap/extension-placeholder'
import TaskList from '@tiptap/extension-task-list'
import TaskItem from '@tiptap/extension-task-item'
import CharacterCount from '@tiptap/extension-character-count'
import TextStyle from '@tiptap/extension-text-style'
import Color from '@tiptap/extension-color'
import TextAlign from '@tiptap/extension-text-align'
import { Extension } from '@tiptap/core'
import { TextSelection } from '@tiptap/pm/state'
import { createLowlight, common } from 'lowlight'
import TurndownService from 'turndown'
import * as turndownPluginGfm from 'turndown-plugin-gfm'
import { uploadImage } from '../../api/upload'
import { markdownToHtml } from '../../utils/markdown'
import { isHtmlDocument, hasDocumentStructure } from '../../utils/htmlDocument'
import { downscaleImage, dataUrlToFile } from '../../utils/imageCompress'
import { getApiErrorCode, getApiErrorMessage } from '@/utils'
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
  // Both spellings: an imported table may carry the legacy `height` attribute
  // rather than an inline style, and parseRowHeight accepts either — so a table
  // using the attribute form must take the raw-HTML path too or it loses its
  // heights on the first save.
  return Array.from(table.querySelectorAll('tr')).some((row) => {
    const el = row as HTMLElement
    return Boolean(el.style?.height) || Boolean(el.getAttribute('height'))
  })
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
  onUpdate: (getHtml: () => string, wordCount: number) => void
  editable?: boolean
  sourceMode?: boolean
  /**
   * Turn the document into a standalone HTML document with this markup.
   *
   * Supplied by the page, which owns the format flag and the save. When absent
   * the HTML branch of the paste handler is disabled entirely, so an embedder
   * that cannot support the format never offers it.
   */
  onUseAsHtmlDocument?: (html: string) => void
}

export default function EditorCore({ content, kbId, docId, onEditorReady, onUpdate, editable = true, sourceMode = false, onUseAsHtmlDocument }: EditorCoreProps) {
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
  // Pasted images upload before they can be inserted; without an indicator the
  // paste looks like it did nothing at all.
  const [uploadingImage, setUploadingImage] = useState(false)
  // A pasted standalone HTML document awaiting the user's choice.
  // Right-click table menu, positioned at the pointer.
  const [tableMenu, setTableMenu] = useState<TableContextMenuPosition | null>(null)
  // null = closed; `replace` remembers which field to focus on open.
  const [findPanel, setFindPanel] = useState<{ replace: boolean } | null>(null)
  const [htmlPrompt, setHtmlPrompt] = useState<{
    text: string
    canBecomeDocument: boolean
  } | null>(null)
  // handlePaste lives inside the useEditor config, so it cannot close over the
  // editor it is configuring.
  const editorRef = useRef<Editor | null>(null)

  useEffect(() => {
    return () => mdAbortRef.current?.abort()
  }, [])

  /**
   * Ctrl/Cmd+F to find, Ctrl/Cmd+Shift+H to open with replace focused.
   *
   * Overriding the browser's own find is what 飞书 and Google Docs both do: the
   * in-document search is the one that can also replace, and the browser's cannot
   * reach collapsed or virtualised content. Only bound while this editor is
   * mounted and editable, so reading pages keep the native behaviour.
   */
  useEffect(() => {
    if (!editable) return
    const onKeyDown = (event: KeyboardEvent) => {
      const mod = event.metaKey || event.ctrlKey
      if (!mod) return
      const key = event.key.toLowerCase()
      if (key === 'f') {
        event.preventDefault()
        setFindPanel({ replace: false })
      } else if (key === 'h' && event.shiftKey) {
        event.preventDefault()
        setFindPanel({ replace: true })
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [editable])


  const handleImageUpload = useCallback(
    async (file: File): Promise<string | null> => {
      if (!file.type.startsWith('image/')) return null
      try {
        // Shrink first: the server rejects images over IMAGE_MAX_SIZE_MB, and a
        // screenshot straight off a Retina display often exceeds it.
        const prepared = await downscaleImage(file)
        return await uploadImage(kbId, prepared)
      } catch (err) {
        // Previously `catch { return null }` — a rejected upload produced no
        // node, no message and no console line, so the paste appeared to be
        // swallowed. Past the 10MB image cap that was the whole user experience.
        const code = getApiErrorCode(err)
        const reason =
          code === 'IMAGE_TOO_LARGE' || code === 'FILE_TOO_LARGE'
            ? '图片超过服务端大小限制'
            : getApiErrorMessage(err, '请检查网络后重试')
        toast({ title: '图片上传失败', description: reason, variant: 'destructive' })
        return null
      }
    },
    [kbId],
  )

  /**
   * Replace every `data:` image already in the document with an uploaded asset.
   *
   * `allowBase64` stays enabled so documents that already contain inline images
   * keep rendering them — turning it off would make TipTap drop those nodes on
   * load and the next autosave would persist the loss. Instead new ones are
   * converted on the way in: a data URL in the document is re-serialized in full
   * on every save, into both content_html and content_md, which is what makes
   * the editor crawl after pasting a screenshot-bearing page.
   */
  const uploadInlinedImages = useCallback(async () => {
    const editor = editorRef.current
    if (!editor || editor.isDestroyed) return

    const inlined: { pos: number; src: string }[] = []
    editor.state.doc.descendants((node, pos) => {
      if (node.type.name === 'image' && String(node.attrs.src || '').startsWith('data:')) {
        inlined.push({ pos, src: node.attrs.src })
      }
    })
    if (inlined.length === 0) return

    setUploadingImage(true)
    try {
      for (const { src } of inlined) {
        const file = await dataUrlToFile(src)
        if (!file) continue
        const url = await handleImageUpload(file)
        if (!url) continue
        const live = editorRef.current
        if (!live || live.isDestroyed) return
        // Re-locate by src rather than trusting the original position: earlier
        // uploads in this loop have already changed the document.
        const tr = live.state.tr
        let found = false
        live.state.doc.descendants((node, pos) => {
          if (found) return false
          if (node.type.name === 'image' && node.attrs.src === src) {
            tr.setNodeMarkup(pos, undefined, { ...node.attrs, src: url })
            found = true
            return false
          }
          return true
        })
        if (found) live.view.dispatch(tr)
      }
    } finally {
      setUploadingImage(false)
    }
  }, [kbId])

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
        // Deliberately left on. Nothing in the app produces a data URL, so this
        // only affects *parsing*: with it off, TipTap would drop every inline
        // image already stored in an existing document and the next autosave
        // would persist that loss. New ones are converted to uploads instead —
        // see uploadInlinedImages.
        allowBase64: true,
        HTMLAttributes: { class: 'max-w-full rounded-lg my-2' },
      }),
      Table.configure({ resizable: true, cellMinWidth: TABLE_CELL_MIN_WIDTH }),
      ResizableTableRow,
      // Cell background colour and vertical alignment; stock TableCell/TableHeader
      // have neither, and setCellAttribute had no attributes to write to.
      StyledTableHeader,
      StyledTableCell,
      // Seeds colwidth so the table is fixed-width from the first render; the
      // last column is otherwise pinned to the container and undraggable.
      TableColumnWidth.configure({ cellMinWidth: TABLE_CELL_MIN_WIDTH }),
      // Backspace/Delete removes an *empty* table. Upstream only handles the
      // all-cells-selected case, which left a table hard to get rid of.
      TableDeleteShortcuts,
      // Find & replace. 飞书 and Google Docs both have it; its absence here was
      // conspicuous.
      SearchAndReplace,
      CodeBlockLowlight.configure({ lowlight }),
      Placeholder.configure({ placeholder: '开始输入，或输入 / 来插入内容...' }),
      TaskList,
      TaskItem.configure({ nested: true }),
      CharacterCount,
      TextStyle,
      Color,
      FontSize,
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      // Keeps a paragraph after a trailing block node so the caret always has
      // somewhere to go after pasting an image at the end of the document.
      TrailingNode,
    ],
    content,
    editable: editable && !sourceMode,
    onUpdate: ({ editor }) => {
      const wordCount = editor.storage.characterCount.characters()
      // Pass a getter, not the serialized HTML: this fires on every transaction
      // (including every keystroke and, before the resize fix, every mousemove
      // of an image drag), while only the debounced save ever needs the string.
      // Serializing eagerly meant a full document serialization per keystroke.
      onUpdate(() => editor.getHTML(), wordCount)
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
            setUploadingImage(true)
            handleImageUpload(file)
              .then((url) => {
                // The view can be torn down while the upload is in flight (the
                // user leaves edit mode); dispatching into a dead view throws.
                if (!url || view.isDestroyed) return
                view.dispatch(
                  view.state.tr.replaceSelectionWith(
                    view.state.schema.nodes.image.create({ src: url })
                  )
                )
              })
              .finally(() => setUploadingImage(false))
          }
          return true
        }

        // Clipboard HTML carrying data: URLs (e.g. copied from another editor).
        // Let ProseMirror parse it normally, then swap each inline payload for an
        // uploaded asset: a data URL left in the document is re-serialized on
        // every save, in both content_html and content_md.
        const htmlItem = event.clipboardData?.getData('text/html') || ''
        if (htmlItem.includes('src="data:image/') || htmlItem.includes("src='data:image/")) {
          setTimeout(() => uploadInlinedImages(), 0)
          return false
        }

        const textItem = event.clipboardData?.getData('text/plain') || ''

        // A standalone HTML document, pasted as source text — the shape an
        // LLM-generated report arrives in when copied from a chat UI. Offered
        // before the markdown branch: an HTML document can trip
        // looksLikeMarkdown, and once that banner is confirmed the markup is
        // gone. Only offered for an empty document, because a document cannot be
        // half rich text and half HTML.
        if (onUseAsHtmlDocument && isHtmlDocument(textItem)) {
          event.preventDefault()
          setHtmlPrompt({ text: textItem, canBecomeDocument: view.state.doc.textContent.trim() === '' })
          return true
        }

        // Handle markdown paste detection
        if (textItem.length > 50 && looksLikeMarkdown(textItem)) {
          event.preventDefault()
          setMdPrompt({ text: textItem })
          return true
        }

        return false
      },
      handleDOMEvents: {
        /**
         * Open the table menu on right-click.
         *
         * The caret is moved into the cell that was clicked first: the commands
         * the menu runs all act on the current selection, and a right-click does
         * not reliably move the selection on its own.
         */
        contextmenu(view, event) {
          if (!view.editable) return false
          const target = event.target
          if (!(target instanceof HTMLElement)) return false
          if (!target.closest('td, th')) return false

          const coords = view.posAtCoords({ left: event.clientX, top: event.clientY })
          if (coords) {
            const { tr } = view.state
            try {
              view.dispatch(tr.setSelection(TextSelection.near(view.state.doc.resolve(coords.pos))))
            } catch {
              // A resolve failure just means we keep whatever selection existed.
            }
          }

          event.preventDefault()
          setTableMenu({ x: event.clientX, y: event.clientY })
          return true
        },
      },
      handleDrop(view, event, _slice, moved) {
        if (!moved && event.dataTransfer?.files?.length) {
          const file = event.dataTransfer.files[0]
          if (file?.type.startsWith('image/')) {
            event.preventDefault()
            const coordinates = view.posAtCoords({ left: event.clientX, top: event.clientY })
            setUploadingImage(true)
            handleImageUpload(file)
              .then((url) => {
                if (!url || !coordinates || view.isDestroyed) return
                const node = view.state.schema.nodes.image.create({ src: url })
                // Clamp: the document may have changed while the upload ran.
                const pos = Math.min(coordinates.pos, view.state.doc.content.size)
                view.dispatch(view.state.tr.insert(pos, node))
              })
              .finally(() => setUploadingImage(false))
            return true
          }
        }
        return false
      },
    },
  })

  useEffect(() => {
    editorRef.current = editor ?? null
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
      {tableMenu && editor && (
        <TableContextMenu editor={editor} position={tableMenu} onClose={() => setTableMenu(null)} />
      )}
      {findPanel && editor && (
        <FindReplacePanel
          editor={editor}
          replaceMode={findPanel.replace}
          onClose={() => setFindPanel(null)}
        />
      )}
      {/* Pasted/dropped images upload before they can be inserted. Without this
          the paste looks like it silently did nothing. */}
      {uploadingImage && (
        <div
          role="status"
          aria-live="polite"
          className="mb-3 flex items-center gap-2 rounded-lg border border-indigo-200 bg-indigo-50 px-4 py-2 text-sm text-indigo-700"
        >
          <svg className="w-4 h-4 flex-shrink-0 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          图片上传中…
        </div>
      )}
      {/* Pasted HTML document prompt banner */}
      {htmlPrompt && (
        <div className="mb-3 rounded-lg border border-violet-200 bg-violet-50 px-4 py-2.5 text-sm">
          <div className="flex items-center gap-2 flex-wrap">
            <svg className="w-4 h-4 text-violet-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
            </svg>
            <span className="text-violet-800">
              检测到完整的 HTML {hasDocumentStructure(htmlPrompt.text) ? '文档' : '内容'}，如何处理？
            </span>
            <div className="flex-1" />
            {htmlPrompt.canBecomeDocument ? (
              <button
                type="button"
                onClick={() => {
                  const { text } = htmlPrompt
                  setHtmlPrompt(null)
                  onUseAsHtmlDocument?.(text)
                }}
                className="px-2.5 py-1 rounded bg-violet-600 text-white text-xs font-medium hover:bg-violet-700 transition"
              >
                作为 HTML 文档
              </button>
            ) : (
              <span
                className="text-xs text-violet-600/70"
                title="当前文档已有内容。一篇文档不能一半富文本、一半 HTML，请新建空白文档后再粘贴。"
              >
                （需空白文档才能作为 HTML 文档）
              </span>
            )}
            <button
              type="button"
              onClick={() => {
                const { text } = htmlPrompt
                setHtmlPrompt(null)
                // Let TipTap parse it: anything outside the schema is dropped, so
                // a report's layout will flatten — but everything stays editable.
                editor?.chain().focus().insertContent(text).run()
              }}
              className="px-2.5 py-1 rounded border border-violet-300 text-violet-700 text-xs hover:bg-violet-100 transition"
            >
              转为富文本
            </button>
            <button
              type="button"
              onClick={() => {
                const { text } = htmlPrompt
                setHtmlPrompt(null)
                editor?.chain().focus().insertContent(text, {
                  parseOptions: { preserveWhitespace: 'full' },
                }).run()
              }}
              className="px-2.5 py-1 rounded text-violet-700 text-xs hover:bg-violet-100 transition"
              title="按原始文本插入，不解析标签"
            >
              纯文本
            </button>
            <button
              type="button"
              onClick={() => setHtmlPrompt(null)}
              className="p-1 rounded hover:bg-violet-100 transition"
              title="关闭"
            >
              <svg className="w-3.5 h-3.5 text-violet-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
      )}
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
            onUpdate(() => markdownToHtml(md, false), md.length)
          }}
          spellCheck={false}
        />
      ) : (
        <EditorContent
          editor={editor}
          // No `prose` here: the ProseMirror element itself already carries
          // `prose prose-gray` (see editorProps.attributes). Nesting the two
          // made every em-based typography size compound across the two levels.
          className="max-w-none focus:outline-none [&_.ProseMirror]:outline-none [&_.ProseMirror]:min-h-[400px]"
        />
      )}
    </div>
  )
}
