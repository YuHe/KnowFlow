import { Extension, findParentNode } from '@tiptap/core'
import { TableMap } from '@tiptap/pm/tables'
import { Plugin, PluginKey } from '@tiptap/pm/state'
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
export function needsSeeding(table: PMNode): boolean {
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
 * Seed every table in `doc` that needs it, into `tr`. Returns true if anything
 * changed.
 */
function seedAllTables(
  tr: Transaction,
  doc: PMNode,
  availableWidth: number,
  cellMinWidth: number,
): boolean {
  let changed = false
  doc.descendants((node, pos) => {
    if (node.type.name !== 'table') return true
    if (needsSeeding(node) && seedColumnWidths(tr, node, pos, availableWidth, cellMinWidth)) {
      changed = true
    }
    // Tables do not nest here, and their cells hold nothing that needs seeding.
    return false
  })
  return changed
}

/**
 * Could any of these transactions have brought a new table into the document?
 *
 * Scanning the whole document on every transaction would mean a walk per
 * keystroke. A table can only *arrive* inside a replacement's slice, so the steps
 * answer the question exactly: `setContent`, a paste and `insertTable` all carry
 * one, while typing carries text. Steps with no slice — `setNodeMarkup`, which is
 * how a colwidth is written — are treated as "no", which is also what stops this
 * from re-triggering on its own output.
 */
function mayHaveAddedTable(transactions: readonly Transaction[]): boolean {
  for (const tr of transactions) {
    if (!tr.docChanged) continue
    for (const step of tr.steps) {
      const slice = (step as { slice?: { content: PMNode } }).slice
      if (!slice) continue
      let found = false
      slice.content.descendants((node) => {
        if (node.type.name === 'table') found = true
        return !found
      })
      if (found) return true
    }
  }
  return false
}

const seedingKey = new PluginKey('tableColumnWidthSeeding')

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

/**
 * Drop every colwidth in the table, so seeding recomputes all of them.
 *
 * seedColumnWidths skips a cell whose width already matches what it would write;
 * to *re*-distribute we have to clear first, or a table that is only slightly
 * lopsided would be left alone.
 */
function clearColumnWidths(tr: Transaction, table: PMNode, tablePos: number): void {
  const map = TableMap.get(table)
  const seen = new Set<number>()
  for (const cellPos of map.map) {
    if (seen.has(cellPos)) continue
    seen.add(cellPos)
    const cell = table.nodeAt(cellPos)
    if (!cell || !cell.attrs.colwidth) continue
    tr.setNodeMarkup(tablePos + 1 + cellPos, undefined, { ...cell.attrs, colwidth: null })
  }
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
    if (!seedAllTables(tr, view.state.doc, view.dom.clientWidth || 0, this.options.cellMinWidth)) {
      return
    }
    // Not an edit the user made: keep it out of the undo stack, and out of the
    // dirty/autosave path — the widths it writes are the ones already being
    // rendered, so nothing visibly changes.
    tr.setMeta('addToHistory', false)
    tr.setMeta('preventUpdate', true)
    view.dispatch(tr)
  },

  addProseMirrorPlugins() {
    const cellMinWidth = this.options.cellMinWidth

    return [
      new Plugin({
        key: seedingKey,

        /**
         * Seed tables that arrive *after* the editor was created.
         *
         * `onCreate` alone was not enough, and that is why the last column went
         * back to being undraggable. The page creates the editor before the
         * document has been fetched and then calls `setContent`, so on every real
         * document `onCreate` ran against an empty doc and every table loaded
         * afterwards stayed unseeded. A table inserted from the toolbar or pasted
         * in was never seeded either. Only the tests passed, because they hand the
         * content to the constructor.
         *
         * Without a colwidth on every column, @tiptap/extension-table writes
         * `min-width` instead of `width` on the <table>, the stylesheet's
         * `width: 100%` wins under `table-layout: fixed`, and the table's right
         * edge is pinned to the container — so the last column's handle has
         * nowhere to move, and dragging a middle border redistributes the
         * remaining columns instead of resizing one.
         */
        appendTransaction: (transactions, _oldState, newState) => {
          if (!mayHaveAddedTable(transactions)) return null
          const tr = newState.tr
          const available = this.editor?.view?.dom?.clientWidth || 0
          if (!seedAllTables(tr, newState.doc, available, cellMinWidth)) return null
          // The user's own transaction is already in history and has already
          // marked the document dirty; this one only fills in widths that match
          // what is on screen.
          tr.setMeta('addToHistory', false)
          tr.setMeta('preventUpdate', true)
          return tr
        },
      }),
    ]
  },

  addCommands() {
    return {
      /**
       * Give every column of the table containing the selection an equal width.
       *
       * 飞书 calls this 均分列宽 and reaches for it constantly, because dragging
       * one border inevitably leaves the rest lopsided — and until now a botched
       * drag could only be undone. Unlike seeding on load, this IS a user edit,
       * so it goes through history normally.
       */
      distributeTableColumns:
        () =>
        ({ state, tr, dispatch, editor }) => {
          const found = findParentNode((node) => node.type.name === 'table')(state.selection)
          if (!found) return false
          if (!dispatch) return true

          const available = editor.view.dom.clientWidth || 0
          // Force a rewrite even where a column already happens to be even.
          clearColumnWidths(tr, found.node, found.pos)
          const table = tr.doc.nodeAt(found.pos)
          if (!table) return false
          seedColumnWidths(tr, table, found.pos, available, this.options.cellMinWidth)
          return true
        },
    }
  },
})

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    tableColumnWidth: {
      /** Equalise the column widths of the table containing the selection. */
      distributeTableColumns: () => ReturnType
    }
  }
}

export default TableColumnWidth
