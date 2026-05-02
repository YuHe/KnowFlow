import { useEffect, useRef } from 'react'
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
import { createLowlight, common } from 'lowlight'
import { uploadImage } from '../../api/upload'

const lowlight = createLowlight(common)

interface EditorCoreProps {
  content: string
  kbId: string
  onEditorReady: (editor: any) => void
  onUpdate: (html: string, wordCount: number) => void
  editable?: boolean
}

export default function EditorCore({ content, kbId, onEditorReady, onUpdate, editable = true }: EditorCoreProps) {
  const isFirstLoad = useRef(true)

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
    ],
    content,
    editable,
    onUpdate: ({ editor }) => {
      const wordCount = editor.storage.characterCount.characters()
      onUpdate(editor.getHTML(), wordCount)
    },
    editorProps: {
      attributes: {
        class: 'prose prose-gray max-w-none focus:outline-none min-h-[400px] text-gray-800',
      },
      handlePaste(view, event) {
        const items = Array.from(event.clipboardData?.items || [])
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
      }
    }
  }, [content, editor])

  return (
    <EditorContent
      editor={editor}
      className="prose prose-gray max-w-none focus:outline-none [&_.ProseMirror]:outline-none [&_.ProseMirror]:min-h-[400px]"
    />
  )
}
