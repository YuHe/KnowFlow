import { Extension } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import type { NodeType } from '@tiptap/pm/model'

/**
 * Keeps a paragraph at the end of the document.
 *
 * Without it, a block node can be the document's last child — pasting an image
 * into an empty trailing paragraph does exactly that, because
 * `replaceSelectionWith` replaces the empty paragraph rather than inserting
 * after it. The selection then remaps via `Selection.near`, which finds no
 * textblock past the image and settles on a NodeSelection *on the image*. At
 * that point there is no text caret, and typing replaces the image instead of
 * inserting text — the editor reads as frozen.
 *
 * Gapcursor is the intended fallback for block gaps and is registered by
 * StarterKit, but it cannot carry this on its own: it is only reachable by
 * arrow keys or by clicking a gap that the image's `line-height: 0` wrapper
 * barely leaves, and a Chinese IME composing at a gapcursor has no caret to
 * anchor its candidate window. A guaranteed trailing paragraph means the common
 * case never needs it.
 *
 * The `notAfter` list names the node types that are already fine to end on, so
 * no paragraph is appended after them.
 */

const PLUGIN_KEY = new PluginKey('trailingNode')

export interface TrailingNodeOptions {
  /** Node type to append. */
  node: string
  /** Node type names that do not need a trailing node after them. */
  notAfter: string[]
}

export const TrailingNode = Extension.create<TrailingNodeOptions>({
  name: 'trailingNode',

  addOptions() {
    return {
      node: 'paragraph',
      notAfter: ['paragraph'],
    }
  },

  addProseMirrorPlugins() {
    const { node, notAfter } = this.options
    const allowedAtEnd: NodeType[] = Object.values(this.editor.schema.nodes).filter((type) =>
      notAfter.includes(type.name),
    )

    const needsTrailingNode = (lastChild: { type: NodeType } | null | undefined): boolean =>
      !lastChild || !allowedAtEnd.includes(lastChild.type)

    return [
      new Plugin({
        key: PLUGIN_KEY,
        appendTransaction: (_transactions, _oldState, state) => {
          if (!PLUGIN_KEY.getState(state)) return null
          const type = state.schema.nodes[node]
          if (!type) return null
          return state.tr.insert(state.doc.content.size, type.create())
        },
        state: {
          init: (_config, state) => needsTrailingNode(state.doc.lastChild),
          apply: (tr, value) => (tr.docChanged ? needsTrailingNode(tr.doc.lastChild) : value),
        },
      }),
    ]
  },
})

export default TrailingNode
