/**
 * Column widths must exist for the last column to be resizable.
 *
 * prosemirror-tables keeps a column's width in a `colwidth` attribute on its
 * cells, and @tiptap/extension-table only writes an inline `width: <sum>px` on
 * the <table> once every column has one. Until then it writes `min-width` only,
 * so the stylesheet's `width: 100%` governs and — under `table-layout: fixed` —
 * pins the table's right edge to the container. That edge *is* the last column's
 * resize handle, so it could not be dragged until some other column had been
 * resized. Seeding removes the asymmetry.
 */
import { describe, it, expect } from 'vitest'
import { Editor } from '@tiptap/core'
import Document from '@tiptap/extension-document'
import Paragraph from '@tiptap/extension-paragraph'
import Text from '@tiptap/extension-text'
import History from '@tiptap/extension-history'
import Table from '@tiptap/extension-table'
import TableRow from '@tiptap/extension-table-row'
import TableHeader from '@tiptap/extension-table-header'
import TableCell from '@tiptap/extension-table-cell'
import { TableColumnWidth, TABLE_CELL_MIN_WIDTH } from '@/components/editor/TableColumnWidth'

const TABLE_HTML =
  '<table><tbody>' +
  '<tr><th><p>A</p></th><th><p>B</p></th><th><p>C</p></th></tr>' +
  '<tr><td><p>1</p></td><td><p>2</p></td><td><p>3</p></td></tr>' +
  '</tbody></table>'

/** TipTap defers its `create` event by a macrotask, so seeding lands after it. */
const created = () => new Promise((resolve) => setTimeout(resolve, 0))

function mount(html: string, withSeeding = true) {
  const element = document.createElement('div')
  document.body.appendChild(element)
  const editor = new Editor({
    element,
    extensions: [
      Document,
      Paragraph,
      Text,
      History,
      Table.configure({ resizable: true, cellMinWidth: TABLE_CELL_MIN_WIDTH }),
      TableRow,
      TableHeader,
      TableCell,
      ...(withSeeding
        ? [TableColumnWidth.configure({ cellMinWidth: TABLE_CELL_MIN_WIDTH })]
        : []),
    ],
    content: html,
  })
  return { editor, element }
}

/** Every colwidth in document order. */
function colwidths(editor: Editor): (number[] | null)[] {
  const out: (number[] | null)[] = []
  editor.state.doc.descendants((node) => {
    if (node.type.name === 'tableCell' || node.type.name === 'tableHeader') {
      out.push((node.attrs.colwidth as number[] | null) ?? null)
    }
    return true
  })
  return out
}

describe('TableColumnWidth seeding', () => {
  it('gives every cell a colwidth on load', async () => {
    const { editor } = mount(TABLE_HTML)
    await created()
    const widths = colwidths(editor)
    expect(widths).toHaveLength(6)
    for (const w of widths) {
      expect(w).not.toBeNull()
      expect(w![0]).toBeGreaterThanOrEqual(TABLE_CELL_MIN_WIDTH)
    }
    editor.destroy()
  })

  it('makes the table fixed-width, which is what detaches it from the container', async () => {
    // TipTap writes an inline `width:` only when every column has a colwidth;
    // that inline width is what lets the last column grow.
    const { editor } = mount(TABLE_HTML)
    await created()
    expect(editor.getHTML()).toMatch(/<table[^>]*style="[^"]*width:/)
    expect(editor.getHTML()).not.toMatch(/<table[^>]*style="[^"]*min-width:/)
    editor.destroy()
  })

  it('leaves a table alone once it already has widths', async () => {
    const seeded =
      '<table><tbody><tr>' +
      '<th colwidth="120"><p>A</p></th><th colwidth="80"><p>B</p></th>' +
      '</tr></tbody></table>'
    const { editor } = mount(seeded)
    await created()
    const widths = colwidths(editor)
    expect(widths[0]).toEqual([120])
    expect(widths[1]).toEqual([80])
    editor.destroy()
  })

  it('without the extension a table has no widths at all — the bug', async () => {
    const { editor } = mount(TABLE_HTML, false)
    await created()
    expect(colwidths(editor).every((w) => w === null)).toBe(true)
    // And the table therefore carries min-width, not width, so CSS `width:100%`
    // wins and pins the right edge.
    expect(editor.getHTML()).toMatch(/<table[^>]*style="[^"]*min-width:/)
    editor.destroy()
  })

  it('does not put the seeding into the undo stack', async () => {
    const { editor } = mount(TABLE_HTML)
    await created()
    const before = editor.getHTML()
    editor.commands.undo()
    expect(editor.getHTML()).toBe(before)
    editor.destroy()
  })

  it('handles a table with a merged cell without corrupting it', async () => {
    const merged =
      '<table><tbody>' +
      '<tr><td colspan="2"><p>wide</p></td><td><p>c</p></td></tr>' +
      '<tr><td><p>1</p></td><td><p>2</p></td><td><p>3</p></td></tr>' +
      '</tbody></table>'
    const { editor } = mount(merged)
    await created()
    const html = editor.getHTML()
    expect(html).toContain('colspan="2"')
    expect(html).toContain('wide')
    // The spanning cell owns two width slots.
    const widths = colwidths(editor).filter((w) => w !== null)
    expect(widths.some((w) => w!.length === 2)).toBe(true)
    editor.destroy()
  })
})
