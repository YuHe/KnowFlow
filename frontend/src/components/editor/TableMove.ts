import { Extension } from '@tiptap/core'
import { findParentNode } from '@tiptap/core'
import type { CommandProps } from '@tiptap/core'
import type { Node as PMNode } from '@tiptap/pm/model'
import { TextSelection } from '@tiptap/pm/state'
import type { EditorState } from '@tiptap/pm/state'

/**
 * Moving a row or a column one step.
 *
 * 飞书 and Notion both let you drag a row or column to a new place; prosemirror-
 * tables ships `addRow`/`deleteRow` and nothing that reorders. So this is written
 * by hand, and deliberately restricted to a single step in each direction —
 * repeated steps compose, and a one-step swap is the only case whose behaviour
 * with merged cells can be stated precisely.
 *
 * ## Merged cells
 *
 * A swap that tears a merged cell in half has no correct result, so the commands
 * refuse instead of guessing:
 *
 * - a **row** swap is refused when any cell's `rowspan` covers both rows;
 * - a **column** swap is refused unless, in every row, each of the two columns
 *   begins its own cell — which rules out a `colspan` bridging them and a cell
 *   carried down from above by `rowspan`.
 *
 * Returning false leaves the menu item disabled rather than silently producing a
 * broken table, which is what a position-mapping approach would have done.
 *
 * ## The header row
 *
 * A row of `tableHeader` cells stays where it is, and nothing may be moved above
 * it. 飞书 pins its header the same way; without this, "move up" on row 1 would
 * quietly demote the headings to body content.
 */

interface Placed {
  cell: PMNode
  /** Index of the row the cell is declared in. */
  row: number
  /** Index of the column the cell starts at, accounting for cells above it. */
  col: number
  rowspan: number
  colspan: number
}

const span = (cell: PMNode, name: 'rowspan' | 'colspan'): number => {
  const raw = Number(cell.attrs[name])
  return Number.isFinite(raw) && raw > 0 ? raw : 1
}

/**
 * Lay the table out on a grid so every cell knows its real column.
 *
 * Cell children are not aligned with columns: a `rowspan` above pushes later
 * rows' children to the right, and a `colspan` consumes several columns from one
 * child. Reordering without this produces a table that is subtly one column out.
 */
export function placeCells(table: PMNode): { cells: Placed[]; rows: number; cols: number } {
  const cells: Placed[] = []
  const occupied = new Set<string>()
  const rows = table.childCount
  let cols = 0

  for (let row = 0; row < rows; row++) {
    const tableRow = table.child(row)
    let col = 0
    for (let i = 0; i < tableRow.childCount; i++) {
      const cell = tableRow.child(i)
      while (occupied.has(`${row}:${col}`)) col++
      const rowspan = span(cell, 'rowspan')
      const colspan = span(cell, 'colspan')
      cells.push({ cell, row, col, rowspan, colspan })
      for (let r = row; r < row + rowspan; r++) {
        for (let c = col; c < col + colspan; c++) occupied.add(`${r}:${c}`)
      }
      col += colspan
    }
    cols = Math.max(cols, col)
  }

  return { cells, rows, cols }
}

/** A row whose every cell is a header cell. */
function isHeaderRow(row: PMNode): boolean {
  if (row.childCount === 0) return false
  for (let i = 0; i < row.childCount; i++) {
    if (row.child(i).type.name !== 'tableHeader') return false
  }
  return true
}

export function canSwapRows(table: PMNode, a: number, b: number): boolean {
  if (a < 0 || b < 0 || a >= table.childCount || b >= table.childCount) return false
  if (isHeaderRow(table.child(a)) || isHeaderRow(table.child(b))) return false
  const { cells } = placeCells(table)
  const [low, high] = a < b ? [a, b] : [b, a]
  return !cells.some((c) => c.row <= low && c.row + c.rowspan - 1 >= high)
}

export function canSwapColumns(table: PMNode, a: number, b: number): boolean {
  const { cells, rows, cols } = placeCells(table)
  if (a < 0 || b < 0 || a >= cols || b >= cols || a === b) return false
  for (let row = 0; row < rows; row++) {
    const inRow = cells.filter((c) => c.row === row)
    for (const col of [a, b]) {
      const own = inRow.find((c) => c.col === col)
      // No cell declared here (carried down by a rowspan), or it reaches past
      // the column it starts in.
      if (!own || own.colspan !== 1 || own.rowspan !== 1) return false
    }
  }
  return true
}

/** The table containing the selection, with its position. */
function selectedTable(state: EditorState) {
  return findParentNode((node) => node.type.name === 'table')(state.selection)
}

/** Which row and column the selection sits in, on the laid-out grid. */
export function selectionCoords(
  state: EditorState,
): { table: PMNode; tablePos: number; row: number; col: number } | null {
  const found = selectedTable(state)
  if (!found) return null
  const cellFound = findParentNode((node) => node.type.name === 'tableCell' || node.type.name === 'tableHeader')(
    state.selection,
  )
  if (!cellFound) return null

  const { cells } = placeCells(found.node)
  // Positions of the cells, walked in the same order placeCells visits them.
  let offset = found.start
  let index = 0
  for (let row = 0; row < found.node.childCount; row++) {
    const tableRow = found.node.child(row)
    let cursor = offset + 1
    for (let i = 0; i < tableRow.childCount; i++) {
      const cell = tableRow.child(i)
      if (cursor === cellFound.pos) {
        const placed = cells[index]
        return { table: found.node, tablePos: found.pos, row: placed.row, col: placed.col }
      }
      cursor += cell.nodeSize
      index++
    }
    offset += tableRow.nodeSize
  }
  return null
}

/** Rebuild `table` with rows `a` and `b` exchanged. */
function withRowsSwapped(table: PMNode, a: number, b: number): PMNode {
  const rows: PMNode[] = []
  for (let i = 0; i < table.childCount; i++) rows.push(table.child(i))
  ;[rows[a], rows[b]] = [rows[b], rows[a]]
  return table.type.create(table.attrs, rows, table.marks)
}

/**
 * Rebuild `table` with columns `a` and `b` exchanged.
 *
 * Only reached once `canSwapColumns` has established that both columns hold their
 * own single-span cell in every row, so a positional swap of two children is
 * exactly the right edit.
 */
function withColumnsSwapped(table: PMNode, a: number, b: number): PMNode {
  const { cells } = placeCells(table)
  const rows: PMNode[] = []
  let index = 0

  for (let row = 0; row < table.childCount; row++) {
    const tableRow = table.child(row)
    const children: PMNode[] = []
    const columnOf = new Map<number, number>()
    for (let i = 0; i < tableRow.childCount; i++) {
      children.push(tableRow.child(i))
      columnOf.set(cells[index].col, i)
      index++
    }
    const ia = columnOf.get(a)
    const ib = columnOf.get(b)
    if (ia !== undefined && ib !== undefined) {
      ;[children[ia], children[ib]] = [children[ib], children[ia]]
    }
    rows.push(tableRow.type.create(tableRow.attrs, children, tableRow.marks))
  }

  return table.type.create(table.attrs, rows, table.marks)
}

/** Document position of the cell occupying grid coordinates (row, col). */
function cellPosAt(table: PMNode, tableStart: number, row: number, col: number): number | null {
  const { cells } = placeCells(table)
  let offset = tableStart
  let index = 0
  for (let r = 0; r < table.childCount; r++) {
    const tableRow = table.child(r)
    let cursor = offset + 1
    for (let i = 0; i < tableRow.childCount; i++) {
      const placed = cells[index]
      if (placed.row === row && placed.col === col) return cursor
      cursor += tableRow.child(i).nodeSize
      index++
    }
    offset += tableRow.nodeSize
  }
  return null
}

type Axis = 'row' | 'column'

interface MoveResult {
  table: PMNode
  tablePos: number
  /** Where the caret should land: grid coordinates after the swap. */
  row: number
  col: number
}

/** Work out the swap without touching the document; null when it is not allowed. */
export function planMove(state: EditorState, axis: Axis, delta: -1 | 1): MoveResult | null {
  const at = selectionCoords(state)
  if (!at) return null
  const { table, tablePos, row, col } = at

  if (axis === 'row') {
    const target = row + delta
    if (!canSwapRows(table, row, target)) return null
    return { table: withRowsSwapped(table, row, target), tablePos, row: target, col }
  }

  const target = col + delta
  if (!canSwapColumns(table, col, target)) return null
  return { table: withColumnsSwapped(table, col, target), tablePos, row, col: target }
}

export const TableMove = Extension.create({
  name: 'tableMove',

  addCommands() {
    const move =
      (axis: Axis, delta: -1 | 1) =>
      ({ state, tr, dispatch }: CommandProps) => {
        const plan = planMove(state, axis, delta)
        if (!plan) return false
        if (dispatch) {
          const start = plan.tablePos
          const existing = state.doc.nodeAt(start)
          if (!existing) return false
          tr.replaceWith(start, start + existing.nodeSize, plan.table)
          const caret = cellPosAt(plan.table, start + 1, plan.row, plan.col)
          // +1 lands inside the cell's first child rather than on the cell.
          if (caret !== null) tr.setSelection(TextSelection.near(tr.doc.resolve(caret + 1)))
        }
        return true
      }

    return {
      moveRowUp: () => move('row', -1),
      moveRowDown: () => move('row', 1),
      moveColumnLeft: () => move('column', -1),
      moveColumnRight: () => move('column', 1),
    }
  },
})

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    tableMove: {
      moveRowUp: () => ReturnType
      moveRowDown: () => ReturnType
      moveColumnLeft: () => ReturnType
      moveColumnRight: () => ReturnType
    }
  }
}

export default TableMove

