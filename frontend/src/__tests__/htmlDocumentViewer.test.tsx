/**
 * HTML-document rendering and source editing.
 *
 * A standalone HTML document (an LLM-generated report) renders inside a shadow
 * root. Its `<style>` block is full of global selectors — `body`, `h1`, `.card` —
 * which injected into the page would restyle the application's own chrome. A
 * shadow root is a style boundary in both directions.
 *
 * What is asserted here is what *our code* controls: that a shadow root is
 * attached, that the markup lands inside it rather than in the light DOM, and
 * that it is sanitized on the way in. The style isolation itself is a platform
 * guarantee — jsdom implements no CSS cascade, so it cannot be asserted here;
 * /tmp/shadow-dom-test.html is a manual probe for that.
 */
import { describe, it, expect, vi } from 'vitest'
import { render } from '@testing-library/react'
import React from 'react'
import HtmlDocumentViewer from '@/components/doc/HtmlDocumentViewer'
import HtmlDocumentEditor from '@/components/doc/HtmlDocumentEditor'

const REPORT = `<!DOCTYPE html><html><head>
<style>body { background: #ff0000 } h1 { color: #0f0 }</style>
</head><body><h1>报告</h1><div class="card">0.94%</div></body></html>`

function host(container: HTMLElement): HTMLElement {
  const el = container.querySelector('[data-html-document="true"]')
  if (!(el instanceof HTMLElement)) throw new Error('host not rendered')
  return el
}

describe('HtmlDocumentViewer', () => {
  it('attaches a shadow root and puts the report inside it', () => {
    const { container } = render(<HtmlDocumentViewer html={REPORT} />)
    const el = host(container)
    expect(el.shadowRoot).not.toBeNull()
    expect(el.shadowRoot!.innerHTML).toContain('报告')
  })

  it('keeps the report out of the light DOM, so its CSS cannot reach the app', () => {
    const { container } = render(<HtmlDocumentViewer html={REPORT} />)
    // The light DOM holds only the empty host.
    expect(host(container).innerHTML).toBe('')
    expect(container.textContent).toBe('')
  })

  it('keeps the <style> block — that is what makes the report look right', () => {
    const { container } = render(<HtmlDocumentViewer html={REPORT} />)
    expect(host(container).shadowRoot!.innerHTML).toContain('<style>')
  })

  it('strips script and event handlers — a shadow root is not a security boundary', () => {
    const hostile =
      '<div onclick="alert(1)">x</div><script>alert(2)</script><img src=x onerror="alert(3)">'
    const { container } = render(<HtmlDocumentViewer html={hostile} />)
    const html = host(container).shadowRoot!.innerHTML
    expect(html).not.toContain('<script')
    expect(html).not.toContain('onclick')
    expect(html).not.toContain('onerror')
  })

  it('re-renders when the html changes', () => {
    const { container, rerender } = render(<HtmlDocumentViewer html="<p>one</p>" />)
    rerender(<HtmlDocumentViewer html="<p>two</p>" />)
    const shadow = host(container).shadowRoot!
    expect(shadow.innerHTML).toContain('two')
    expect(shadow.innerHTML).not.toContain('one')
  })

  it('does not attach twice when the effect re-runs', () => {
    // attachShadow throws on a second call for the same element.
    const { container, rerender } = render(<HtmlDocumentViewer html="<p>a</p>" />)
    const first = host(container).shadowRoot
    rerender(<HtmlDocumentViewer html="<p>b</p>" />)
    expect(host(container).shadowRoot).toBe(first)
  })
})

describe('HtmlDocumentEditor', () => {
  it('renders the report when not in source mode', () => {
    const { container } = render(
      <HtmlDocumentEditor content={REPORT} onUpdate={vi.fn()} sourceMode={false} />,
    )
    expect(host(container).shadowRoot!.innerHTML).toContain('报告')
    expect(container.querySelector('textarea')).toBeNull()
  })

  it('shows the raw source in a textarea in source mode', () => {
    const { container } = render(
      <HtmlDocumentEditor content={REPORT} onUpdate={vi.fn()} sourceMode={true} />,
    )
    const textarea = container.querySelector('textarea')
    expect(textarea).not.toBeNull()
    // Verbatim: the textarea must show exactly what is stored, not a sanitized
    // rewrite of it.
    expect(textarea!.value).toBe(REPORT)
  })

  it('reports sanitized html and a text-based word count on edit', () => {
    const onUpdate = vi.fn()
    const { container } = render(
      <HtmlDocumentEditor content="<p>a</p>" onUpdate={onUpdate} sourceMode={true} />,
    )
    const textarea = container.querySelector('textarea')!
    // React-controlled textarea: set the value then fire the event it listens to.
    const setter = Object.getOwnPropertyDescriptor(
      HTMLTextAreaElement.prototype,
      'value',
    )!.set!
    setter.call(textarea, '<p>hello</p><script>alert(1)</script>')
    textarea.dispatchEvent(new Event('input', { bubbles: true }))

    expect(onUpdate).toHaveBeenCalledTimes(1)
    const [getHtml, wordCount] = onUpdate.mock.calls[0]
    expect(getHtml()).not.toContain('<script')
    expect(getHtml()).toContain('hello')
    // 'hello' — the markup characters must not be counted.
    expect(wordCount).toBe(5)
  })

  it('honours readOnly when not editable', () => {
    const { container } = render(
      <HtmlDocumentEditor
        content={REPORT}
        onUpdate={vi.fn()}
        sourceMode={true}
        editable={false}
      />,
    )
    expect(container.querySelector('textarea')!.readOnly).toBe(true)
  })
})
