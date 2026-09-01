/**
 * Tests for table row height.
 *
 * Two things have to hold for a row height to be usable at all:
 *  - the editor can set it and emit it as an inline style on the <tr>;
 *  - it survives the HTML→MD→HTML round trip that runs on every save (both
 *    content_md and content_html are persisted) and on every source-mode
 *    toggle. GFM pipe tables cannot express a row height, so such tables must
 *    fall back to raw HTML — the same escape hatch merged cells use.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { Editor } from '@tiptap/core'
import Document from '@tiptap/extension-document'
import Paragraph from '@tiptap/extension-paragraph'
import Text from '@tiptap/extension-text'
import Table from '@tiptap/extension-table'
import TableHeader from '@tiptap/extension-table-header'
import TableCell from '@tiptap/extension-table-cell'
import { htmlToMarkdown } from '@/components/editor/EditorCore'
import { markdownToHtml } from '@/utils/markdown'
import { sanitizeHtml } from '@/utils/sanitize'
import {
  ResizableTableRow,
  MIN_ROW_HEIGHT,
  parseRowHeight,
  renderRowHeight,
} from '@/components/editor/TableRowHeight'

const roundtrip = (html: string) => markdownToHtml(htmlToMarkdown(html), false)

// A bare <tr> is dropped by the HTML parser outside a table, so build the row
// in a real table and hand back the <tr>.
const row = (attrs: string): HTMLElement => {
  const host = document.createElement('div')
  host.innerHTML = `<table><tbody><tr ${attrs}><td>a</td></tr></tbody></table>`
  return host.querySelector('tr') as HTMLElement
}

function makeEditor(content: string): Editor {
  return new Editor({
    element: document.createElement('div'),
    extensions: [
      Document,
      Paragraph,
      Text,
      Table.configure({ resizable: true }),
      ResizableTableRow,
      TableHeader,
      TableCell,
    ],
    content,
  })
}

describe('row height attribute', () => {
  it('parses an inline style height', () => {
    expect(parseRowHeight(row('style="height: 48px"'))).toBe(48)
  })

  it('parses a legacy height attribute', () => {
    expect(parseRowHeight(row('height="60"'))).toBe(60)
  })

  it('ignores a missing or unusable height', () => {
    expect(parseRowHeight(row(''))).toBeNull()
    expect(parseRowHeight(row('style="height: auto"'))).toBeNull()
    expect(parseRowHeight(row('style="height: 0px"'))).toBeNull()
  })

  it('renders a height as an inline style', () => {
    expect(renderRowHeight({ height: 48 })).toEqual({ style: 'height: 48px' })
  })

  it('renders nothing when no height is set', () => {
    expect(renderRowHeight({ height: null })).toEqual({})
    expect(renderRowHeight({})).toEqual({})
  })
})

describe('setTableRowHeight command', () => {
  it('writes the height onto the row containing the cursor', () => {
    const editor = makeEditor(
      '<table><tbody><tr><td>a</td><td>b</td></tr><tr><td>c</td><td>d</td></tr></tbody></table>',
    )
    // Cursor lands in the first cell of the first row.
    editor.commands.setTextSelection(3)
    expect(editor.commands.setTableRowHeight(64)).toBe(true)

    const html = editor.getHTML()
    expect(html).toContain('height: 64px')
    // Only the row under the cursor changed.
    expect(html.match(/height: 64px/g)).toHaveLength(1)
    editor.destroy()
  })

  it('clears the height when passed null', () => {
    const editor = makeEditor(
      '<table><tbody><tr style="height: 64px"><td>a</td></tr></tbody></table>',
    )
    expect(editor.getHTML()).toContain('height: 64px')

    editor.commands.setTextSelection(3)
    editor.commands.setTableRowHeight(null)
    expect(editor.getHTML()).not.toContain('height: 64px')
    editor.destroy()
  })

  it('clamps to the minimum so a row stays grabbable', () => {
    const editor = makeEditor('<table><tbody><tr><td>a</td></tr></tbody></table>')
    editor.commands.setTextSelection(3)
    editor.commands.setTableRowHeight(2)
    expect(editor.getHTML()).toContain(`height: ${MIN_ROW_HEIGHT}px`)
    editor.destroy()
  })

  it('does nothing outside a table', () => {
    const editor = makeEditor('<p>plain text</p>')
    editor.commands.setTextSelection(2)
    expect(editor.commands.setTableRowHeight(48)).toBe(false)
    editor.destroy()
  })

  it('round-trips a height through the editor without losing it', () => {
    const editor = makeEditor(
      '<table><tbody><tr style="height: 72px"><td>a</td></tr></tbody></table>',
    )
    expect(editor.getHTML()).toContain('height: 72px')
    editor.destroy()
  })
})

describe('drag to resize', () => {
  const ROW_TOP = 0
  const ROW_BOTTOM = 40
  const CELL_RIGHT = 100

  /** jsdom has no layout, so hand the plugin the geometry it measures. */
  function stubGeometry() {
    const rowRect = {
      top: ROW_TOP,
      bottom: ROW_BOTTOM,
      left: 0,
      right: CELL_RIGHT,
      width: CELL_RIGHT,
      height: ROW_BOTTOM - ROW_TOP,
      x: 0,
      y: ROW_TOP,
      toJSON: () => ({}),
    } as DOMRect
    const rects = new Map<string, DOMRect>([
      ['TR', rowRect],
      ['TD', rowRect],
      ['TH', rowRect],
    ])
    const original = Element.prototype.getBoundingClientRect
    Element.prototype.getBoundingClientRect = function () {
      return rects.get(this.tagName) ?? original.call(this)
    }
    // prosemirror-tables' cell-selection drag calls posAtCoords, which needs
    // this; jsdom does not implement it. Returning null makes posAtCoords bail,
    // which is what a click outside the editor would do anyway.
    const doc = document as Document & { elementFromPoint?: unknown }
    const originalFromPoint = doc.elementFromPoint
    doc.elementFromPoint = () => null
    return () => {
      Element.prototype.getBoundingClientRect = original
      doc.elementFromPoint = originalFromPoint
    }
  }

  function mountEditor() {
    const element = document.createElement('div')
    document.body.appendChild(element)
    const editor = new Editor({
      element,
      extensions: [
        Document,
        Paragraph,
        Text,
        Table.configure({ resizable: true }),
        ResizableTableRow,
        TableHeader,
        TableCell,
      ],
      content: '<table><tbody><tr><td>a</td><td>b</td></tr></tbody></table>',
    })
    return { editor, element }
  }

  const mouse = (type: string, clientX: number, clientY: number) =>
    new MouseEvent(type, { bubbles: true, cancelable: true, button: 0, clientX, clientY })

  let restoreGeometry: (() => void) | undefined

  beforeEach(() => {
    restoreGeometry = stubGeometry()
  })

  afterEach(() => {
    restoreGeometry?.()
    document.body.innerHTML = ''
  })

  it('arms the handle on the row border and resizes on drag', () => {
    const { editor, element } = mountEditor()
    const cell = element.querySelector('td') as HTMLElement

    // Hover the bottom border, away from the column-resize edge.
    cell.dispatchEvent(mouse('mousemove', 50, ROW_BOTTOM))
    expect(element.querySelector('tr.row-resize-active')).not.toBeNull()

    cell.dispatchEvent(mouse('mousedown', 50, ROW_BOTTOM))
    window.dispatchEvent(mouse('mousemove', 50, ROW_BOTTOM + 50))
    window.dispatchEvent(mouse('mouseup', 50, ROW_BOTTOM + 50))

    // 40px measured + 50px dragged.
    expect(editor.getHTML()).toContain('height: 90px')
    // Affordance cleaned up once the drag is committed.
    expect(element.querySelector('tr.row-resize-active')).toBeNull()
    editor.destroy()
  })

  it('never shrinks a row below the minimum', () => {
    const { editor, element } = mountEditor()
    const cell = element.querySelector('td') as HTMLElement

    cell.dispatchEvent(mouse('mousemove', 50, ROW_BOTTOM))
    cell.dispatchEvent(mouse('mousedown', 50, ROW_BOTTOM))
    window.dispatchEvent(mouse('mousemove', 50, ROW_BOTTOM - 500))
    window.dispatchEvent(mouse('mouseup', 50, ROW_BOTTOM - 500))

    expect(editor.getHTML()).toContain(`height: ${MIN_ROW_HEIGHT}px`)
    editor.destroy()
  })

  it('ignores a pointer that is not on the border', () => {
    const { editor, element } = mountEditor()
    const cell = element.querySelector('td') as HTMLElement

    cell.dispatchEvent(mouse('mousemove', 50, ROW_BOTTOM / 2))
    expect(element.querySelector('tr.row-resize-active')).toBeNull()

    cell.dispatchEvent(mouse('mousedown', 50, ROW_BOTTOM / 2))
    window.dispatchEvent(mouse('mousemove', 50, ROW_BOTTOM + 50))
    window.dispatchEvent(mouse('mouseup', 50, ROW_BOTTOM + 50))
    expect(editor.getHTML()).not.toContain('height:')
    editor.destroy()
  })

  it('yields the bottom-right corner to column resizing', () => {
    const { editor, element } = mountEditor()
    const cell = element.querySelector('td') as HTMLElement

    cell.dispatchEvent(mouse('mousemove', CELL_RIGHT, ROW_BOTTOM))
    expect(element.querySelector('tr.row-resize-active')).toBeNull()
    editor.destroy()
  })

  it('does not arm the handle in a read-only editor', () => {
    const { editor, element } = mountEditor()
    editor.setEditable(false)
    const cell = element.querySelector('td') as HTMLElement

    cell.dispatchEvent(mouse('mousemove', 50, ROW_BOTTOM))
    expect(element.querySelector('tr.row-resize-active')).toBeNull()
    editor.destroy()
  })
})

describe('row height through HTML ↔ Markdown', () => {
  it('emits raw HTML rather than a pipe table', () => {
    const md = htmlToMarkdown(
      '<table><tbody><tr><th>A</th><th>B</th></tr><tr style="height: 48px"><td>1</td><td>2</td></tr></tbody></table>',
    )
    expect(md).toContain('<table')
    expect(md).toContain('height: 48px')
  })

  it('survives a round trip', () => {
    const back = roundtrip(
      '<table><tbody><tr><th>A</th><th>B</th></tr><tr style="height: 48px"><td>1</td><td>2</td></tr></tbody></table>',
    )
    expect(back).toContain('height: 48px')
    expect(back).toContain('A')
    expect(back).toContain('2')
  })

  it('survives repeated round trips', () => {
    let current =
      '<table><tbody><tr style="height: 40px"><td>a</td><td>b</td></tr></tbody></table>'
    for (let i = 0; i < 3; i += 1) current = roundtrip(current)
    expect(current).toContain('height: 40px')
  })

  it('keeps heights and merged cells together', () => {
    const back = roundtrip(
      '<table><tbody><tr style="height: 56px"><td colspan="2">merged</td></tr></tbody></table>',
    )
    expect(back).toContain('height: 56px')
    expect(back).toContain('colspan="2"')
  })

  it('leaves height-free tables as pipe tables', () => {
    const md = htmlToMarkdown(
      '<table><tbody><tr><th>A</th><th>B</th></tr><tr><td>1</td><td>2</td></tr></tbody></table>',
    )
    expect(md).not.toContain('<table')
    expect(md).toContain('| 1 | 2 |')
  })
})

describe('sanitizer', () => {
  it('keeps the row height style', () => {
    const out = sanitizeHtml(
      '<table><tbody><tr style="height: 48px"><td>a</td></tr></tbody></table>',
    )
    expect(out).toContain('height: 48px')
  })

  it('still strips scripts from a row carrying a height', () => {
    const out = sanitizeHtml(
      '<table><tbody><tr style="height: 48px"><td><script>alert(1)</script>a</td></tr></tbody></table>',
    )
    expect(out).not.toContain('<script')
    expect(out).toContain('height: 48px')
  })
})
