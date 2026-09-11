import { Node, mergeAttributes } from '@tiptap/core'
import { Plugin } from '@tiptap/pm/state'
import { TextSelection } from '@tiptap/pm/state'
import { findParentNode } from '@tiptap/core'

/**
 * Collapsible block — 飞书's 折叠块, Notion's toggle.
 *
 * Built on real `<details>`/`<summary>` rather than a div-and-JavaScript
 * imitation, which is what makes it work everywhere the document is only *read*:
 * the viewer, a share link, a public knowledge base and an exported PDF all get a
 * working collapse with no script at all. A custom widget would have needed a
 * rendering pass in each of those places.
 *
 * ## Three nodes, not one
 *
 * `details` holds exactly a `detailsSummary` and a `detailsContent`. Modelling the
 * summary as "the first paragraph" would have been less code and would have made
 * every ordinary paragraph edit able to destroy the structure.
 *
 * ## Why the toggle is intercepted
 *
 * A `<summary>` toggles its parent's `open` attribute as the default action of a
 * click — a DOM mutation on a node ProseMirror manages, which it then fights, and
 * whose result is not in the document. So the click is cancelled and the same
 * change is made as a transaction, leaving ProseMirror authoritative.
 *
 * The marker is drawn by us (`index.css` hides the native one), and a click
 * counts as hitting it when it lands within MARKER_WIDTH of the summary's leading
 * edge — otherwise a click on the summary text places the caret, because editing
 * the title is the more common intent. A collapsed block is the exception: it has
 * no visible text to aim at, so any click on it expands it.
 */

/** Width of the disclosure triangle, in px. Must match `index.css`. */
export const MARKER_WIDTH = 22

export const DetailsSummary = Node.create({
  name: 'detailsSummary',
  content: 'inline*',
  defining: true,
  // Never let a paste or an input rule turn the title into something else.
  isolating: true,

  parseHTML() {
    return [{ tag: 'summary' }]
  },

  renderHTML({ HTMLAttributes }) {
    return ['summary', mergeAttributes(HTMLAttributes), 0]
  },
})

export const DetailsContent = Node.create({
  name: 'detailsContent',
  content: 'block+',
  defining: true,

  parseHTML() {
    return [{ tag: 'div[data-type="detailsContent"]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'detailsContent' }), 0]
  },
})

export const Details = Node.create({
  name: 'details',
  group: 'block',
  content: 'detailsSummary detailsContent',
  defining: true,

  addAttributes() {
    return {
      open: {
        default: true,
        // `open` is a boolean attribute: present means open, whatever its value.
        parseHTML: (element) => element.hasAttribute('open'),
        renderHTML: (attributes) => (attributes.open ? { open: '' } : {}),
      },
    }
  },

  parseHTML() {
    return [{ tag: 'details' }]
  },

  renderHTML({ HTMLAttributes }) {
    return ['details', mergeAttributes(HTMLAttributes), 0]
  },

  addCommands() {
    return {
      setDetails:
        () =>
        ({ state, chain }) => {
          if (findParentNode((node) => node.type.name === this.name)(state.selection)) return false
          const { from, to } = state.selection
          return chain()
            .insertContentAt(
              { from, to },
              {
                type: this.name,
                attrs: { open: true },
                content: [
                  { type: 'detailsSummary', content: [{ type: 'text', text: '折叠标题' }] },
                  { type: 'detailsContent', content: [{ type: 'paragraph' }] },
                ],
              },
            )
            .run()
        },

      toggleDetailsOpen:
        () =>
        ({ state, tr, dispatch }) => {
          const found = findParentNode((node) => node.type.name === this.name)(state.selection)
          if (!found) return false
          if (dispatch) tr.setNodeMarkup(found.pos, undefined, { ...found.node.attrs, open: !found.node.attrs.open })
          return true
        },
    }
  },

  addKeyboardShortcuts() {
    return {
      // Enter in the title moves into the body. Splitting the summary would
      // otherwise try to create a second one, which the schema forbids, and the
      // key would appear to do nothing.
      Enter: () => {
        const { state } = this.editor
        const summary = findParentNode((node) => node.type.name === 'detailsSummary')(state.selection)
        if (!summary) return false
        const details = findParentNode((node) => node.type.name === this.name)(state.selection)
        if (!details) return false
        const contentStart = summary.pos + summary.node.nodeSize + 1
        return this.editor
          .chain()
          .command(({ tr }) => {
            tr.setSelection(TextSelection.near(tr.doc.resolve(contentStart)))
            return true
          })
          .run()
      },
    }
  },

  addProseMirrorPlugins() {
    return [
      new Plugin({
        props: {
          handleDOMEvents: {
            click: (view, event) => {
              const target = event.target as HTMLElement | null
              const summary = target?.closest?.('summary')
              if (!summary || !view.dom.contains(summary)) return false

              const rect = summary.getBoundingClientRect()
              const onMarker = event.clientX - rect.left <= MARKER_WIDTH
              const details = summary.closest('details')
              const collapsed = details ? !details.hasAttribute('open') : false
              if (!onMarker && !collapsed) return false

              // Cancel the browser's own toggle: it would mutate a node
              // ProseMirror manages, without the change being in the document.
              event.preventDefault()
              const pos = view.posAtDOM(summary, 0)
              const $pos = view.state.doc.resolve(pos)
              for (let depth = $pos.depth; depth >= 0; depth--) {
                const node = $pos.node(depth)
                if (node.type.name !== 'details') continue
                const at = depth === 0 ? 0 : $pos.before(depth)
                view.dispatch(
                  view.state.tr.setNodeMarkup(at, undefined, { ...node.attrs, open: !node.attrs.open }),
                )
                return true
              }
              return false
            },
          },
        },
      }),
    ]
  },
})

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    details: {
      setDetails: () => ReturnType
      toggleDetailsOpen: () => ReturnType
    }
  }
}
