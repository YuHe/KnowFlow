/**
 * Deleting a table, and the stale toolbar that made it unreachable.
 *
 * Reported as "I can't delete a table any more — there used to be a delete-table
 * button". Both halves were real:
 *
 *  - the toolbar's table cluster is gated on `editor.isActive('table')`, but the
 *    toolbar is rendered by the page rather than by `useEditor`'s component, so
 *    nothing re-rendered it when the selection moved. Clicking into a table did
 *    not reveal the controls; only a *content* change did, via the page's word
 *    count. See useEditorRevision in EditorToolbar.
 *
 *  - upstream binds Backspace/Delete to `deleteTableWhenAllCellsSelected`, which
 *    needs a CellSelection over every cell. With an ordinary text cursor nothing
 *    happens, and `tableCell` is `isolating` so Backspace cannot escape the cell.
 */
import { describe, it, expect } from 'vitest'
import { Editor } from '@tiptap/core'
import Document from '@tiptap/extension-document'
import Paragraph from '@tiptap/extension-paragraph'
import Text from '@tiptap/extension-text'
import Image from '@tiptap/extension-image'
import Table from '@tiptap/extension-table'
import TableRow from '@tiptap/extension-table-row'
import TableHeader from '@tiptap/extension-table-header'
import TableCell from '@tiptap/extension-table-cell'
import { TableDeleteShortcuts } from '@/components/editor/TableDeleteShortcuts'

function mount(content: string, withShortcuts = true) {
  const element = document.createElement('div')
  document.body.appendChild(element)
  const editor = new Editor({
    element,
    extensions: [
      Document,
      Paragraph,
      Text,
      Image,
      Table.configure({ resizable: true }),
      TableRow,
      TableHeader,
      TableCell,
      ...(withShortcuts ? [TableDeleteShortcuts] : []),
    ],
    content,
  })
  return { editor, element }
}

const EMPTY_TABLE =
  '<p>before</p><table><tbody>' +
  '<tr><td><p></p></td><td><p></p></td></tr>' +
  '<tr><td><p></p></td><td><p></p></td></tr>' +
  '</tbody></table><p>after</p>'

const FILLED_TABLE =
  '<p>before</p><table><tbody>' +
  '<tr><td><p>a</p></td><td><p>b</p></td></tr>' +
  '</tbody></table><p>after</p>'

/** Put the caret inside the table's first cell. */
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

const hasTable = (editor: Editor) => editor.getHTML().includes('<table')

describe('Backspace on an empty table', () => {
  it('removes the table', () => {
    const { editor } = mount(EMPTY_TABLE)
    caretInFirstCell(editor)
    expect(hasTable(editor)).toBe(true)

    const handled = editor.commands.keyboardShortcut('Backspace')
    expect(handled).toBe(true)
    expect(hasTable(editor)).toBe(false)
    editor.destroy()
  })

  it('Delete removes it too', () => {
    const { editor } = mount(EMPTY_TABLE)
    caretInFirstCell(editor)
    editor.commands.keyboardShortcut('Delete')
    expect(hasTable(editor)).toBe(false)
    editor.destroy()
  })

  it('leaves the surrounding paragraphs alone', () => {
    const { editor } = mount(EMPTY_TABLE)
    caretInFirstCell(editor)
    editor.commands.keyboardShortcut('Backspace')
    const html = editor.getHTML()
    expect(html).toContain('before')
    expect(html).toContain('after')
    editor.destroy()
  })

  it('without the extension the table survives — that was the bug', () => {
    const { editor } = mount(EMPTY_TABLE, false)
    caretInFirstCell(editor)
    editor.commands.keyboardShortcut('Backspace')
    expect(hasTable(editor)).toBe(true)
    editor.destroy()
  })
})

describe('Backspace on a table with content', () => {
  it('does NOT remove it — that would be a destructive surprise', () => {
    const { editor } = mount(FILLED_TABLE)
    caretInFirstCell(editor)
    editor.commands.keyboardShortcut('Backspace')
    expect(hasTable(editor)).toBe(true)
    editor.destroy()
  })

  it('treats a cell holding only an image as non-empty', () => {
    const { editor } = mount(
      '<table><tbody><tr><td><img src="/uploads/x.png"></td><td><p></p></td></tr></tbody></table>',
    )
    caretInFirstCell(editor)
    editor.commands.keyboardShortcut('Backspace')
    expect(hasTable(editor)).toBe(true)
    editor.destroy()
  })

  it('treats whitespace-only cells as empty', () => {
    const { editor } = mount(
      '<table><tbody><tr><td><p>   </p></td><td><p></p></td></tr></tbody></table>',
    )
    caretInFirstCell(editor)
    editor.commands.keyboardShortcut('Backspace')
    expect(hasTable(editor)).toBe(false)
    editor.destroy()
  })
})

describe('outside a table', () => {
  it('does not touch a table when the caret is elsewhere', () => {
    // The shortcut must be scoped to the table the caret is actually in.
    // (Character deletion itself cannot be asserted here: jsdom has no
    // beforeinput, so ProseMirror's baseKeymap Backspace is a no-op.)
    const { editor } = mount(EMPTY_TABLE)
    editor.commands.setTextSelection(2) // inside the leading <p>before</p>
    editor.commands.keyboardShortcut('Backspace')
    expect(hasTable(editor)).toBe(true)
    editor.destroy()
  })
})

describe('the toolbar subscribes to selection changes', () => {
  it('EditorToolbar registers a selectionUpdate listener', async () => {
    // Structural guard: the delete-table button lives behind
    // isActive('table'), so without this subscription it is unreachable by
    // clicking into a table.
    const fs = await import('node:fs/promises')
    const path = await import('node:path')
    const src = await fs.readFile(
      path.resolve(process.cwd(), 'src/components/editor/EditorToolbar.tsx'),
      'utf-8',
    )
    expect(src).toContain("editor.on('selectionUpdate'")
    expect(src).toContain("editor.off('selectionUpdate'")
    // Coalesced, so typing does not re-render the toolbar once per keystroke.
    expect(src).toContain('requestAnimationFrame')
  })
})
