/**
 * A `<style>` element must never reach the page's own DOM.
 *
 * This was a live incident: an HTML report saved as a document restyled the
 * entire application. A `<style>` applies to the whole document no matter how
 * deeply it is nested, and an LLM-generated report's CSS is written with global
 * selectors — `body`, `h1`, `.card`.
 *
 * The report path isolates it in a shadow root. `sanitizeForLightDom` is the
 * backstop for every other consumer, so forgetting the distinction degrades a
 * preview's appearance instead of breaking the app.
 */
import { describe, it, expect } from 'vitest'
import { sanitizeHtml, sanitizeForLightDom } from '@/utils/sanitize'
import { markdownToHtml } from '@/utils/markdown'

const REPORT_STYLE =
  '<style>body{background:#f00}h1{color:#0f0}.card{display:flex}</style>' +
  '<h1>报告</h1><div class="card">0.94%</div>'

describe('sanitizeForLightDom', () => {
  it('drops a top-level <style>', () => {
    const out = sanitizeForLightDom(REPORT_STYLE)
    expect(out).not.toContain('<style')
    expect(out).not.toContain('background:#f00')
  })

  it('drops a <style> nested deep inside the markup', () => {
    const out = sanitizeForLightDom(
      '<div><section><style>body{background:red}</style><p>x</p></section></div>',
    )
    expect(out).not.toContain('<style')
    expect(out).toContain('<p>x</p>')
  })

  it('keeps the visible content', () => {
    const out = sanitizeForLightDom(REPORT_STYLE)
    expect(out).toContain('报告')
    expect(out).toContain('0.94%')
    expect(out).toContain('class="card"')
  })

  it('keeps inline style attributes — those are element-scoped', () => {
    const out = sanitizeForLightDom('<p style="color:red">x</p>')
    expect(out).toContain('style="color:red"')
  })

  it('keeps a <style> inside an <svg>, which is how mermaid ships its theme', () => {
    const svg =
      '<svg id="mermaid-1"><style>#mermaid-1 .node{fill:#eee}</style><g><rect/></g></svg>'
    const out = sanitizeForLightDom(svg)
    expect(out).toContain('<style>')
    expect(out).toContain('#mermaid-1 .node')
  })

  it('drops <link>, <base> and <meta> for the same reason', () => {
    const out = sanitizeForLightDom(
      '<link rel="stylesheet" href="x.css"><base href="/evil/"><meta charset="utf-8"><p>x</p>',
    )
    expect(out).not.toContain('<link')
    expect(out).not.toContain('<base')
    expect(out).not.toContain('<meta')
    expect(out).toContain('<p>x</p>')
  })

  it('still strips script and event handlers', () => {
    const out = sanitizeForLightDom(
      '<script>alert(1)</script><div onclick="alert(2)">x</div><img src=y onerror="alert(3)">',
    )
    expect(out).not.toContain('<script')
    expect(out).not.toContain('onclick')
    expect(out).not.toContain('onerror')
  })

  it('is idempotent — repeated sanitizing must not drift', () => {
    const once = sanitizeForLightDom(REPORT_STYLE)
    expect(sanitizeForLightDom(once)).toBe(once)
  })

  it('passes plain text through untouched', () => {
    expect(sanitizeForLightDom('just text')).toBe('just text')
    expect(sanitizeForLightDom('')).toBe('')
  })
})

describe('sanitizeHtml (shadow-root variant)', () => {
  it('keeps <style>, because the report needs it and the shadow root contains it', () => {
    expect(sanitizeHtml(REPORT_STYLE)).toContain('<style>')
  })

  it('is idempotent too', () => {
    const once = sanitizeHtml(REPORT_STYLE)
    expect(sanitizeHtml(once)).toBe(once)
  })
})

describe('markdownToHtml', () => {
  it('drops a raw <style> block, since its output lands in the page DOM', () => {
    const out = markdownToHtml('# Title\n\n<style>body{background:red}</style>\n\ntext', false)
    expect(out).not.toContain('<style')
    expect(out).toContain('Title')
  })

  it('leaves the mermaid code-block form intact', () => {
    // Note: the `div[data-mermaid]` placeholder does NOT survive sanitizing —
    // DOMPurify drops the data attribute, and it did so before this change too.
    // Mermaid in the read view therefore relies on the fenced-code form, which
    // is what the editor actually stores.
    const out = markdownToHtml('```mermaid\ngraph TD;A-->B;\n```', false)
    expect(out).toContain('language-mermaid')
    expect(out).toContain('graph TD')
  })
})
