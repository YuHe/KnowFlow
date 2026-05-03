import { useEffect, useRef, useState } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Highlight from '@tiptap/extension-highlight'
import Underline from '@tiptap/extension-underline'
import Link from '@tiptap/extension-link'
import Image from '@tiptap/extension-image'
import Table from '@tiptap/extension-table'
import TableRow from '@tiptap/extension-table-row'
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
import { uploadImage } from '../../api/upload'

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

/** Very simple markdown-to-HTML converter for paste detection preview */
function markdownToHtml(md: string): string {
  return md
    .replace(/^(#{1,6})\s+(.+)$/gm, (_m, hashes: string, text: string) => `<h${hashes.length}>${text}</h${hashes.length}>`)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>')
    .replace(/^[-*+]\s+(.+)$/gm, '<li>$1</li>')
    .replace(/^(\d+)\.\s+(.+)$/gm, '<li>$1. $2</li>')
    .replace(/^>\s+(.+)$/gm, '<blockquote>$1</blockquote>')
    .replace(/^---+$/gm, '<hr/>')
    .replace(/\n\n+/g, '</p><p>')
    .replace(/^([^<\n].*)$/gm, (_m, line: string) => {
      if (!line.trim()) return ''
      if (/^<(h\d|li|blockquote|hr|ul|ol|p|\/p)/.test(line)) return line
      return line
    })
}

/** Detect if text looks like markdown (has md syntax patterns) */
function looksLikeMarkdown(text: string): boolean {
  const mdPatterns = [
    /^#{1,6}\s+\S/m,         // headings
    /\*\*[^*]+\*\*/,          // bold
    /^[-*+]\s+\S/m,           // unordered list
    /^\d+\.\s+\S/m,           // ordered list
    /^>\s+\S/m,               // blockquote
    /\[.+\]\(.+\)/,           // link
    /```[\s\S]+```/,          // fenced code block
    /^---+$/m,                // hr
  ]
  const matched = mdPatterns.filter(p => p.test(text)).length
  return matched >= 2 || (matched >= 1 && text.length > 200)
}

interface EditorCoreProps {
  content: string
  kbId: string
  onEditorReady: (editor: any) => void
  onUpdate: (html: string, wordCount: number) => void
  editable?: boolean
  sourceMode?: boolean
}

export default function EditorCore({ content, kbId, onEditorReady, onUpdate, editable = true, sourceMode = false }: EditorCoreProps) {
  const isFirstLoad = useRef(true)
  const [mdPrompt, setMdPrompt] = useState<{ text: string } | null>(null)
  const [sourceContent, setSourceContent] = useState('')

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
      Image.configure({
        allowBase64: true,
        HTMLAttributes: { class: 'max-w-full rounded-lg my-2' },
      }),
      Table.configure({ resizable: true }),
      TableRow,
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

  // Sync source mode content from editor when toggling
  useEffect(() => {
    if (sourceMode && editor) {
      setSourceContent(editor.getHTML())
    } else if (!sourceMode && editor && sourceContent) {
      editor.commands.setContent(sourceContent)
    }
  }, [sourceMode])

  const handleMdConfirm = () => {
    if (!mdPrompt || !editor) return
    const html = markdownToHtml(mdPrompt.text)
    editor.chain().focus().insertContent(html).run()
    setMdPrompt(null)
  }

  const handleMdInsertPlain = () => {
    if (!mdPrompt || !editor) return
    editor.chain().focus().insertContent(mdPrompt.text).run()
    setMdPrompt(null)
  }

  return (
    <div className="relative">
      {/* Markdown paste prompt banner */}
      {mdPrompt && (
        <div className="mb-3 flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-4 py-2.5 text-sm">
          <svg className="w-4 h-4 text-blue-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span className="flex-1 text-blue-700">检测到您粘贴的内容可能是 Markdown 格式，是否渲染为富文本？</span>
          <button
            type="button"
            onClick={handleMdConfirm}
            className="px-3 py-1 bg-blue-600 text-white text-xs rounded hover:bg-blue-700 transition"
          >
            渲染为富文本
          </button>
          <button
            type="button"
            onClick={handleMdInsertPlain}
            className="px-3 py-1 border border-gray-300 text-gray-600 text-xs rounded hover:bg-gray-50 transition"
          >
            保留原始文本
          </button>
          <button
            type="button"
            onClick={() => setMdPrompt(null)}
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
            setSourceContent(e.target.value)
            onUpdate(e.target.value, e.target.value.length)
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
