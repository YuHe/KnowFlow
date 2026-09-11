import React, { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { Editor } from '@tiptap/react'

/**
 * Right-click menu for tables.
 *
 * Every comparable editor — 飞书, Notion, Google Docs — drives table editing from
 * the grid itself; ours drove it entirely from the top toolbar, which is the
 * single largest interaction gap the feature review turned up. It is also what
 * made the table controls feel missing: they live behind `isActive('table')`, so
 * they are invisible until the caret is already in a table.
 *
 * Contents follow the review's conclusion about scope: structural edits,
 * presentation, and delete. Deliberately no sort/filter/formula — 飞书 and Notion
 * both refuse those in a document table and offer an embedded spreadsheet
 * instead, so adding them here would be inventing a third answer.
 */

export interface TableContextMenuPosition {
  x: number
  y: number
}

interface TableContextMenuProps {
  editor: Editor
  position: TableContextMenuPosition
  onClose: () => void
}

interface MenuItem {
  label: string
  run: () => void
  /** Rendered greyed and unclickable when this returns false. */
  enabled?: () => boolean
  danger?: boolean
}

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

const VERTICAL_ALIGNMENTS = [
  { label: '顶端对齐', value: 'top' },
  { label: '垂直居中', value: 'middle' },
  { label: '底端对齐', value: 'bottom' },
] as const

export default function TableContextMenu({ editor, position, onClose }: TableContextMenuProps) {
  const ref = useRef<HTMLDivElement>(null)
  const [placed, setPlaced] = useState<TableContextMenuPosition>(position)

  // Keep the menu inside the viewport: a right-click near the bottom or right
  // edge would otherwise open it partly offscreen with no way to scroll to it.
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const { width, height } = el.getBoundingClientRect()
    const margin = 8
    setPlaced({
      x: Math.min(position.x, window.innerWidth - width - margin),
      y: Math.min(position.y, window.innerHeight - height - margin),
    })
  }, [position])

  useEffect(() => {
    const onPointerDown = (event: MouseEvent) => {
      if (!ref.current?.contains(event.target as Node)) onClose()
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    // `mousedown` rather than `click`: the menu must not survive the next
    // interaction anywhere, including a second right-click elsewhere.
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('contextmenu', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('contextmenu', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [onClose])

  const act = (fn: () => void) => () => {
    fn()
    onClose()
  }

  const groups: MenuItem[][] = [
    [
      { label: '上方插入行', run: act(() => editor.chain().focus().addRowBefore().run()) },
      { label: '下方插入行', run: act(() => editor.chain().focus().addRowAfter().run()) },
      { label: '左侧插入列', run: act(() => editor.chain().focus().addColumnBefore().run()) },
      { label: '右侧插入列', run: act(() => editor.chain().focus().addColumnAfter().run()) },
    ],
    [
      { label: '删除当前行', run: act(() => editor.chain().focus().deleteRow().run()) },
      { label: '删除当前列', run: act(() => editor.chain().focus().deleteColumn().run()) },
    ],
    [
      // Reordering. 飞书 and Notion do this by dragging a grip; a one-step move is
      // the same operation with a target you cannot miss, and it is the only form
      // whose behaviour around merged cells can be stated precisely — each item
      // greys out exactly when the swap would tear a merged cell.
      {
        label: '上移一行',
        run: act(() => editor.chain().focus().moveRowUp().run()),
        enabled: () => editor.can().moveRowUp(),
      },
      {
        label: '下移一行',
        run: act(() => editor.chain().focus().moveRowDown().run()),
        enabled: () => editor.can().moveRowDown(),
      },
      {
        label: '左移一列',
        run: act(() => editor.chain().focus().moveColumnLeft().run()),
        enabled: () => editor.can().moveColumnLeft(),
      },
      {
        label: '右移一列',
        run: act(() => editor.chain().focus().moveColumnRight().run()),
        enabled: () => editor.can().moveColumnRight(),
      },
    ],
    [
      {
        label: '合并 / 拆分单元格',
        run: act(() => editor.chain().focus().mergeOrSplit().run()),
        enabled: () => editor.can().mergeOrSplit(),
      },
      { label: '切换表头行', run: act(() => editor.chain().focus().toggleHeaderRow().run()) },
      { label: '切换表头列', run: act(() => editor.chain().focus().toggleHeaderColumn().run()) },
      { label: '均分列宽', run: act(() => editor.chain().focus().distributeTableColumns().run()) },
    ],
  ]

  return (
    <div
      ref={ref}
      role="menu"
      className="fixed z-[100] w-44 rounded-lg border border-gray-200 bg-white py-1 shadow-lg text-sm"
      style={{ left: placed.x, top: placed.y }}
    >
      {groups.map((group, groupIndex) => (
        <div key={groupIndex} className={groupIndex > 0 ? 'border-t border-gray-100 mt-1 pt-1' : ''}>
          {group.map((item) => {
            const enabled = item.enabled ? item.enabled() : true
            return (
              <button
                key={item.label}
                type="button"
                role="menuitem"
                disabled={!enabled}
                onClick={item.run}
                className={`w-full px-3 py-1.5 text-left transition ${
                  enabled ? 'text-gray-700 hover:bg-gray-50' : 'text-gray-300 cursor-not-allowed'
                }`}
              >
                {item.label}
              </button>
            )
          })}
        </div>
      ))}

      <div className="border-t border-gray-100 mt-1 pt-1.5">
        <p className="px-3 pb-1 text-xs text-gray-400">单元格填充</p>
        <div className="grid grid-cols-5 gap-1 px-3 pb-1.5">
          {CELL_FILL_COLORS.map((color) => (
            <button
              key={color.value}
              type="button"
              title={color.label}
              onClick={act(() =>
                editor
                  .chain()
                  .focus()
                  .setCellAttribute('backgroundColor', color.value || null)
                  .run(),
              )}
              className="h-5 w-5 rounded border border-gray-200 transition hover:scale-110 flex items-center justify-center"
              style={{ backgroundColor: color.value || '#ffffff' }}
            >
              {!color.value && <span className="text-[10px] text-gray-400">✕</span>}
            </button>
          ))}
        </div>
      </div>

      <div className="border-t border-gray-100 mt-1 pt-1">
        {VERTICAL_ALIGNMENTS.map((option) => (
          <button
            key={option.value}
            type="button"
            role="menuitem"
            onClick={act(() =>
              editor.chain().focus().setCellAttribute('verticalAlign', option.value).run(),
            )}
            className="w-full px-3 py-1.5 text-left text-gray-700 transition hover:bg-gray-50"
          >
            {option.label}
          </button>
        ))}
      </div>

      <div className="border-t border-gray-100 mt-1 pt-1">
        <button
          type="button"
          role="menuitem"
          onClick={act(() => editor.chain().focus().deleteTable().run())}
          className="w-full px-3 py-1.5 text-left text-red-600 transition hover:bg-red-50"
        >
          删除表格
        </button>
      </div>
    </div>
  )
}
