import { useEffect, useRef, useState } from 'react'
import HtmlDocumentViewer from '@/components/doc/HtmlDocumentViewer'
import { htmlToPlainText } from '@/utils/htmlDocument'
import { sanitizeHtml } from '@/utils/sanitize'

/**
 * Editor for a standalone HTML document (an LLM-generated report, typically).
 *
 * Deliberately not TipTap. A rich-text document's invariant is that content_md
 * and content_html are two projections of one ProseMirror doc that round-trip on
 * every save; a report's invariant is that its markup is authoritative and must
 * be left alone. Passing a report through that round trip would flatten its
 * layout, so the two need separate editing surfaces — see ContentFormat.
 *
 * Editing is source-level by design: the rendered view is faithful but not
 * editable, and structural changes are made in the HTML. Toggling back to the
 * rendered view shows the result.
 */
interface HtmlDocumentEditorProps {
  content: string
  onUpdate: (getHtml: () => string, wordCount: number) => void
  editable?: boolean
  /** true = show the source textarea, false = show the rendered document. */
  sourceMode?: boolean
}

export default function HtmlDocumentEditor({
  content,
  onUpdate,
  editable = true,
  sourceMode = false,
}: HtmlDocumentEditorProps) {
  const [source, setSource] = useState(content)
  const isFirstLoad = useRef(true)

  // Adopt content from the server once. Re-syncing on every change would fight
  // the user's typing, the same reason EditorCore guards its own setContent.
  useEffect(() => {
    if (isFirstLoad.current && content) {
      isFirstLoad.current = false
      setSource(content)
    }
  }, [content])

  if (sourceMode) {
    return (
      <textarea
        className="w-full min-h-[480px] font-mono text-xs text-gray-800 bg-gray-50 border border-gray-200 rounded p-4 resize-none focus:outline-none focus:ring-1 focus:ring-indigo-400"
        value={source}
        readOnly={!editable}
        spellCheck={false}
        onChange={(e) => {
          const next = e.target.value
          setSource(next)
          // Sanitize on the way out, not on the way in: the textarea must show
          // exactly what the user typed. Word count comes from the extracted
          // text — counting markup characters would be meaningless.
          onUpdate(() => sanitizeHtml(next), htmlToPlainText(next).length)
        }}
      />
    )
  }

  return <HtmlDocumentViewer html={source} className="min-h-[200px]" />
}
