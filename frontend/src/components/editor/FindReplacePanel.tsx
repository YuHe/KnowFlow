import { useEffect, useRef, useState } from 'react'
import type { Editor } from '@tiptap/react'
import { searchPluginKey } from './SearchAndReplace'

/**
 * Find-and-replace panel.
 *
 * Shortcuts follow 飞书: `Ctrl/Cmd+F` to find, `Ctrl/Cmd+Shift+H` to open with the
 * replace field focused. Overriding the browser's own find is what 飞书 and
 * Google Docs both do — in a document editor the in-document search is the one
 * that can also replace, and the browser's cannot see collapsed content.
 */
interface FindReplacePanelProps {
  editor: Editor
  /** Open with the replace field focused. */
  replaceMode: boolean
  onClose: () => void
}

export default function FindReplacePanel({ editor, replaceMode, onClose }: FindReplacePanelProps) {
  const [query, setQuery] = useState('')
  const [replacement, setReplacement] = useState('')
  const [caseSensitive, setCaseSensitive] = useState(false)
  const [showReplace, setShowReplace] = useState(replaceMode)
  const findRef = useRef<HTMLInputElement>(null)
  const replaceRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setShowReplace(replaceMode)
    const target = replaceMode ? replaceRef.current : findRef.current
    target?.focus()
    target?.select()
  }, [replaceMode])

  // Push the query into the plugin; it owns the match list and the highlights.
  useEffect(() => {
    editor.commands.setSearchQuery(query, caseSensitive)
  }, [editor, query, caseSensitive])

  // Leave no highlights behind when the panel goes away.
  useEffect(() => () => { editor.commands.clearSearch() }, [editor])

  const search = searchPluginKey.getState(editor.state)
  const total = search?.matches.length ?? 0
  const current = search && search.current >= 0 ? search.current + 1 : 0

  /** Scroll the active match into view after moving. */
  const revealCurrent = () => {
    const state = searchPluginKey.getState(editor.state)
    if (!state || state.current < 0) return
    const match = state.matches[state.current]
    if (!match) return
    editor.commands.setTextSelection({ from: match.from, to: match.to })
    editor.commands.scrollIntoView()
  }

  const next = () => {
    editor.commands.findNext()
    revealCurrent()
  }
  const previous = () => {
    editor.commands.findPrevious()
    revealCurrent()
  }

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Escape') {
      event.preventDefault()
      onClose()
      return
    }
    if (event.key === 'Enter') {
      event.preventDefault()
      if (event.shiftKey) previous()
      else next()
    }
  }

  return (
    <div
      className="absolute right-3 top-3 z-30 w-80 rounded-lg border border-gray-200 bg-white p-2.5 shadow-lg"
      onKeyDown={onKeyDown}
      role="search"
    >
      <div className="flex items-center gap-1.5">
        <input
          ref={findRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="查找"
          aria-label="查找"
          className="min-w-0 flex-1 rounded border border-gray-300 px-2 py-1 text-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
        <span className="w-14 shrink-0 text-center text-xs text-gray-500">
          {query ? `${current}/${total}` : ''}
        </span>
        <button
          type="button"
          onClick={previous}
          disabled={total === 0}
          title="上一个 (Shift+Enter)"
          className="h-7 w-7 shrink-0 rounded text-gray-600 transition hover:bg-gray-100 disabled:opacity-40"
        >
          ↑
        </button>
        <button
          type="button"
          onClick={next}
          disabled={total === 0}
          title="下一个 (Enter)"
          className="h-7 w-7 shrink-0 rounded text-gray-600 transition hover:bg-gray-100 disabled:opacity-40"
        >
          ↓
        </button>
        <button
          type="button"
          onClick={onClose}
          title="关闭 (Esc)"
          className="h-7 w-7 shrink-0 rounded text-gray-500 transition hover:bg-gray-100"
        >
          ✕
        </button>
      </div>

      <div className="mt-1.5 flex items-center gap-3">
        <label className="flex items-center gap-1 text-xs text-gray-500">
          <input
            type="checkbox"
            checked={caseSensitive}
            onChange={(e) => setCaseSensitive(e.target.checked)}
          />
          区分大小写
        </label>
        <button
          type="button"
          onClick={() => setShowReplace((v) => !v)}
          className="text-xs text-indigo-600 hover:underline"
        >
          {showReplace ? '收起替换' : '替换…'}
        </button>
      </div>

      {showReplace && (
        <div className="mt-1.5 flex items-center gap-1.5">
          <input
            ref={replaceRef}
            value={replacement}
            onChange={(e) => setReplacement(e.target.value)}
            placeholder="替换为"
            aria-label="替换为"
            className="min-w-0 flex-1 rounded border border-gray-300 px-2 py-1 text-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          <button
            type="button"
            onClick={() => {
              editor.commands.replaceCurrent(replacement)
              revealCurrent()
            }}
            disabled={total === 0}
            className="shrink-0 rounded border border-gray-300 px-2 py-1 text-xs text-gray-700 transition hover:bg-gray-50 disabled:opacity-40"
          >
            替换
          </button>
          <button
            type="button"
            onClick={() => editor.commands.replaceAll(replacement)}
            disabled={total === 0}
            className="shrink-0 rounded bg-indigo-600 px-2 py-1 text-xs font-medium text-white transition hover:bg-indigo-700 disabled:opacity-40"
          >
            全部
          </button>
        </div>
      )}
    </div>
  )
}
