/**
 * Cell background colour and vertical alignment.
 *
 * Both are table-stakes — 飞书 and Notion each offer cell fill, and 飞书 offers
 * vertical alignment — and neither exists in the stock TipTap table.
 * `setCellAttribute` was always available; the attributes for it to write to were
 * not.
 *
 * The round trip matters as much as the attribute: a cell attribute that does not
 * survive HTML→MD→HTML is lost on the next autosave, which is the trap merged
 * cells and row heights each fell into before.
 */
import { describe, it, expect } from 'vitest'
import { Editor } from '@tiptap/core'
import Document from '@tiptap/extension-document'
import Paragraph from '@tiptap/extension-paragraph'
import Text from '@tiptap/extension-text'
import Table from '@tiptap/extension-table'
import TableRow from '@tiptap/extension-table-row'
import { StyledTableCell, StyledTableHeader } from '@/components/editor/TableCellAttributes'
import { TableColumnWidth, TABLE_CELL_MIN_WIDTH } from '@/components/editor/TableColumnWidth'
import { htmlToMarkdown } from '@/components/editor/EditorCore'
import { markdownToHtml } from '@/utils/markdown'
import { sanitizeForLightDom } from '@/utils/sanitize'

function mount(content: string) {
  const element = document.createElement('div')
  document.body.appendChild(element)
  const editor = new Editor({
    element,
    extensions: [
      Document,
      Paragraph,
      Text,
      Table.configure({ resizable: true }),
      TableRow,
      StyledTableHeader,
      StyledTableCell,
      TableColumnWidth.configure({ cellMinWidth: TABLE_CELL_MIN_WIDTH }),
    ],
    content,
  })
  return editor
}

/**
 * The DOM normalises a hex colour in a style attribute to `rgb(...)`, so a
 * serialized document may carry either form. Assert on the colour, not on its
 * spelling.
 */
function expectBackground(html: string, hex: string) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16))
  const rgb = `rgb(${r}, ${g}, ${b})`
  expect(html.includes(`background-color: ${hex}`) || html.includes(`background-color: ${rgb}`)).toBe(
    true,
  )
}

const TABLE = '<table><tbody><tr><td><p>a</p></td><td><p>b</p></td></tr></tbody></table>'

/** Put the caret in the first cell. */
function caretInFirstCell(editor: Editor) {
  let pos = -1
  editor.state.doc.descendants((node, p) => {
    if (pos === -1 && (node.type.name === 'tableCell' || node.type.name === 'tableHeader')) {
      pos = p + 2
      return false
    }
    return true
  })
  editor.commands.setTextSelection(pos)
}

describe('cell background colour', () => {
  it('renders as an inline style', () => {
    const editor = mount(TABLE)
    caretInFirstCell(editor)
    editor.commands.setCellAttribute('backgroundColor', '#dbeafe')
    expectBackground(editor.getHTML(), '#dbeafe')
    editor.destroy()
  })

  it('parses back from stored HTML', () => {
    const editor = mount(
      '<table><tbody><tr><td style="background-color: #fee2e2"><p>a</p></td></tr></tbody></table>',
    )
    expectBackground(editor.getHTML(), '#fee2e2')
    editor.destroy()
  })

  it('can be cleared', () => {
    const editor = mount(TABLE)
    caretInFirstCell(editor)
    editor.commands.setCellAttribute('backgroundColor', '#dbeafe')
    editor.commands.setCellAttribute('backgroundColor', null)
    expect(editor.getHTML()).not.toContain('background-color')
    editor.destroy()
  })

  it('rejects a value that is not a colour', () => {
    // Stored HTML is user-writable; an attribute rendered straight into a style
    // attribute must not become an injection point.
    const editor = mount(
      '<table><tbody><tr><td style="background-color: url(javascript:alert(1))"><p>a</p></td></tr></tbody></table>',
    )
    expect(editor.getHTML()).not.toContain('javascript')
    editor.destroy()
  })
})

describe('vertical alignment', () => {
  it('renders as an inline style', () => {
    const editor = mount(TABLE)
    caretInFirstCell(editor)
    editor.commands.setCellAttribute('verticalAlign', 'middle')
    expect(editor.getHTML()).toContain('vertical-align: middle')
    editor.destroy()
  })

  it('parses the legacy valign attribute too', () => {
    const editor = mount('<table><tbody><tr><td valign="bottom"><p>a</p></td></tr></tbody></table>')
    expect(editor.getHTML()).toContain('vertical-align: bottom')
    editor.destroy()
  })

  it('ignores a value outside the allowed set', () => {
    const editor = mount(
      '<table><tbody><tr><td style="vertical-align: super"><p>a</p></td></tr></tbody></table>',
    )
    expect(editor.getHTML()).not.toContain('vertical-align')
    editor.destroy()
  })
})

describe('both attributes together', () => {
  it('compose into a single style attribute', () => {
    const editor = mount(TABLE)
    caretInFirstCell(editor)
    editor.commands.setCellAttribute('backgroundColor', '#dcfce7')
    editor.commands.setCellAttribute('verticalAlign', 'bottom')
    const html = editor.getHTML()
    expectBackground(html, '#dcfce7')
    expect(html).toContain('vertical-align: bottom')
    // mergeAttributes merges `style` per property rather than overwriting.
    expect((html.match(/style="[^"]*"/g) ?? []).some((s) => s.includes('background-color') && s.includes('vertical-align'))).toBe(true)
    editor.destroy()
  })
})

describe('surviving the save round trip', () => {
  it('keeps both attributes through HTML → Markdown → HTML', () => {
    const editor = mount(TABLE)
    caretInFirstCell(editor)
    editor.commands.setCellAttribute('backgroundColor', '#fef9c3')
    editor.commands.setCellAttribute('verticalAlign', 'top')
    const html = editor.getHTML()

    // A TipTap table always takes the raw-HTML path (every cell holds a <p>), so
    // the attributes ride along verbatim.
    const md = htmlToMarkdown(html)
    expectBackground(md, '#fef9c3')

    const back = markdownToHtml(md, false)
    expectBackground(back, '#fef9c3')
    expect(back).toContain('vertical-align: top')
    editor.destroy()
  })

  it('survives the read-view sanitizer', () => {
    const html =
      '<table><tbody><tr><td style="background-color: #dbeafe; vertical-align: middle"><p>a</p></td></tr></tbody></table>'
    const clean = sanitizeForLightDom(html)
    expect(clean).toContain('background-color')
    expect(clean).toContain('vertical-align')
  })
})

describe('distributeTableColumns', () => {
  it('equalises columns that were left lopsided by a drag', () => {
    const editor = mount(
      '<table><tbody><tr>' +
        '<td colwidth="300"><p>a</p></td>' +
        '<td colwidth="80"><p>b</p></td>' +
        '<td colwidth="120"><p>c</p></td>' +
        '</tr></tbody></table>',
    )
    caretInFirstCell(editor)
    editor.commands.distributeTableColumns()

    const widths: number[] = []
    editor.state.doc.descendants((node) => {
      if (node.type.name === 'tableCell' || node.type.name === 'tableHeader') {
        const w = node.attrs.colwidth as number[] | null
        if (w) widths.push(w[0])
      }
      return true
    })
    expect(widths).toHaveLength(3)
    expect(new Set(widths).size).toBe(1)
    editor.destroy()
  })

  it('declines outside a table', () => {
    const editor = mount('<p>hello</p>')
    editor.commands.setTextSelection(2)
    expect(editor.commands.distributeTableColumns()).toBe(false)
    editor.destroy()
  })

  it('is an ordinary edit, so it can be undone', () => {
    // Unlike the load-time seeding, this one must go through history.
    const editor = mount(
      '<table><tbody><tr><td colwidth="300"><p>a</p></td><td colwidth="80"><p>b</p></td></tr></tbody></table>',
    )
    caretInFirstCell(editor)
    const before = editor.getHTML()
    editor.commands.distributeTableColumns()
    expect(editor.getHTML()).not.toBe(before)
    editor.destroy()
  })
})

describe('sticky header row', () => {
  it('is declared for both surfaces, and the editor wrapper is capped so it can stick', async () => {
    // The editor's .tableWrapper has `overflow-x: auto`, which per the CSS
    // overflow spec makes the computed `overflow-y` auto as well — so the wrapper
    // becomes the scrollport for anything sticky inside it. Without a height cap
    // it never scrolls vertically and the header rides away with the content.
    // Measured in Chrome; asserted structurally here because jsdom has no layout.
    const fs = await import('node:fs/promises')
    const path = await import('node:path')
    const css = await fs.readFile(path.resolve(process.cwd(), 'src/index.css'), 'utf-8')

    const ruleBodies = (selector: string): string[] => {
      const out: string[] = []
      let from = 0
      for (;;) {
        const at = css.indexOf(selector, from)
        if (at === -1) break
        const open = css.indexOf('{', at)
        const close = css.indexOf('}', open)
        out.push(css.slice(open, close))
        from = close
      }
      return out
    }

    expect(ruleBodies('.ProseMirror table th {').some((b) => b.includes('position: sticky'))).toBe(
      true,
    )
    expect(ruleBodies('.doc-content table th {').some((b) => b.includes('position: sticky'))).toBe(
      true,
    )

    const wrapper = css.slice(css.indexOf('.ProseMirror .tableWrapper {'))
    expect(wrapper.slice(0, 400)).toContain('max-height')
  })
})
