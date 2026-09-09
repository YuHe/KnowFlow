import TableRow from '@tiptap/extension-table-row'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import type { EditorState, Transaction } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import type { EditorView } from '@tiptap/pm/view'
import type { Node as PMNode } from '@tiptap/pm/model'

/**
 * Table row height: a `height` attribute on tableRow plus drag-to-resize.
 *
 * @tiptap/extension-table ships column resizing only (prosemirror-tables'
 * columnResizing), so rows are implemented here in the same spirit: hovering
 * the bottom border of a row shows a handle, dragging it resizes the row, and
 * the committed value is persisted as an inline `height` style on the <tr> —
 * the one form that survives sanitization and renders identically in the
 * read-only viewer, which has no ProseMirror to consult.
 *
 * The live drag preview is rendered as a *decoration*, never by mutating the
 * <tr> directly: prosemirror-view's MutationObserver treats attribute changes
 * on managed nodes as dirty and would redraw the row on every mouse move.
 */

/** Rows never shrink below this, so a row can always be grabbed again. */
export const MIN_ROW_HEIGHT = 24

/** Pointer distance (px) from a row's bottom border that arms the resize. */
const EDGE_TOLERANCE = 5

/** Read a pixel row height off a <tr>, ignoring anything unusable. */
export function parseRowHeight(element: HTMLElement): number | null {
  const raw = element.style?.height || element.getAttribute('height') || ''
  // Reject relative units outright: parseInt would silently turn "50%" into 50
  // pixels, shrinking a row that asked to be half the table.
  if (/^\s*-?[\d.]+\s*(%|e[mx]|r[e]?m|v[hw]|ch)\s*$/i.test(raw)) return null
  const value = Number.parseInt(raw, 10)
  return Number.isFinite(value) && value > 0 ? value : null
}

/** Render the `height` attribute back to an inline style (or nothing). */
export function renderRowHeight(attributes: Record<string, unknown>): Record<string, string> {
  const height = attributes.height
  if (typeof height !== 'number' || !Number.isFinite(height) || height <= 0) return {}
  return { style: `height: ${height}px` }
}

interface RowRef {
  pos: number
  node: PMNode
}

/**
 * Every tableRow touched by the current selection.
 *
 * nodesBetween covers the common cases including CellSelection (which spans
 * whole cells across rows); the ancestor walk is the fallback for a collapsed
 * cursor whose zero-width range can sit outside every row's inner range.
 */
function rowsInSelection(state: EditorState): RowRef[] {
  const { from, to, $from } = state.selection
  const rows: RowRef[] = []
  state.doc.nodesBetween(from, to, (node, pos) => {
    if (node.type.name === 'tableRow') rows.push({ pos, node })
  })
  if (rows.length) return rows
  for (let depth = $from.depth; depth > 0; depth -= 1) {
    const node = $from.node(depth)
    if (node.type.name === 'tableRow') return [{ pos: $from.before(depth), node }]
  }
  return []
}

/** Resolve the document position of the row node backing a <tr> element. */
function rowPosFromDom(view: EditorView, rowEl: HTMLElement): number | null {
  try {
    const inside = view.posAtDOM(rowEl, 0)
    if (inside < 0) return null
    const $pos = view.state.doc.resolve(inside)
    for (let depth = $pos.depth; depth > 0; depth -= 1) {
      if ($pos.node(depth).type.name === 'tableRow') return $pos.before(depth)
    }
  } catch {
    // posAtDOM throws for DOM that no longer belongs to the view.
  }
  return null
}

/** The row whose bottom border is under the pointer, if any. */
function rowEdgeUnderPointer(view: EditorView, event: MouseEvent): number | null {
  const target = event.target
  if (!(target instanceof HTMLElement) || !view.dom.contains(target)) return null
  const cell = target.closest('td, th')
  if (!cell) return null
  const cellRect = cell.getBoundingClientRect()
  // Both vertical borders belong to column resizing (prosemirror-tables): it
  // arms a handle from the inner EDGE_TOLERANCE px of a cell's right edge *and*
  // from the same band on its left edge, which maps back to the preceding
  // column's border. Yield both, or this plugin — which runs first, because
  // TipTap reverses extension order — wins the mousedown in the bottom corners
  // of every cell and column resizing never sees it. Only the right edge was
  // yielded before, so the bottom-left 5×5px of each cell silently blocked the
  // preceding column.
  if (Math.abs(event.clientX - cellRect.right) <= EDGE_TOLERANCE) return null
  if (Math.abs(event.clientX - cellRect.left) <= EDGE_TOLERANCE) return null
  const rowEl = cell.closest('tr')
  if (!(rowEl instanceof HTMLElement)) return null
  // The <tr> box, not the cell box: a rowspan cell reaches past its own row and
  // would otherwise arm the wrong row's handle.
  const { bottom } = rowEl.getBoundingClientRect()
  if (Math.abs(event.clientY - bottom) > EDGE_TOLERANCE) return null
  return rowPosFromDom(view, rowEl)
}

interface DragState {
  pos: number
  startY: number
  startHeight: number
  height: number
}

interface ResizeState {
  /** Row with the handle showing (pointer is on its bottom border). */
  hoverPos: number | null
  /** In-progress drag; `height` is the previewed, not-yet-committed value. */
  drag: DragState | null
}

const EMPTY_STATE: ResizeState = { hoverPos: null, drag: null }

export const tableRowResizeKey = new PluginKey<ResizeState>('tableRowResize')

function setRowHeightAt(tr: Transaction, pos: number, height: number | null): void {
  const node = tr.doc.nodeAt(pos)
  if (!node || node.type.name !== 'tableRow') return
  tr.setNodeMarkup(pos, undefined, { ...node.attrs, height })
}

function rowResizePlugin(): Plugin<ResizeState> {
  // Held so an editor torn down mid-drag does not leak window listeners.
  let endDrag: ((commit: boolean) => void) | null = null

  return new Plugin<ResizeState>({
    key: tableRowResizeKey,
    state: {
      init: () => EMPTY_STATE,
      apply(tr, value) {
        let next = value
        // Keep positions valid across concurrent edits (collab, autosave-driven
        // setContent) before layering this transaction's own intent on top.
        if (tr.docChanged) {
          next = {
            hoverPos: next.hoverPos == null ? null : tr.mapping.map(next.hoverPos, -1),
            drag: next.drag ? { ...next.drag, pos: tr.mapping.map(next.drag.pos, -1) } : null,
          }
        }
        const meta = tr.getMeta(tableRowResizeKey) as Partial<ResizeState> | undefined
        return meta ? { ...next, ...meta } : next
      },
    },
    view() {
      return {
        destroy() {
          endDrag?.(false)
        },
      }
    },
    props: {
      decorations(state) {
        const { hoverPos, drag } = tableRowResizeKey.getState(state) ?? EMPTY_STATE
        const pos = drag ? drag.pos : hoverPos
        if (pos == null) return null
        const node = state.doc.nodeAt(pos)
        if (!node || node.type.name !== 'tableRow') return null
        return DecorationSet.create(state.doc, [
          Decoration.node(pos, pos + node.nodeSize, {
            class: drag ? 'row-resize-active row-resizing' : 'row-resize-active',
            // A custom property, not `height`: prosemirror-view removes a
            // decoration's style properties by name when the decoration
            // changes or goes away, which on `height` would also wipe the
            // row's own persisted height.
            ...(drag ? { style: `--row-preview-height: ${drag.height}px;` } : {}),
          }),
        ])
      },
      handleDOMEvents: {
        mousemove(view, event) {
          if (!view.editable) return false
          if (tableRowResizeKey.getState(view.state)?.drag) return false
          const hoverPos = rowEdgeUnderPointer(view, event as MouseEvent)
          if (hoverPos !== (tableRowResizeKey.getState(view.state)?.hoverPos ?? null)) {
            view.dispatch(view.state.tr.setMeta(tableRowResizeKey, { hoverPos }))
          }
          return false
        },
        mouseleave(view) {
          const state = tableRowResizeKey.getState(view.state)
          if (state?.drag || state?.hoverPos == null) return false
          view.dispatch(view.state.tr.setMeta(tableRowResizeKey, { hoverPos: null }))
          return false
        },
        mousedown(view, event) {
          const mouse = event as MouseEvent
          if (mouse.button !== 0 || !view.editable) return false
          const pos = tableRowResizeKey.getState(view.state)?.hoverPos ?? null
          if (pos == null) return false
          const rowDom = view.nodeDOM(pos)
          const rowEl = rowDom instanceof HTMLElement ? rowDom : null
          // offsetHeight, not getBoundingClientRect().height: the edit page puts
          // a CSS `zoom` on an ancestor, so the rect is in screen pixels while
          // the height we write out is in layout pixels. Seeding from the rect
          // made the row jump to zoom×its size the instant it was grabbed. The
          // scale factor below converts the pointer delta the same way
          // ResizableImage does. Rect is the fallback for environments with no
          // layout engine (jsdom), where offsetHeight is always 0.
          const offsetHeight = rowEl?.offsetHeight ?? 0
          const rectHeight = rowEl ? Math.round(rowEl.getBoundingClientRect().height) : 0
          const startHeight = offsetHeight || rectHeight || MIN_ROW_HEIGHT
          const zoomScale =
            offsetHeight > 0 && rectHeight > 0 ? rectHeight / offsetHeight : 1
          // Suppress the text / cell selection this drag would otherwise start.
          // Returning true below also keeps prosemirror-tables from seeing it.
          mouse.preventDefault()

          const finish = (commit: boolean) => {
            if (endDrag !== finish) return
            endDrag = null
            window.removeEventListener('mousemove', onMove)
            window.removeEventListener('mouseup', onUp)
            view.dom.classList.remove('row-resize-cursor')
            // commit === false means the view is going away: its plugin state
            // dies with it, so there is nothing to dispatch — and dispatching
            // into a view mid-teardown is not safe.
            if (!commit) return
            const drag = tableRowResizeKey.getState(view.state)?.drag
            const tr = view.state.tr.setMeta(tableRowResizeKey, EMPTY_STATE)
            if (drag) setRowHeightAt(tr, drag.pos, drag.height)
            view.dispatch(tr)
          }
          const onMove = (moveEvent: MouseEvent) => {
            // The button was released somewhere we never saw the mouseup (off
            // the window, or over a native widget). prosemirror-tables guards
            // its own column drag the same way; without it the row stays glued
            // to the cursor until the next click.
            if (moveEvent.buttons === 0) {
              finish(true)
              return
            }
            const drag = tableRowResizeKey.getState(view.state)?.drag
            if (!drag) return
            const height = Math.max(
              MIN_ROW_HEIGHT,
              Math.round(drag.startHeight + (moveEvent.clientY - drag.startY) / zoomScale),
            )
            if (height === drag.height) return
            view.dispatch(
              view.state.tr.setMeta(tableRowResizeKey, { drag: { ...drag, height } }),
            )
          }
          const onUp = () => finish(true)

          endDrag = finish
          view.dom.classList.add('row-resize-cursor')
          window.addEventListener('mousemove', onMove)
          window.addEventListener('mouseup', onUp)
          view.dispatch(
            view.state.tr.setMeta(tableRowResizeKey, {
              drag: { pos, startY: mouse.clientY, startHeight, height: startHeight },
            }),
          )
          return true
        },
      },
    },
  })
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    tableRowHeight: {
      /** Set (or clear, with null) the height of every row in the selection. */
      setTableRowHeight: (height: number | null) => ReturnType
    }
  }
}

/**
 * Drop-in replacement for @tiptap/extension-table-row that adds a persisted
 * row height plus the drag handle to change it.
 */
export const ResizableTableRow = TableRow.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      height: {
        default: null,
        parseHTML: (element) => parseRowHeight(element as HTMLElement),
        renderHTML: (attributes) => renderRowHeight(attributes),
      },
    }
  },

  addCommands() {
    return {
      setTableRowHeight:
        (height) =>
        ({ state, dispatch }) => {
          const normalized =
            height == null ? null : Math.max(MIN_ROW_HEIGHT, Math.round(height))
          const rows = rowsInSelection(state)
          if (!rows.length) return false
          if (dispatch) {
            const tr = state.tr
            for (const row of rows) setRowHeightAt(tr, row.pos, normalized)
            dispatch(tr)
          }
          return true
        },
    }
  },

  addProseMirrorPlugins() {
    return [rowResizePlugin()]
  },
})

export default ResizableTableRow
