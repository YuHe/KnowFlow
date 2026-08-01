import MermaidDefault from 'mermaid'

// Initialize mermaid at module load time — no async, no dynamic import.
// Mermaid is now bundled into the vendor chunk, so it's available
// synchronously when this module is imported.
MermaidDefault.initialize({
  startOnLoad: false,
  theme: 'default',
  securityLevel: 'strict',
  fontFamily: 'inherit',
})

let renderSeq = 0

/**
 * Render a single mermaid source string into SVG markup.
 * Returns the SVG string, or an error message box.
 */
export async function renderMermaid(source: string): Promise<string> {
  const id = `mermaid-${++renderSeq}`
  try {
    const { svg } = await MermaidDefault.render(id, source)
    return svg
  } catch (err) {
    // mermaid.render can leave a stray error svg in the DOM; clean it up.
    const stray = document.getElementById(id)
    if (stray) stray.remove()
    const msg = err instanceof Error ? err.message : String(err)
    return `<div style="color:#b91c1c;border:1px solid #fca5a5;background:#fef2f2;padding:8px 12px;border-radius:6px;font-size:13px;text-align:left;">Mermaid 渲染失败: ${msg.replace(/</g, '&lt;')}</div>`
  }
}

/**
 * Scan a container for mermaid blocks and replace them with rendered SVG.
 *
 * Handles two storage shapes:
 *  - <div data-mermaid="..."> placeholders (produced by markdownToHtml default)
 *  - <pre><code class="language-mermaid">...</code></pre> fenced code blocks
 *    (kept as editable code in the editor and saved via ProseMirror round-trip)
 */
export async function renderMermaidBlocks(container: HTMLElement) {
  // 1. Placeholder divs
  const divs = Array.from(container.querySelectorAll<HTMLElement>('div[data-mermaid]'))
  // 2. Fenced code blocks with language-mermaid
  const codeBlocks = Array.from(
    container.querySelectorAll<HTMLElement>('pre > code.language-mermaid')
  )

  if (!divs.length && !codeBlocks.length) return

  for (const block of divs) {
    const source = block.getAttribute('data-mermaid') || ''
    if (!source.trim()) continue
    block.innerHTML = await renderMermaid(source)
  }

  for (const code of codeBlocks) {
    const pre = code.parentElement
    if (!pre) continue
    const source = code.textContent || ''
    if (!source.trim()) continue
    const svg = await renderMermaid(source)
    const wrapper = document.createElement('div')
    wrapper.className = 'mermaid-rendered'
    wrapper.innerHTML = svg
    pre.replaceWith(wrapper)
  }
}