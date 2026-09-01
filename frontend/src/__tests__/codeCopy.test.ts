/**
 * Tests for the code-block copy button injected into read views.
 *
 * Read views render sanitized HTML with dangerouslySetInnerHTML, so the button
 * is attached by walking the DOM rather than by React — these tests cover the
 * bits that walk has to get right: it must not touch mermaid sources (those
 * <pre> nodes are replaced by the rendered SVG), it must copy the code text
 * verbatim including newlines, and it must be safe to run twice over the same
 * container.
 */
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { attachCodeCopyButtons } from '@/utils/codeCopy'

const writeText = vi.fn<[string], Promise<void>>(() => Promise.resolve())

function mount(html: string): HTMLElement {
  const container = document.createElement('div')
  container.className = 'doc-content'
  container.innerHTML = html
  document.body.appendChild(container)
  return container
}

beforeEach(() => {
  writeText.mockClear()
  writeText.mockResolvedValue(undefined)
  Object.defineProperty(navigator, 'clipboard', {
    value: { writeText },
    configurable: true,
  })
})

afterEach(() => {
  document.body.innerHTML = ''
  vi.useRealTimers()
})

describe('attachCodeCopyButtons', () => {
  it('adds a button to a code block', () => {
    const container = mount('<pre><code class="language-ts">const a = 1</code></pre>')
    attachCodeCopyButtons(container)

    const button = container.querySelector('button.code-copy-btn')
    expect(button).not.toBeNull()
    expect(button?.getAttribute('aria-label')).toBe('复制代码')
    // The <pre> is moved into a positioning host alongside the button.
    expect(container.querySelector('.code-block-host > pre')).not.toBeNull()
  })

  it('leaves the code content untouched', () => {
    const container = mount('<pre><code>hello</code></pre>')
    attachCodeCopyButtons(container)
    expect(container.querySelector('pre code')?.textContent).toBe('hello')
  })

  it('copies the code text, preserving newlines', async () => {
    const container = mount('<pre><code>line 1\nline 2\n</code></pre>')
    attachCodeCopyButtons(container)

    container.querySelector<HTMLButtonElement>('button.code-copy-btn')!.click()
    await vi.waitFor(() => expect(writeText).toHaveBeenCalledTimes(1))
    expect(writeText).toHaveBeenCalledWith('line 1\nline 2\n')
  })

  it('copies highlighted code without the token markup', async () => {
    const container = mount(
      '<pre><code class="language-js"><span class="hljs-keyword">const</span> a = <span>1</span></code></pre>',
    )
    attachCodeCopyButtons(container)

    container.querySelector<HTMLButtonElement>('button.code-copy-btn')!.click()
    await vi.waitFor(() => expect(writeText).toHaveBeenCalledWith('const a = 1'))
  })

  it('marks the button as copied, then reverts', async () => {
    vi.useFakeTimers()
    const container = mount('<pre><code>x</code></pre>')
    attachCodeCopyButtons(container)
    const button = container.querySelector<HTMLButtonElement>('button.code-copy-btn')!

    button.click()
    await vi.waitFor(() => expect(button.classList.contains('is-copied')).toBe(true))
    expect(button.getAttribute('aria-label')).toBe('已复制')

    vi.advanceTimersByTime(1600)
    expect(button.classList.contains('is-copied')).toBe(false)
    expect(button.getAttribute('aria-label')).toBe('复制代码')
  })

  it('reports a clipboard failure instead of claiming success', async () => {
    writeText.mockRejectedValue(new Error('denied'))
    const container = mount('<pre><code>x</code></pre>')
    attachCodeCopyButtons(container)
    const button = container.querySelector<HTMLButtonElement>('button.code-copy-btn')!

    button.click()
    await vi.waitFor(() => expect(button.getAttribute('aria-label')).toBe('复制失败'))
    expect(button.classList.contains('is-copied')).toBe(false)
  })

  it('skips mermaid sources, which are replaced by the rendered diagram', () => {
    const container = mount(
      '<pre><code class="language-mermaid">graph TD; A-->B</code></pre>',
    )
    attachCodeCopyButtons(container)
    expect(container.querySelector('button.code-copy-btn')).toBeNull()
    expect(container.querySelector('.code-block-host')).toBeNull()
  })

  it('decorates every code block, mermaid aside', () => {
    const container = mount(
      '<pre><code class="language-ts">a</code></pre>' +
        '<pre><code class="language-mermaid">graph TD; A-->B</code></pre>' +
        '<pre><code>b</code></pre>',
    )
    attachCodeCopyButtons(container)
    expect(container.querySelectorAll('button.code-copy-btn')).toHaveLength(2)
  })

  it('is idempotent — a second pass adds nothing', () => {
    const container = mount('<pre><code>a</code></pre>')
    attachCodeCopyButtons(container)
    attachCodeCopyButtons(container)
    expect(container.querySelectorAll('button.code-copy-btn')).toHaveLength(1)
    expect(container.querySelectorAll('.code-block-host')).toHaveLength(1)
  })

  it('does nothing when there is no code block', () => {
    const container = mount('<p>just prose</p>')
    expect(() => attachCodeCopyButtons(container)).not.toThrow()
    expect(container.querySelector('button.code-copy-btn')).toBeNull()
  })
})
