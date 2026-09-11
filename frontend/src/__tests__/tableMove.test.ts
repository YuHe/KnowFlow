/**
 * Moving a row or a column.
 *
 * prosemirror-tables has no reorder operation, so this is hand-written — which
 * makes the merged-cell cases the whole risk. The rule is that anything a swap
 * would tear is refused rather than guessed at, and these tests pin down which
 * cases those are.
 */
import { describe, it, expect } from 'vitest'
import { Editor } from '@tiptap/core'
import Document from '@tiptap/extension-document'
import Paragraph from '@tiptap/extension-paragraph'
import Text from '@tiptap/extension-text'
import Table from '@tiptap/extension-table'
import TableRow from '@tiptap/extension-table-row'
import TableCell from '@tiptap/extension-table-cell'
import TableHeader from '@tiptap/extension-table-header'
import History from '@tiptap/extension-history'
import {
  TableMove,
  placeCells,
  canSwapRows,
  canSwapColumns,
  selectionCoords,
} from '@/components/editor/TableMove'

function mount(content: string) {
  const element = document.createElement('div')
  document.body.appendChild(element)
  return new Editor({
    element,
    extensions: [Document, Paragraph, Text, Table, TableRow, TableCell, TableHeader, History, TableMove],
    content,
  })
}

/** A body-only table from rows of cell text. */
const body = (rows: string[][]) =>
  `<table><tbody>${rows
    .map((cells) => `<tr>${cells.map((c) => `<td><p>${c}</p></td>`).join('')}</tr>`)
    .join('')}</tbody></table>`

/** The table node of the mounted document. */
function tableOf(editor: Editor) {
  let found: ReturnType<typeof editor.state.doc.nodeAt> = null
  editor.state.doc.descendants((node) => {
    if (node.type.name === 'table' && !found) found = node
    return !found
  })
  return found!
}

/** Put the caret in the cell holding `text`. */
function caretIn(editor: Editor, text: string) {
  let target = -1
  editor.state.doc.descendants((node, pos) => {
    if (node.isText && node.text === text) target = pos
    return true
  })
  editor.commands.setTextSelection(target)
  return target
}

/** Cell text laid out as a grid, so a swap is easy to read off. */
function grid(editor: Editor): string[][] {
  const table = tableOf(editor)
  const { cells, rows, cols } = placeCells(table)
  const out: string[][] = Array.from({ length: rows }, () => Array(cols).fill(''))
  for (const c of cells) out[c.row][c.col] = c.cell.textContent
  return out
}

describe('placeCells', () => {
  it('reports plain cells at their own coordinates', () => {
    const editor = mount(body([['a', 'b'], ['c', 'd']]))
    const { rows, cols } = placeCells(tableOf(editor))
    expect([rows, cols]).toEqual([2, 2])
    expect(grid(editor)).toEqual([['a', 'b'], ['c', 'd']])
    editor.destroy()
  })

  it('shifts a row that a rowspan reaches into', () => {
    // The second row declares one child, and it belongs to column 1 — not 0.
    const editor = mount(
      '<table><tbody>' +
        '<tr><td rowspan="2"><p>tall</p></td><td><p>b</p></td></tr>' +
        '<tr><td><p>c</p></td></tr>' +
        '</tbody></table>',
    )
    const { cells } = placeCells(tableOf(editor))
    const c = cells.find((x) => x.cell.textContent === 'c')!
    expect([c.row, c.col]).toEqual([1, 1])
    editor.destroy()
  })

  it('counts a colspan as the columns it covers', () => {
    const editor = mount(
      '<table><tbody>' +
        '<tr><td colspan="2"><p>wide</p></td><td><p>b</p></td></tr>' +
        '</tbody></table>',
    )
    const { cols, cells } = placeCells(tableOf(editor))
    expect(cols).toBe(3)
    expect(cells.find((x) => x.cell.textContent === 'b')!.col).toBe(2)
    editor.destroy()
  })
})

describe('what may be swapped', () => {
  it('allows two ordinary adjacent rows', () => {
    const editor = mount(body([['a'], ['b']]))
    expect(canSwapRows(tableOf(editor), 0, 1)).toBe(true)
    editor.destroy()
  })

  it('refuses to run off either end', () => {
    const editor = mount(body([['a'], ['b']]))
    expect(canSwapRows(tableOf(editor), 0, -1)).toBe(false)
    expect(canSwapRows(tableOf(editor), 1, 2)).toBe(false)
    editor.destroy()
  })

  it('refuses when a rowspan covers both rows', () => {
    const editor = mount(
      '<table><tbody>' +
        '<tr><td rowspan="2"><p>tall</p></td><td><p>b</p></td></tr>' +
        '<tr><td><p>c</p></td></tr>' +
        '</tbody></table>',
    )
    expect(canSwapRows(tableOf(editor), 0, 1)).toBe(false)
    editor.destroy()
  })

  it('leaves the header row where it is, and lets nothing above it', () => {
    // Otherwise "move up" on the first body row quietly demotes the headings.
    const editor = mount(
      '<table><tbody>' +
        '<tr><th><p>h</p></th></tr>' +
        '<tr><td><p>a</p></td></tr>' +
        '</tbody></table>',
    )
    expect(canSwapRows(tableOf(editor), 0, 1)).toBe(false)
    expect(canSwapRows(tableOf(editor), 1, 0)).toBe(false)
    editor.destroy()
  })

  it('allows two ordinary adjacent columns', () => {
    const editor = mount(body([['a', 'b'], ['c', 'd']]))
    expect(canSwapColumns(tableOf(editor), 0, 1)).toBe(true)
    editor.destroy()
  })

  it('refuses when a colspan bridges the two columns', () => {
    const editor = mount(
      '<table><tbody>' +
        '<tr><td colspan="2"><p>wide</p></td></tr>' +
        '<tr><td><p>a</p></td><td><p>b</p></td></tr>' +
        '</tbody></table>',
    )
    expect(canSwapColumns(tableOf(editor), 0, 1)).toBe(false)
    editor.destroy()
  })

  it('refuses when a rowspan carries a cell into one of the columns', () => {
    const editor = mount(
      '<table><tbody>' +
        '<tr><td rowspan="2"><p>tall</p></td><td><p>b</p></td></tr>' +
        '<tr><td><p>c</p></td></tr>' +
        '</tbody></table>',
    )
    // Row 1 has no cell of its own at column 0, so there is nothing to exchange.
    expect(canSwapColumns(tableOf(editor), 0, 1)).toBe(false)
    editor.destroy()
  })
})

describe('locating the selection', () => {
  it('reports the grid coordinates of the caret', () => {
    const editor = mount(body([['a', 'b'], ['c', 'd']]))
    caretIn(editor, 'd')
    expect(selectionCoords(editor.state)).toMatchObject({ row: 1, col: 1 })
    editor.destroy()
  })

  it('reports the real column when a rowspan sits to the left', () => {
    const editor = mount(
      '<table><tbody>' +
        '<tr><td rowspan="2"><p>tall</p></td><td><p>b</p></td></tr>' +
        '<tr><td><p>c</p></td></tr>' +
        '</tbody></table>',
    )
    caretIn(editor, 'c')
    // Its child index in the row is 0; its column is 1.
    expect(selectionCoords(editor.state)).toMatchObject({ row: 1, col: 1 })
    editor.destroy()
  })

  it('returns null outside a table', () => {
    const editor = mount('<p>hello</p>')
    expect(selectionCoords(editor.state)).toBeNull()
    editor.destroy()
  })
})

describe('the commands', () => {
  it('moves a row down', () => {
    const editor = mount(body([['a', 'b'], ['c', 'd']]))
    caretIn(editor, 'a')
    expect(editor.commands.moveRowDown()).toBe(true)
    expect(grid(editor)).toEqual([['c', 'd'], ['a', 'b']])
    editor.destroy()
  })

  it('moves a row up', () => {
    const editor = mount(body([['a'], ['b'], ['c']]))
    caretIn(editor, 'c')
    editor.commands.moveRowUp()
    expect(grid(editor)).toEqual([['a'], ['c'], ['b']])
    editor.destroy()
  })

  it('moves a column right and left', () => {
    const editor = mount(body([['a', 'b'], ['c', 'd']]))
    caretIn(editor, 'a')
    expect(editor.commands.moveColumnRight()).toBe(true)
    expect(grid(editor)).toEqual([['b', 'a'], ['d', 'c']])
    editor.commands.moveColumnLeft()
    expect(grid(editor)).toEqual([['a', 'b'], ['c', 'd']])
    editor.destroy()
  })

  it('carries the column width along with the column', () => {
    // colwidth lives on the cells, so a positional swap moves it too — the moved
    // column keeps its own width rather than adopting its neighbour's.
    const editor = mount(
      '<table><tbody><tr>' +
        '<td colwidth="80"><p>a</p></td><td colwidth="240"><p>b</p></td>' +
        '</tr></tbody></table>',
    )
    caretIn(editor, 'a')
    editor.commands.moveColumnRight()
    const html = editor.getHTML()
    expect(html.indexOf('240')).toBeLessThan(html.indexOf('80'))
    editor.destroy()
  })

  it('keeps the caret in the cell that moved', () => {
    const editor = mount(body([['a', 'b'], ['c', 'd']]))
    caretIn(editor, 'a')
    editor.commands.moveRowDown()
    const $pos = editor.state.doc.resolve(editor.state.selection.from)
    expect($pos.parent.textContent).toBe('a')
    editor.destroy()
  })

  it('declines at the edges rather than throwing', () => {
    const editor = mount(body([['a', 'b']]))
    caretIn(editor, 'a')
    expect(editor.commands.moveRowUp()).toBe(false)
    expect(editor.commands.moveRowDown()).toBe(false)
    expect(editor.commands.moveColumnLeft()).toBe(false)
    editor.destroy()
  })

  it('declines outside a table', () => {
    const editor = mount('<p>hello</p>')
    editor.commands.setTextSelection(2)
    expect(editor.commands.moveRowDown()).toBe(false)
    expect(editor.commands.moveColumnRight()).toBe(false)
    editor.destroy()
  })

  it('is a single undo step', () => {
    const editor = mount(body([['a'], ['b']]))
    caretIn(editor, 'a')
    editor.commands.moveRowDown()
    expect(grid(editor)).toEqual([['b'], ['a']])
    editor.commands.undo()
    expect(grid(editor)).toEqual([['a'], ['b']])
    editor.destroy()
  })
})
