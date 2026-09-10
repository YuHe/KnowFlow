/**
 * Detection and plain-text extraction for pasted HTML documents.
 *
 * Detection is deliberately narrow: a false positive routes ordinary prose into
 * the HTML document path, which is far more disruptive than a false negative
 * (which merely leaves today's behaviour in place).
 */
import { describe, it, expect } from 'vitest'
import {
  isHtmlDocument,
  hasDocumentStructure,
  htmlDocumentTitle,
  htmlToPlainText,
} from '@/utils/htmlDocument'

const REPORT = `<!DOCTYPE html>
<html lang="zh">
<head>
  <meta charset="utf-8">
  <title>参考来源用户价值分析</title>
  <style>
    body { font-family: sans-serif; background: #f5f5f5; }
    .card { display: flex; border-radius: 8px; padding: 16px; }
    h2 { color: #2563eb; }
  </style>
</head>
<body>
  <h1>分析报告</h1>
  <div class="card"><p>点击率 <strong>0.94%</strong></p></div>
  <script>console.log('hi')</script>
</body>
</html>`

describe('isHtmlDocument', () => {
  it('accepts a doctype-led document', () => {
    expect(isHtmlDocument(REPORT)).toBe(true)
  })

  it('accepts an <html> root with no doctype', () => {
    expect(isHtmlDocument('<html lang="en"><body>hi</body></html>')).toBe(true)
  })

  it('accepts leading whitespace and comments before the doctype', () => {
    expect(isHtmlDocument('\n\n  <!-- generated -->\n<!DOCTYPE html><html></html>')).toBe(true)
  })

  it('is case-insensitive', () => {
    expect(isHtmlDocument('<!doctype HTML><HTML></HTML>')).toBe(true)
  })

  it('rejects a bare fragment — that belongs in the rich-text path', () => {
    expect(isHtmlDocument('<div class="card"><p>hi</p></div>')).toBe(false)
    expect(isHtmlDocument('<table><tr><td>a</td></tr></table>')).toBe(false)
  })

  it('rejects markdown, including markdown that mentions html', () => {
    expect(isHtmlDocument('# Title\n\n- a\n- b')).toBe(false)
    expect(isHtmlDocument('see the <html> spec for details')).toBe(false)
    expect(isHtmlDocument('```html\n<!DOCTYPE html>\n```')).toBe(false)
  })

  it('rejects empty and whitespace-only input', () => {
    expect(isHtmlDocument('')).toBe(false)
    expect(isHtmlDocument('   \n  ')).toBe(false)
  })

  it('rejects prose that merely starts with an angle bracket', () => {
    expect(isHtmlDocument('<- this way')).toBe(false)
    expect(isHtmlDocument('<htmlish>')).toBe(false)
  })
})

describe('hasDocumentStructure', () => {
  it('sees body and head', () => {
    expect(hasDocumentStructure(REPORT)).toBe(true)
    expect(hasDocumentStructure('<div>x</div>')).toBe(false)
  })
})

describe('htmlDocumentTitle', () => {
  it('reads the title', () => {
    expect(htmlDocumentTitle(REPORT)).toBe('参考来源用户价值分析')
  })

  it('returns null when there is none', () => {
    expect(htmlDocumentTitle('<html><body>x</body></html>')).toBeNull()
  })

  it('returns null for an empty title rather than an empty string', () => {
    expect(htmlDocumentTitle('<title>   </title>')).toBeNull()
  })
})

describe('htmlToPlainText', () => {
  it('keeps the visible text', () => {
    const text = htmlToPlainText(REPORT)
    expect(text).toContain('分析报告')
    expect(text).toContain('0.94%')
  })

  it('drops script and style contents so they cannot pollute the search index', () => {
    const text = htmlToPlainText(REPORT)
    expect(text).not.toContain('font-family')
    expect(text).not.toContain('console.log')
  })

  it('returns an empty string for empty input', () => {
    expect(htmlToPlainText('')).toBe('')
  })

  it('does not fetch or execute anything — parsing happens in a detached document', () => {
    // An onerror payload must simply be inert text-wise; the assertion here is
    // that extraction completes without throwing and without the attribute value
    // leaking into the text.
    const text = htmlToPlainText('<img src=x onerror="alert(1)">visible')
    expect(text).toBe('visible')
  })
})
