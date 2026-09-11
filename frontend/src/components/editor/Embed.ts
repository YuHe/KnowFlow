import { Node, mergeAttributes } from '@tiptap/core'
import { normalizeEmbedUrl, isAllowedEmbedUrl } from '@/utils/embed'

/**
 * Video embeds.
 *
 * The gap this fills is that a pasted YouTube or Bilibili link stayed a link:
 * `@tiptap/extension-youtube` was in package.json but never registered, and it
 * covers only YouTube, which is the wrong single choice for this audience.
 *
 * An atom node rather than an editable container: the iframe's content is not
 * ours, so there is nothing inside for the caret to do, and `atom` keeps
 * ProseMirror from trying to manage the frame's DOM.
 *
 * The `src` is normalised and host-checked on the way in *and* re-checked by the
 * sanitizer on the way out — see utils/embed for why one of the two is not
 * enough. The frame carries `sandbox` without `allow-same-origin`, so the framed
 * page cannot reach into this one, plus a referrer policy so the document's URL
 * does not leak to the video host.
 */

const IFRAME_ATTRS = {
  frameborder: '0',
  loading: 'lazy',
  referrerpolicy: 'strict-origin-when-cross-origin',
  allow: 'accelerometer; clipboard-write; encrypted-media; picture-in-picture; fullscreen',
  allowfullscreen: 'true',
  // No allow-same-origin: with it, a framed page from an allowed host could
  // script this one.
  sandbox: 'allow-scripts allow-presentation allow-popups allow-popups-to-escape-sandbox',
}

export const Embed = Node.create({
  name: 'embed',
  group: 'block',
  atom: true,
  draggable: true,

  addAttributes() {
    return {
      src: {
        default: null,
        parseHTML: (element) => {
          const iframe = element.tagName === 'IFRAME' ? element : element.querySelector('iframe')
          const src = iframe?.getAttribute('src') ?? null
          return isAllowedEmbedUrl(src) ? src : null
        },
        renderHTML: () => ({}),
      },
    }
  },

  parseHTML() {
    return [
      { tag: 'div[data-type="embed"]' },
      // A bare iframe reaches us from a pasted page; it becomes an embed when its
      // host is allowed and is dropped otherwise.
      { tag: 'iframe' },
    ]
  },

  renderHTML({ HTMLAttributes, node }) {
    const src = node.attrs.src
    if (!isAllowedEmbedUrl(src)) return ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'embed' })]
    return [
      'div',
      mergeAttributes(HTMLAttributes, { 'data-type': 'embed', class: 'embed-wrapper' }),
      ['iframe', { ...IFRAME_ATTRS, src }],
    ]
  },

  addCommands() {
    return {
      setEmbed:
        (url: string) =>
        ({ commands }) => {
          const src = normalizeEmbedUrl(url)
          if (!src) return false
          return commands.insertContent({ type: this.name, attrs: { src } })
        },
    }
  },
})

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    embed: {
      /** Insert an embed; false when the URL is not on the host allow-list. */
      setEmbed: (url: string) => ReturnType
    }
  }
}
