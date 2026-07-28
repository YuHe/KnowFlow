import { marked, Marked, type Tokens } from 'marked'
import { sanitizeHtml } from './sanitize'

/**
 * Inline `==highlight==` → <mark>. Not part of core GFM but emitted by our
 * turndown highlight rule, so round-trip needs marked to parse it back.
 */
const highlightExtension = {
  name: 'highlight',
  level: 'inline' as const,
  start(src: string) { return src.indexOf('==') },
  tokenizer(src: string): Tokens.Generic | undefined {
    const m = /^==([^=\s][^=]*?)==/.exec(src)
    if (m) return { type: 'highlight', raw: m[0], text: m[1], tokens: [] }
    return undefined
  },
  renderer(token: Tokens.Generic) {
    return `<mark>${token.text}</mark>`
  },
}

/**
 * Shared marked configuration with mermaid fenced-block support.
 *
 * ```mermaid blocks are rendered into <div data-mermaid="..."> placeholders;
 * the SVG is produced later by renderMermaidBlocks() (see utils/mermaid).
 */
function createRenderer(emitMermaidPlaceholder: boolean) {
  const renderer = new marked.Renderer()
  renderer.code = (code: string, infostring: string | undefined, _escaped: boolean) => {
    const lang = infostring || ''
    if (lang === 'mermaid' && emitMermaidPlaceholder) {
      const encoded = code.replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      return `<div data-mermaid="${encoded}" contenteditable="false"></div>`
    }
    // Keep mermaid as an editable fenced code block (editor) or render other
    // languages as normal <pre><code>.
    const cls = lang ? ` class="language-${lang}"` : ''
    return `<pre><code${cls}>${code.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</code></pre>`
  }
  return renderer
}

marked.setOptions({ gfm: true, breaks: false })
marked.use({ renderer: createRenderer(true), extensions: [highlightExtension] })

/**
 * Convert markdown to HTML. Output is sanitized (DOMPurify) to neutralize
 * any raw HTML / scripts the markdown may carry.
 *
 * @param mermaidAsPlaceholder — when true (default, for read views) ```mermaid
 *   blocks become <div data-mermaid> placeholders rendered to SVG later.
 *   When false (editor), mermaid stays an editable <pre><code class="language-mermaid">.
 */
export function markdownToHtml(md: string, mermaidAsPlaceholder = true): string {
  let html: string
  if (mermaidAsPlaceholder) {
    html = marked.parse(md) as string
  } else {
    const instance = new Marked()
    instance.setOptions({ gfm: true, breaks: false })
    instance.use({ renderer: createRenderer(false), extensions: [highlightExtension] })
    html = instance.parse(md) as string
  }
  return sanitizeHtml(html)
}

export { marked }

