import { Extension } from '@tiptap/core'

/**
 * Font size, as an attribute on the `textStyle` mark.
 *
 * 飞书 and Google Docs both put a size control next to the font controls; Notion
 * deliberately has none (it offers only "small text" per block). We follow the
 * former, because the toolbar already carries colour and highlight — both of
 * which are the same kind of inline presentation, stored the same way.
 *
 * This extension existed before but was inert: it round-tripped the attribute
 * through parse/render and nothing could ever set it. The commands and the size
 * list below are what make it reachable.
 *
 * ## Where the value survives
 *
 * A size lives in `content_html`, which is what the editor reloads, and inline
 * `style` is kept by the sanitizer — so it survives a save, a reload, the read
 * view and a share link. It is *not* expressible in Markdown, so `content_md`
 * loses it, exactly as text colour and highlight already do. That asymmetry is
 * pre-existing and deliberate: `content_md` is the export/search projection,
 * `content_html` is the document.
 */

/** Sizes offered in the toolbar. `null` means "inherit from the block". */
export const FONT_SIZES = ['12px', '14px', '16px', '18px', '20px', '24px', '30px', '36px'] as const

/**
 * Accept only a plain CSS length, so a value can never smuggle extra
 * declarations into the `style` attribute we build by interpolation.
 *
 * The parse side is already safe — `element.style.fontSize` is normalised by the
 * browser — but the command side takes whatever a caller passes.
 */
export function safeFontSize(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const v = value.trim().toLowerCase()
  if (!v) return null
  return /^\d+(\.\d+)?(px|pt|em|rem|%)$/.test(v) ? v : null
}

export const FontSize = Extension.create({
  name: 'fontSize',

  addGlobalAttributes() {
    return [
      {
        types: ['textStyle'],
        attributes: {
          fontSize: {
            default: null,
            parseHTML: (element) => safeFontSize(element.style.fontSize),
            renderHTML: (attributes) => {
              const size = safeFontSize(attributes.fontSize)
              if (!size) return {}
              return { style: `font-size: ${size}` }
            },
          },
        },
      },
    ]
  },

  addCommands() {
    return {
      setFontSize:
        (size: string) =>
        ({ chain }) => {
          const value = safeFontSize(size)
          if (!value) return false
          return chain().setMark('textStyle', { fontSize: value }).run()
        },

      unsetFontSize:
        () =>
        ({ chain }) =>
          // removeEmptyTextStyle drops the mark entirely once this was its only
          // attribute; without it the document keeps an empty <span>.
          chain().setMark('textStyle', { fontSize: null }).removeEmptyTextStyle().run(),
    }
  },
})

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    fontSize: {
      setFontSize: (size: string) => ReturnType
      unsetFontSize: () => ReturnType
    }
  }
}

export default FontSize
