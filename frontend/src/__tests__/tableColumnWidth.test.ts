/**
 * Table column widths and mermaid failure diagnostics.
 *
 * Two defects found while reviewing table editing, both invisible to the
 * existing suite:
 *
 *  - `colwidth` is TipTap's own non-standard attribute on td/th, and
 *    @tiptap/extension-table-cell reads a column width from *nowhere else* — it
 *    never consults the <colgroup>. The sanitizer's allow-list did not include
 *    it, so every column width was stripped on the way through markdownToHtml,
 *    and toggling source mode silently reset all columns to the 25px minimum.
 *
 *  - a table carrying the legacy `height` attribute rather than an inline style
 *    was sent down the pipe-table path, losing its row heights, even though
 *    parseRowHeight accepts that form.
 */
import { describe, it, expect } from 'vitest'
import { sanitizeHtml } from '@/utils/sanitize'
import { htmlToMarkdown } from '@/components/editor/EditorCore'
import { parseRowHeight } from '@/components/editor/TableRowHeight'
import { renderMermaid } from '@/utils/mermaid'

const TABLE_WITH_COLWIDTH =
  '<table><colgroup><col style="width: 120px;"><col style="width: 80px;"></colgroup>' +
  '<tbody><tr>' +
  '<td colwidth="120" colspan="1" rowspan="1"><p>A</p></td>' +
  '<td colwidth="80" colspan="1" rowspan="1"><p>B</p></td>' +
  '</tr></tbody></table>'

describe('sanitizer keeps column widths', () => {
  it('preserves the colwidth attribute', () => {
    const out = sanitizeHtml(TABLE_WITH_COLWIDTH)
    expect(out).toContain('colwidth="120"')
    expect(out).toContain('colwidth="80"')
  })

  it('still preserves the colgroup style it renders from', () => {
    const out = sanitizeHtml(TABLE_WITH_COLWIDTH)
    expect(out).toContain('width: 120px')
  })

  it('has not become permissive about scripts', () => {
    const out = sanitizeHtml(
      '<table><tbody><tr><td colwidth="80"><script>alert(1)</script>x</td></tr></tbody></table>',
    )
    expect(out).not.toContain('<script')
    expect(out).toContain('colwidth="80"')
  })
})

describe('row height via the legacy attribute', () => {
  it('is read by parseRowHeight', () => {
    const tr = document.createElement('tr')
    tr.setAttribute('height', '60')
    expect(parseRowHeight(tr)).toBe(60)
  })

  it('rejects a percentage rather than reading it as pixels', () => {
    // parseInt('50%') is 50, which would silently shrink a row that asked for
    // half the table's height.
    const tr = document.createElement('tr')
    tr.style.height = '50%'
    expect(parseRowHeight(tr)).toBeNull()
  })

  it('rejects em and rem the same way', () => {
    for (const value of ['3em', '2.5rem', '10vh']) {
      const tr = document.createElement('tr')
      tr.style.height = value
      expect(parseRowHeight(tr)).toBeNull()
    }
  })

  it('sends a table using it down the raw-HTML path', () => {
    const html =
      '<table><tbody><tr height="60"><td>a</td><td>b</td></tr></tbody></table>'
    const md = htmlToMarkdown(html)
    expect(md).toContain('<table')
    expect(md).toContain('height="60"')
  })
})

describe('mermaid failure diagnostics', () => {
  it('names the semicolon as the cause when one is on the failing line', async () => {
    // `;` is mermaid's statement separator, so a semicolon inside a timeline
    // event truncates the statement. The raw parse error never says so.
    const source =
      'timeline\n    title T\n    03 : CodeAct 出现; Delegation+Microagents'
    const out = await renderMermaid(source)
    expect(out).toContain('Mermaid 渲染失败')
    expect(out).toContain('分号')
  })

  it('does not invent a hint for an unrelated failure', async () => {
    const out = await renderMermaid('graph TD\n    A --&&-- B')
    expect(out).toContain('Mermaid 渲染失败')
    expect(out).not.toContain('分号')
  })

  it('escapes angle brackets in the reported message', async () => {
    const out = await renderMermaid('timeline\n    title T\n    03 : <img src=x>')
    expect(out).not.toContain('<img')
  })
})
