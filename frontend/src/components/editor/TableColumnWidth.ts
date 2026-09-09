import { Extension } from '@tiptap/core'
import { TableMap } from '@tiptap/pm/tables'
import type { Node as PMNode } from '@tiptap/pm/model'
import type { Transaction } from '@tiptap/pm/state'

/**
 * Make sure every table carries explicit column widths.
 *
 * prosemirror-tables stores a column's width as a `colwidth` attribute on its
 * cells, and @tiptap/extension-table only writes an inline
 * `width: <sum>px` on the `<table>` once *every* column has one. Until then it
 * writes `min-width` only, so the stylesheet's `width: 100%` governs — and under
 * `table-layout: fixed` that pins the table's right edge to the container.
 *
 * The last column's resize handle *is* that right edge, so it could not be
 * dragged at all: the drag armed and started, but the border had nowhere to
 * move. Resizing any other column first gave every column a colwidth, the inline
 * width took over, the table detached from the container, and only then did the
 * last column respond. That is exactly the "I have to adjust a middle column
 * first" symptom.
 *
 * Seeding the widths up front removes the asymmetry: the table is `fixedWidth`
 * from its first render, so every column — including the last — is draggable
 * immediately, and dragging grows the table inside the scrollable
 * `.tableWrapper` rather than fighting the container.
 */

/** Does any cell in this table lack a usable colwidth? */
function needsSeeding(table: PMNode): boolean {
  const map = TableMap.get(table)
  for (let col = 0; col < map.width; col++) {
    const cellPos = map.map[col]
    const cell = table.nodeAt(cellPos)
    const widths = cell?.attrs.colwidth as number[] | null | undefined
    if (!widths || !widths.length || widths.some((w) => !w || w <= 0)) return true
  }
  return false
}

/**
 * Write an even colwidth across `table`'s columns into `tr`.
 *
 * Returns true when something changed. Widths are derived from the available
 * editor width so a seeded table looks exactly like the 100%-wide one it
 * replaces; `fallbackWidth` covers the case where the editor is not laid out yet
 * (initial render, or a test environment with no layout).
 */
export function seedColumnWidths(
  tr: Transaction,
  table: PMNode,
  tablePos: number,
  availableWidth: number,
  cellMinWidth: number,
): boolean {
  const map = TableMap.get(table)
  if (map.width === 0) return false

  const even = Math.max(cellMinWidth, Math.floor(availableWidth / map.width))
  let changed = false

  for (let row = 0; row < map.height; row++) {
    for (let col = 0; col < map.width; col++) {
      const index = row * map.width + col
      const cellPos = map.map[index]
      // A cell spanning down repeats in the map; only touch its origin.
      if (row && cellPos === map.map[index - map.width]) continue
      const cell = table.nodeAt(cellPos)
      if (!cell) continue
      const span = cell.attrs.colspan || 1
      // Only the cell whose origin is this column owns the width slot.
      if (map.colCount(cellPos) !== col) continue
      const next = Array.from({ length: span }, () => even)
      const current = cell.attrs.colwidth as number[] | null
      if (current && current.length === next.length && current.every((w, i) => w === next[i])) {
        continue
      }
      tr.setNodeMarkup(tablePos + 1 + cellPos, undefined, { ...cell.attrs, colwidth: next })
      changed = true
    }
  }
  return changed
}

export interface TableColumnWidthOptions {
  /** Mirrors Table.configure({ cellMinWidth }). */
  cellMinWidth: number
}

/**
 * Shared with Table.configure so the seeded widths and prosemirror-tables'
 * resize floor agree. 25 (the upstream default) makes a fresh table's columns
 * unusably narrow if seeding ever falls back to the minimum.
 */
export const TABLE_CELL_MIN_WIDTH = 60

export const TableColumnWidth = Extension.create<TableColumnWidthOptions>({
  name: 'tableColumnWidth',

  addOptions() {
    return { cellMinWidth: 25 }
  },

  onCreate() {
    // Existing documents were saved without colwidths, so seed them on load —
    // otherwise their last column stays unresizable forever.
    const { view } = this.editor
    const tr = view.state.tr
    const available = view.dom.clientWidth || 0
    let changed = false

    view.state.doc.descendants((node, pos) => {
      if (node.type.name !== 'table') return true
      if (needsSeeding(node)) {
        if (seedColumnWidths(tr, node, pos, available, this.options.cellMinWidth)) {
          changed = true
        }
      }
      return false
    })

    if (!changed) return
    // Not an edit the user made: keep it out of the undo stack, and out of the
    // dirty/autosave path — the widths it writes are the ones already being
    // rendered, so nothing visibly changes.
    tr.setMeta('addToHistory', false)
    tr.setMeta('preventUpdate', true)
    view.dispatch(tr)
  },
})

export default TableColumnWidth
