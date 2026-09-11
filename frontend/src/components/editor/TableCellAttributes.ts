import TableCell from '@tiptap/extension-table-cell'
import TableHeader from '@tiptap/extension-table-header'
import type { Attributes } from '@tiptap/core'

/**
 * Cell-level presentation attributes: background colour and vertical alignment.
 *
 * Both are table-stakes — 飞书 and Notion each offer cell background colour, and
 * 飞书 offers horizontal *and* vertical alignment — and neither exists in the
 * stock TipTap table. `setCellAttribute` has always been available as a command;
 * what was missing was the attributes for it to write to.
 *
 * Rendered as inline styles rather than classes: the read-only viewer has no
 * ProseMirror to consult and no knowledge of our class names, and the sanitizer
 * already keeps inline `style` (which is how merged-cell tables and row heights
 * survive). `mergeAttributes` merges `style` per-property, so the two attributes
 * below compose into one attribute without clobbering each other.
 *
 * Horizontal alignment deliberately has no cell attribute: TextAlign is already
 * registered for paragraphs, and a cell's content *is* a paragraph, so
 * `setTextAlign` inside a cell already produces the right result. Adding a second
 * mechanism would give two sources of truth for the same pixel.
 */

export const VERTICAL_ALIGNMENTS = ['top', 'middle', 'bottom'] as const
export type VerticalAlignment = (typeof VERTICAL_ALIGNMENTS)[number]

/** Reject anything that is not a colour we wrote, so stored HTML cannot inject. */
function safeColor(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const v = value.trim()
  if (!v) return null
  // #rgb / #rrggbb / rgb() / rgba() / a bare CSS keyword.
  if (/^#[0-9a-f]{3,8}$/i.test(v)) return v
  if (/^rgba?\([\d\s.,%]+\)$/i.test(v)) return v
  if (/^[a-z]+$/i.test(v)) return v
  return null
}

const cellAttributes: Attributes = {
  backgroundColor: {
    default: null,
    parseHTML: (element) =>
      safeColor(element.style.backgroundColor) ||
      safeColor(element.getAttribute('data-background-color')),
    renderHTML: (attributes) => {
      const color = safeColor(attributes.backgroundColor)
      if (!color) return {}
      return { style: `background-color: ${color}` }
    },
  },
  verticalAlign: {
    default: null,
    parseHTML: (element) => {
      const raw = (element.style.verticalAlign || element.getAttribute('valign') || '')
        .trim()
        .toLowerCase()
      return (VERTICAL_ALIGNMENTS as readonly string[]).includes(raw) ? raw : null
    },
    renderHTML: (attributes) => {
      const value = attributes.verticalAlign
      if (typeof value !== 'string') return {}
      if (!(VERTICAL_ALIGNMENTS as readonly string[]).includes(value)) return {}
      return { style: `vertical-align: ${value}` }
    },
  },
}

export const StyledTableCell = TableCell.extend({
  addAttributes() {
    return { ...this.parent?.(), ...cellAttributes }
  },
})

export const StyledTableHeader = TableHeader.extend({
  addAttributes() {
    return { ...this.parent?.(), ...cellAttributes }
  },
})
