/**
 * Tests for the read view's copy affordances.
 *
 *  - DocViewer must wire up the code-block copy buttons, since that is the only
 *    path by which read-only pages (doc read, share link, public KB) get them.
 *  - documentMarkdown decides what the document-level "copy Markdown source"
 *    button puts on the clipboard.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { useRef } from 'react'
import { render, screen } from '@testing-library/react'
import DocViewer from '@/components/doc/DocViewer'
import { documentMarkdown } from '@/components/editor/EditorCore'

// The real module pulls in mermaid and initializes it at import time; the
// diagram rendering itself is not what these tests are about.
vi.mock('@/utils/mermaid', () => ({
  renderMermaidBlocks: vi.fn(() => Promise.resolve()),
}))

/** DocViewer decorates the container it is handed, mirroring the real pages. */
function Harness({ content }: { content: string }) {
  const ref = useRef<HTMLDivElement>(null)
  return (
    <div ref={ref} data-testid="container">
      <DocViewer content={content} containerRef={ref} />
    </div>
  )
}

afterEach(() => {
  vi.clearAllMocks()
})

describe('DocViewer', () => {
  it('gives code blocks a copy button', () => {
    render(<Harness content="<pre><code class='language-ts'>const a = 1</code></pre>" />)
    expect(screen.getByLabelText('复制代码')).toBeInTheDocument()
  })

  it('renders prose without adding a button', () => {
    render(<Harness content="<p>hello</p>" />)
    expect(screen.queryByLabelText('复制代码')).not.toBeInTheDocument()
    expect(screen.getByTestId('container').textContent).toContain('hello')
  })

  it('still strips scripts from the content it renders', () => {
    render(<Harness content="<p>ok</p><script>alert(1)</script>" />)
    expect(screen.getByTestId('container').innerHTML).not.toContain('<script')
  })

  it('gives every code block its own button', () => {
    render(
      <Harness content="<pre><code>a</code></pre><pre><code>b</code></pre>" />,
    )
    expect(screen.getAllByLabelText('复制代码')).toHaveLength(2)
  })
})

describe('documentMarkdown', () => {
  it('prefers the stored markdown', () => {
    expect(
      documentMarkdown({ content_md: '# Title', content_html: '<h1>Other</h1>' }),
    ).toBe('# Title')
  })

  it('falls back to converting the HTML', () => {
    expect(documentMarkdown({ content_md: '', content_html: '<h1>Title</h1>' })).toBe(
      '# Title',
    )
  })

  it('treats whitespace-only markdown as absent', () => {
    expect(
      documentMarkdown({ content_md: '   \n ', content_html: '<p>body</p>' }),
    ).toBe('body')
  })

  it('returns an empty string for an empty document', () => {
    expect(documentMarkdown({})).toBe('')
    expect(documentMarkdown({ content_md: null, content_html: null })).toBe('')
  })
})
