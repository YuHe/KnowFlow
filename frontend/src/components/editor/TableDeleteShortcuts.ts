import { Extension } from '@tiptap/core'
import { findParentNode } from '@tiptap/core'
import type { Node as PMNode } from '@tiptap/pm/model'

/**
 * Keyboard removal of a table.
 *
 * @tiptap/extension-table binds Backspace/Delete to
 * `deleteTableWhenAllCellsSelected`, which — as the name says — only fires when a
 * CellSelection covers every cell. A user with an ordinary text cursor in a cell
 * gets nothing, and `tableCell` is `isolating: true` so Backspace cannot escape
 * the cell either. Combined with the toolbar's delete-table button being hidden
 * unless the cursor is already known to be inside a table, a table could end up
 * effectively undeletable.
 *
 * This adds the path people actually try: Backspace (or Delete) in a table that
 * has no content removes the whole table. Deliberately limited to the empty case
 * — deleting a table full of content from a single keypress would be a
 * destructive surprise, and that is what selecting the cells or the toolbar
 * button is for.
 */

/** Is every cell of this table free of text and of any non-empty node? */
function isTableEmpty(table: PMNode): boolean {
  let empty = true
  table.descendants((node) => {
    if (!empty) return false
    if (node.isText) {
      if ((node.text ?? '').trim() !== '') empty = false
      return false
    }
    // A leaf that is not text carries content of its own: an image, a mermaid
    // placeholder, a horizontal rule.
    if (node.isLeaf && node.type.name !== 'hardBreak') {
      empty = false
      return false
    }
    return true
  })
  return empty
}

export const TableDeleteShortcuts = Extension.create({
  name: 'tableDeleteShortcuts',

  addKeyboardShortcuts() {
    const removeEmptyTable = () => {
      const { editor } = this
      if (!editor.isEditable) return false
      const found = findParentNode((node) => node.type.name === 'table')(editor.state.selection)
      if (!found) return false
      if (!isTableEmpty(found.node)) return false
      return editor.commands.deleteTable()
    }

    return {
      Backspace: removeEmptyTable,
      Delete: removeEmptyTable,
    }
  },
})

export default TableDeleteShortcuts
