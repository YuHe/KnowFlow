/**
 * Tests for HTML ↔ Markdown conversion of tables, especially merged cells.
 *
 * Regression: turndown's GFM plugin renders every table as a pipe table, which
 * has no way to express colspan/rowspan. A merged cell was therefore destroyed
 * on the first HTML→MD→HTML round trip — and one happens on every save (both
 * content_md and content_html are persisted) and on every source-mode toggle.
 */
import { describe, it, expect } from 'vitest'
import { htmlToMarkdown } from '@/components/editor/EditorCore'
import { markdownToHtml } from '@/utils/markdown'
import { sanitizeHtml } from '@/utils/sanitize'

const roundtrip = (html: string) => markdownToHtml(htmlToMarkdown(html), false)

describe('plain tables', () => {
  it('become pipe tables', () => {
    const html =
      '<table><tbody><tr><th>A</th><th>B</th></tr><tr><td>1</td><td>2</td></tr></tbody></table>'
    const md = htmlToMarkdown(html)
    expect(md).toContain('| A | B |')
    expect(md).not.toContain('<table')
  })

  it('survive a round trip', () => {
    const html =
      '<table><tbody><tr><th>A</th><th>B</th></tr><tr><td>1</td><td>2</td></tr></tbody></table>'
    const back = roundtrip(html)
    expect(back).toContain('<table')
    expect(back).toContain('A')
    expect(back).toContain('2')
  })
})

describe('tables with merged cells', () => {
  it('preserve colspan through a round trip', () => {
    const html =
      '<table><tbody><tr><th>H1</th><th>H2</th></tr><tr><td colspan="2">merged</td></tr></tbody></table>'
    const back = roundtrip(html)
    expect(back).toContain('colspan="2"')
    expect(back).toContain('merged')
  })

  it('preserve rowspan through a round trip', () => {
    const html =
      '<table><tbody><tr><td rowspan="2">tall</td><td>b</td></tr><tr><td>c</td></tr></tbody></table>'
    const back = roundtrip(html)
    expect(back).toContain('rowspan="2"')
    expect(back).toContain('tall')
  })

  it('preserve both attributes together', () => {
    const html =
      '<table><tbody><tr><td colspan="2" rowspan="3">big</td><td>x</td></tr></tbody></table>'
    const back = roundtrip(html)
    expect(back).toContain('colspan="2"')
    expect(back).toContain('rowspan="3"')
  })

  it('survive repeated round trips', () => {
    const html =
      '<table><tbody><tr><td colspan="2">merged</td></tr></tbody></table>'
    let current = html
    for (let i = 0; i < 3; i++) current = roundtrip(current)
    expect(current).toContain('colspan="2"')
  })

  it('emit raw HTML rather than a pipe table', () => {
    const html = '<table><tbody><tr><td colspan="2">merged</td></tr></tbody></table>'
    const md = htmlToMarkdown(html)
    expect(md).toContain('<table')
    expect(md).toContain('colspan="2"')
  })

  it('treat colspan="1" as unmerged so ordinary tables stay pipe tables', () => {
    // A header row is required for a pipe table to be possible at all — the
    // GFM plugin itself passes header-less tables through as raw HTML.
    const html =
      '<table><tbody><tr><th>A</th><th>B</th></tr><tr><td colspan="1">a</td><td rowspan="1">b</td></tr></tbody></table>'
    const md = htmlToMarkdown(html)
    expect(md).not.toContain('<table')
    expect(md).toContain('| a | b |')
  })

  it('keeps header-less tables intact (raw HTML, no merge involved)', () => {
    // Pre-existing turndown-plugin-gfm behaviour, asserted so a future change
    // to the merge rule cannot silently start dropping these.
    const html = '<table><tbody><tr><td>a</td><td>b</td></tr></tbody></table>'
    const back = roundtrip(html)
    expect(back).toContain('a')
    expect(back).toContain('b')
  })
})

describe('sanitizer', () => {
  it('keeps colspan/rowspan', () => {
    const out = sanitizeHtml(
      '<table><tbody><tr><td colspan="2" rowspan="3">m</td></tr></tbody></table>',
    )
    expect(out).toContain('colspan="2"')
    expect(out).toContain('rowspan="3"')
  })

  it('still strips scripts from table markup', () => {
    const out = sanitizeHtml(
      '<table><tbody><tr><td colspan="2"><script>alert(1)</script>m</td></tr></tbody></table>',
    )
    expect(out).not.toContain('<script')
    expect(out).toContain('colspan="2"')
  })
})
