/**
 * The collapsible block.
 *
 * Built on real `<details>`/`<summary>` so every read-only path collapses without
 * a line of JavaScript. Two things then need pinning down: the schema cannot be
 * talked into an invalid shape, and the toggle goes through ProseMirror rather
 * than the browser's own default action.
 */
import { describe, it, expect } from 'vitest'
import { Editor } from '@tiptap/core'
import Document from '@tiptap/extension-document'
import Paragraph from '@tiptap/extension-paragraph'
import Text from '@tiptap/extension-text'
import { Details, DetailsSummary, DetailsContent, MARKER_WIDTH } from '@/components/editor/Details'
import { htmlToMarkdown } from '@/components/editor/EditorCore'
import { markdownToHtml } from '@/utils/markdown'

function mount(content = '<p>hello</p>') {
  const element = document.createElement('div')
  document.body.appendChild(element)
  return new Editor({
    element,
    extensions: [Document, Paragraph, Text, Details, DetailsSummary, DetailsContent],
    content,
  })
}

const OPEN = '<details open><summary>标题</summary><div data-type="detailsContent"><p>正文</p></div></details>'

describe('inserting', () => {
  it('creates a summary and a body', () => {
    const editor = mount()
    editor.commands.setDetails()
    const html = editor.getHTML()
    expect(html).toContain('<details')
    expect(html).toContain('<summary>')
    expect(html).toContain('data-type="detailsContent"')
    editor.destroy()
  })

  it('starts expanded', () => {
    const editor = mount()
    editor.commands.setDetails()
    expect(editor.getHTML()).toContain('<details open')
    editor.destroy()
  })

  it('declines to nest one inside another', () => {
    const editor = mount(OPEN)
    editor.commands.setTextSelection(3)
    expect(editor.commands.setDetails()).toBe(false)
    editor.destroy()
  })
})

describe('the open attribute', () => {
  it('is a boolean attribute: present means open', () => {
    const editor = mount(OPEN)
    expect(editor.state.doc.firstChild!.attrs.open).toBe(true)
    editor.destroy()
  })

  it('reads a collapsed block back as closed', () => {
    const editor = mount(OPEN.replace('<details open>', '<details>'))
    expect(editor.state.doc.firstChild!.attrs.open).toBe(false)
    editor.destroy()
  })

  it('is omitted entirely when closed, not rendered as open="false"', () => {
    // `open="false"` is still an open <details> as far as a browser is concerned.
    const editor = mount(OPEN)
    editor.commands.setTextSelection(3)
    editor.commands.toggleDetailsOpen()
    const html = editor.getHTML()
    expect(html).toContain('<details>')
    expect(html).not.toContain('open')
    editor.destroy()
  })

  it('toggles back and forth', () => {
    const editor = mount(OPEN)
    editor.commands.setTextSelection(3)
    editor.commands.toggleDetailsOpen()
    editor.commands.toggleDetailsOpen()
    expect(editor.getHTML()).toContain('<details open')
    editor.destroy()
  })

  it('declines outside a details block', () => {
    const editor = mount('<p>hello</p>')
    editor.commands.setTextSelection(2)
    expect(editor.commands.toggleDetailsOpen()).toBe(false)
    editor.destroy()
  })
})

describe('the schema', () => {
  it('keeps the body when a document is loaded', () => {
    const editor = mount(OPEN)
    expect(editor.state.doc.textContent).toContain('标题')
    expect(editor.state.doc.textContent).toContain('正文')
    editor.destroy()
  })

  it('supplies a body for a details that arrives without one', () => {
    // Pasted from elsewhere: <details><summary>x</summary>text</details>. The
    // schema requires a detailsContent, so ProseMirror has to fill one in rather
    // than dropping the whole node.
    const editor = mount('<details><summary>标题</summary><p>裸正文</p></details>')
    const html = editor.getHTML()
    expect(html).toContain('data-type="detailsContent"')
    expect(editor.state.doc.textContent).toContain('裸正文')
    editor.destroy()
  })

  it('accepts block content in the body, not just paragraphs', () => {
    const editor = mount(
      '<details open><summary>s</summary><div data-type="detailsContent"><p>a</p><p>b</p></div></details>',
    )
    expect(editor.state.doc.textContent).toBe('sab')
    editor.destroy()
  })
})

describe('surviving a save', () => {
  it('passes through HTML → Markdown as raw HTML', () => {
    // Markdown cannot express a collapsible block at all, so the turndown rule
    // keeps the element; the blank lines are what make marked treat it as a
    // block rather than paragraph text.
    const md = htmlToMarkdown(OPEN)
    expect(md).toContain('<details open')
    expect(md).toContain('<summary>标题</summary>')
  })

  it('comes back as a details node after Markdown → HTML', () => {
    const html = markdownToHtml(htmlToMarkdown(OPEN), false)
    const editor = mount(html)
    expect(editor.getHTML()).toContain('<details open')
    expect(editor.state.doc.textContent).toContain('正文')
    editor.destroy()
  })

  it('keeps a collapsed block collapsed across the round trip', () => {
    const closed = OPEN.replace('<details open>', '<details>')
    const html = markdownToHtml(htmlToMarkdown(closed), false)
    const editor = mount(html)
    expect(editor.state.doc.firstChild!.attrs.open).toBe(false)
    editor.destroy()
  })
})

describe('the marker hit area', () => {
  it('agrees with the CSS that draws it', async () => {
    // Details.ts decides "did the click hit the triangle?" by comparing against
    // MARKER_WIDTH; index.css reserves that space with padding. Two numbers, one
    // meaning — so they are checked against each other rather than trusted.
    const fs = await import('node:fs/promises')
    const path = await import('node:path')
    const css = await fs.readFile(path.resolve(process.cwd(), 'src/index.css'), 'utf-8')
    const declarations = css.match(/padding:[^;]*\b22px\b[^;]*;\s*\/\* MARKER_WIDTH \*\//g)
    expect(declarations).not.toBeNull()
    expect(declarations!.length).toBeGreaterThanOrEqual(2)
    expect(MARKER_WIDTH).toBe(22)
  })

  it('styles both the editor and the read view', () => {
    // The same document HTML is injected into `.doc-content` for the viewer,
    // share links and the public knowledge base.
    return import('node:fs/promises').then(async (fs) => {
      const path = await import('node:path')
      const css = await fs.readFile(path.resolve(process.cwd(), 'src/index.css'), 'utf-8')
      expect(css).toContain('.ProseMirror details > summary')
      expect(css).toContain('.doc-content details > summary')
    })
  })
})
