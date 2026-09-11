import { Mark, mergeAttributes } from '@tiptap/core'

/**
 * Superscript and subscript.
 *
 * 飞书, Google Docs and Word all have them, and they are the one inline gap that
 * shows up in ordinary writing — footnote markers, m², H₂O, CO₂. TipTap publishes
 * both as separate packages; they are a dozen lines each, so they are written here
 * rather than added as two more dependencies.
 *
 * The two exclude each other: a character is above the baseline or below it, and
 * nesting the marks produces a `<sup><sub>` whose rendering is undefined in
 * practice. `excludes` makes setting one clear the other in a single step.
 *
 * ## Round trip
 *
 * Markdown has no syntax for either, and GFM adds none — so the turndown rules in
 * EditorCore keep `<sup>`/`<sub>` as raw inline HTML. `marked` passes inline HTML
 * through and DOMPurify's default profile allows both tags, so the mark survives
 * content_md → content_html and the source-mode toggle. Without those rules the
 * first autosave would drop it, which is the trap the table attributes hit twice.
 */

const shared = {
  keepOnSplit: false,
}

export const Superscript = Mark.create({
  name: 'superscript',
  ...shared,

  excludes: 'subscript',

  parseHTML() {
    return [
      { tag: 'sup' },
      {
        style: 'vertical-align',
        getAttrs: (value) => (value === 'super' ? {} : false),
      },
    ]
  },

  renderHTML({ HTMLAttributes }) {
    return ['sup', mergeAttributes(HTMLAttributes), 0]
  },

  addCommands() {
    return {
      setSuperscript: () => ({ commands }) => commands.setMark(this.name),
      unsetSuperscript: () => ({ commands }) => commands.unsetMark(this.name),
      toggleSuperscript: () => ({ commands }) => commands.toggleMark(this.name),
    }
  },

  addKeyboardShortcuts() {
    // Google Docs' bindings; 飞书 uses the same pair.
    return { 'Mod-.': () => this.editor.commands.toggleSuperscript() }
  },
})

export const Subscript = Mark.create({
  name: 'subscript',
  ...shared,

  excludes: 'superscript',

  parseHTML() {
    return [
      { tag: 'sub' },
      {
        style: 'vertical-align',
        getAttrs: (value) => (value === 'sub' ? {} : false),
      },
    ]
  },

  renderHTML({ HTMLAttributes }) {
    return ['sub', mergeAttributes(HTMLAttributes), 0]
  },

  addCommands() {
    return {
      setSubscript: () => ({ commands }) => commands.setMark(this.name),
      unsetSubscript: () => ({ commands }) => commands.unsetMark(this.name),
      toggleSubscript: () => ({ commands }) => commands.toggleMark(this.name),
    }
  },

  addKeyboardShortcuts() {
    return { 'Mod-,': () => this.editor.commands.toggleSubscript() }
  },
})

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    superscript: {
      setSuperscript: () => ReturnType
      unsetSuperscript: () => ReturnType
      toggleSuperscript: () => ReturnType
    }
    subscript: {
      setSubscript: () => ReturnType
      unsetSubscript: () => ReturnType
      toggleSubscript: () => ReturnType
    }
  }
}
