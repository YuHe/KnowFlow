import { marked } from 'marked'

/**
 * Shared marked configuration with mermaid fenced-block support.
 *
 * ```mermaid blocks are rendered into <div data-mermaid="..."> placeholders;
 * the SVG is produced later by renderMermaidBlocks() (see utils/mermaid).
 */
function createRenderer(emitMermaidPlaceholder: boolean) {
  const renderer = new marked.Renderer()
  renderer.code = ({ text, lang }: { text: string; lang?: string }) => {
    if (lang === 'mermaid' && emitMermaidPlaceholder) {
      const encoded = text.replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      return `<div data-mermaid="${encoded}" contenteditable="false"></div>`
    }
    // Keep mermaid as an editable fenced code block (editor) or render other
    // languages as normal <pre><code>.
    const cls = lang ? ` class="language-${lang}"` : ''
    return `<pre><code${cls}>${text.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</code></pre>`
  }
  return renderer
}

marked.setOptions({ gfm: true, breaks: false })
marked.use({ renderer: createRenderer(true) })

/**
 * Convert markdown to HTML.
 *
 * @param mermaidAsPlaceholder — when true (default, for read views) ```mermaid
 *   blocks become <div data-mermaid> placeholders rendered to SVG later.
 *   When false (editor), mermaid stays an editable <pre><code class="language-mermaid">.
 */
export function markdownToHtml(md: string, mermaidAsPlaceholder = true): string {
  if (mermaidAsPlaceholder) {
    return marked.parse(md) as string
  }
  const instance = new marked.Marked()
  instance.setOptions({ gfm: true, breaks: false })
  instance.use({ renderer: createRenderer(false) })
  return instance.parse(md) as string
}

export { marked }
