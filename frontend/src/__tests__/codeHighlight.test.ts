/**
 * Read-view syntax highlighting.
 *
 * The editor highlights via CodeBlockLowlight, which paints ProseMirror
 * decorations — and decorations are never serialized by `editor.getHTML()`. Every
 * stored content_html therefore holds `<pre><code class="language-ts">…plain
 * text…</code></pre>`: a language hint and no token spans at all, which is why
 * the read view had never been highlighted regardless of stylesheet. This pass
 * adds the spans in the DOM after render, so existing documents pick it up with
 * no migration and no re-save.
 */
import { describe, it, expect } from 'vitest'
import { highlightCodeBlocks } from '@/utils/codeHighlight'
import { attachCodeCopyButtons } from '@/utils/codeCopy'

function render(html: string): HTMLElement {
  const container = document.createElement('div')
  container.className = 'doc-content'
  container.innerHTML = html
  return container
}

const TS_BLOCK = '<pre><code class="language-ts">const x: number = 1</code></pre>'

describe('highlightCodeBlocks', () => {
  it('adds token spans to a block with a language class', () => {
    const container = render(TS_BLOCK)
    highlightCodeBlocks(container)
    expect(container.querySelectorAll('.hljs-keyword').length).toBeGreaterThan(0)
  })

  it('preserves the original code text exactly', () => {
    const container = render(TS_BLOCK)
    highlightCodeBlocks(container)
    expect(container.querySelector('code')?.textContent).toBe('const x: number = 1')
  })

  it('auto-detects a block saved without a language', () => {
    // TipTap renders `class: null` when no language is set, so there is no
    // language-* class to read.
    const container = render('<pre><code>def hello():\n    return 1</code></pre>')
    highlightCodeBlocks(container)
    expect(container.querySelectorAll('span[class^="hljs-"]').length).toBeGreaterThan(0)
  })

  it('leaves mermaid sources untouched', () => {
    const src = '<pre><code class="language-mermaid">graph TD; A-->B;</code></pre>'
    const container = render(src)
    highlightCodeBlocks(container)
    expect(container.querySelector('code')?.children.length).toBe(0)
    expect(container.querySelector('code')?.textContent).toBe('graph TD; A-->B;')
  })

  it('is idempotent — a second pass does not nest spans', () => {
    const container = render(TS_BLOCK)
    highlightCodeBlocks(container)
    const first = container.innerHTML
    highlightCodeBlocks(container)
    expect(container.innerHTML).toBe(first)
  })

  it('survives an unknown language rather than blanking the block', () => {
    const container = render(
      '<pre><code class="language-notalanguage">some text here</code></pre>',
    )
    highlightCodeBlocks(container)
    expect(container.querySelector('code')?.textContent).toBe('some text here')
  })

  it('skips an empty block', () => {
    const container = render('<pre><code class="language-ts">   </code></pre>')
    highlightCodeBlocks(container)
    expect(container.querySelector('code')?.textContent).toBe('   ')
  })

  it('works after attachCodeCopyButtons has inserted its wrapper', () => {
    // codeCopy puts a div.code-block-host between the <pre> and its parent and
    // marks the pre; the highlight pass must not depend on the parent shape.
    const container = render(TS_BLOCK)
    attachCodeCopyButtons(container)
    expect(container.querySelector('.code-block-host')).not.toBeNull()
    highlightCodeBlocks(container)
    expect(container.querySelectorAll('.hljs-keyword').length).toBeGreaterThan(0)
  })

  it('handles several blocks in one container', () => {
    const container = render(
      TS_BLOCK + '<p>between</p><pre><code class="language-python">x = 1</code></pre>',
    )
    highlightCodeBlocks(container)
    const codes = container.querySelectorAll('pre code')
    expect(codes.length).toBe(2)
    for (const code of Array.from(codes)) {
      expect(code.querySelectorAll('span[class^="hljs-"]').length).toBeGreaterThan(0)
    }
  })
})

describe('code block token colours', () => {
  it('are declared outside @layer so Tailwind cannot purge them', async () => {
    // Same trap as the gapcursor rules: `hljs-*` classes are produced at
    // runtime by lowlight and appear nowhere in the scanned source, so a
    // layered declaration would be dropped from the production stylesheet and
    // every token would silently render in the block's base colour.
    const fs = await import('node:fs/promises')
    const path = await import('node:path')
    const css = await fs.readFile(path.resolve(process.cwd(), 'src/index.css'), 'utf-8')

    const ruleIndex = css.indexOf('.hljs-comment')
    expect(ruleIndex).toBeGreaterThan(-1)

    let depth = 0
    for (let i = 0; i < ruleIndex; i++) {
      if (css[i] === '{') depth++
      else if (css[i] === '}') depth--
    }
    expect(depth).toBe(0)
  })

  it('drive both surfaces from the same variables', async () => {
    const fs = await import('node:fs/promises')
    const path = await import('node:path')
    const css = await fs.readFile(path.resolve(process.cwd(), 'src/index.css'), 'utf-8')

    // The editor and the read view each used to hard-code their own background,
    // which is how one ended up near-white and the other near-black.
    expect(css).not.toContain('.doc-content pre {\n    @apply bg-gray-900')
    const proseMirrorPre = css.slice(css.indexOf('.ProseMirror pre {'))
    expect(proseMirrorPre.slice(0, 200)).toContain('var(--code-bg)')
    const docContentPre = css.slice(css.indexOf('.doc-content pre {'))
    expect(docContentPre.slice(0, 200)).toContain('var(--code-bg)')
  })
})
