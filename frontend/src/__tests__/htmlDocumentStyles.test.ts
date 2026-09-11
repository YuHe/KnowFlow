/**
 * Adapting a report's CSS to a shadow root.
 *
 * Two real defects drove this. A report styles itself through `:root` custom
 * properties and `body` rules, none of which match inside a shadow tree — so it
 * rendered unstyled. And a shadow root is not a containing block for
 * `position: fixed`, so the report's fixed top bar and 268px sidebar were laid
 * out against the viewport and covered the whole application. That looked like a
 * CSS leak but was not one.
 *
 * The rewrite is a text transform, so the tests below are mostly about what it
 * must NOT touch.
 */
import { describe, it, expect } from 'vitest'
import { scopeReportStyles, SHADOW_BASE_STYLES } from '@/utils/htmlDocumentStyles'

describe('scopeReportStyles', () => {
  it('rewrites :root so custom properties actually apply', () => {
    expect(scopeReportStyles(':root { --bg: #f7f8fa; }')).toBe(':host { --bg: #f7f8fa; }')
  })

  it('rewrites html and body', () => {
    expect(scopeReportStyles('html { scroll-behavior: smooth; }')).toContain(':host {')
    expect(scopeReportStyles('body { background: var(--bg); }')).toContain(':host {')
  })

  it('rewrites a comma-separated list', () => {
    expect(scopeReportStyles('html, body { margin: 0 }')).toBe(':host, :host { margin: 0 }')
  })

  it('turns an attached class into :host(...) — not :host.cls', () => {
    // `:host.hide-notes` would require the class on an element inside the shadow;
    // the report puts it on what used to be <body>.
    expect(scopeReportStyles('body.hide-notes .qa-note { display: none; }')).toBe(
      ':host(.hide-notes) .qa-note { display: none; }',
    )
  })

  it('turns an attached attribute selector into :host(...)', () => {
    expect(scopeReportStyles('html[data-theme="dark"] { --bg: #0e1117; }')).toBe(
      ':host([data-theme="dark"]) { --bg: #0e1117; }',
    )
  })

  it('does NOT mangle a class that merely ends in "body"', () => {
    // The real report contains .qa-note-body; a naive replace produced
    // `.qa-note-:host` and broke the stylesheet.
    const css = '.qa-note-body p { margin: 7px 0; }'
    expect(scopeReportStyles(css)).toBe(css)
  })

  it('leaves other identifiers containing the keywords alone', () => {
    for (const css of [
      '.body { color: red }',
      '#body { color: red }',
      '.bodytext { color: red }',
      '.html-view { color: red }',
      '.root-node { color: red }',
      '.card-body-inner { color: red }',
    ]) {
      expect(scopeReportStyles(css)).toBe(css)
    }
  })

  it('does not touch declaration values', () => {
    for (const css of [
      '.x { content: "body"; }',
      '.x { background: url(body.png); }',
      '.x { font-family: var(--sans); }',
    ]) {
      expect(scopeReportStyles(css)).toBe(css)
    }
  })

  it('rewrites a selector that follows a closing brace', () => {
    expect(scopeReportStyles('.a { color: red } body { color: blue }')).toBe(
      '.a { color: red } :host { color: blue }',
    )
  })

  it('rewrites inside an @media block', () => {
    const out = scopeReportStyles('@media (max-width: 960px) { body { padding: 0 } }')
    expect(out).toContain(':host { padding: 0 }')
  })

  it('leaves a descendant occurrence alone rather than guessing', () => {
    // `html body` cannot be expressed as one :host; leaving it produces a rule
    // that matches nothing (appearance degrades) instead of a wrong one.
    expect(scopeReportStyles('html body { margin: 0 }')).toBe(':host body { margin: 0 }')
  })

  it('handles empty input', () => {
    expect(scopeReportStyles('')).toBe('')
  })

  it('is idempotent', () => {
    const once = scopeReportStyles(':root { --a: 1 } body.x .y { color: red }')
    expect(scopeReportStyles(once)).toBe(once)
  })
})

describe('SHADOW_BASE_STYLES', () => {
  it('establishes a containing block for position: fixed', () => {
    // This is the fix for the report's fixed top bar and sidebar covering the
    // whole application. An element with a transform is a containing block for
    // fixed-position descendants.
    expect(SHADOW_BASE_STYLES).toContain('transform:')
  })

  it('makes the host a block and its own stacking context', () => {
    expect(SHADOW_BASE_STYLES).toContain('display: block')
    expect(SHADOW_BASE_STYLES).toContain('isolation: isolate')
  })

  it('targets :host only, so it cannot affect the page', () => {
    const selectors = SHADOW_BASE_STYLES.match(/^[^{]+(?={)/gm) ?? []
    expect(selectors.length).toBeGreaterThan(0)
    for (const sel of selectors) expect(sel.trim()).toBe(':host')
  })
})
