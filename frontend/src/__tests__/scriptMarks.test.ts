/**
 * Superscript and subscript.
 *
 * Small marks, but they are the first inline construct we store as raw HTML in
 * content_md — so the round-trip assertions matter more than the commands do.
 */
import { describe, it, expect } from 'vitest'
import { Editor } from '@tiptap/core'
import Document from '@tiptap/extension-document'
import Paragraph from '@tiptap/extension-paragraph'
import Text from '@tiptap/extension-text'
import Bold from '@tiptap/extension-bold'
import { Superscript, Subscript } from '@/components/editor/ScriptMarks'
import { htmlToMarkdown } from '@/components/editor/EditorCore'
import { markdownToHtml } from '@/utils/markdown'

function mount(content = '<p>hello</p>') {
  const element = document.createElement('div')
  document.body.appendChild(element)
  return new Editor({
    element,
    extensions: [Document, Paragraph, Text, Bold, Superscript, Subscript],
    content,
  })
}

const selectAll = (editor: Editor) => editor.commands.setTextSelection({ from: 1, to: 6 })

describe('applying the marks', () => {
  it('wraps the selection in sup', () => {
    const editor = mount()
    selectAll(editor)
    editor.commands.toggleSuperscript()
    expect(editor.getHTML()).toBe('<p><sup>hello</sup></p>')
    editor.destroy()
  })

  it('wraps the selection in sub', () => {
    const editor = mount()
    selectAll(editor)
    editor.commands.toggleSubscript()
    expect(editor.getHTML()).toBe('<p><sub>hello</sub></p>')
    editor.destroy()
  })

  it('toggles back off', () => {
    const editor = mount()
    selectAll(editor)
    editor.commands.toggleSuperscript()
    editor.commands.toggleSuperscript()
    expect(editor.getHTML()).toBe('<p>hello</p>')
    editor.destroy()
  })

  it('replaces one with the other instead of nesting', () => {
    // A character is above the baseline or below it. <sup><sub> has no defined
    // rendering, and `excludes` is what makes the swap a single step.
    const editor = mount()
    selectAll(editor)
    editor.commands.setSuperscript()
    editor.commands.setSubscript()
    const html = editor.getHTML()
    expect(html).toBe('<p><sub>hello</sub></p>')
    expect(html).not.toContain('sup')
    editor.destroy()
  })

  it('composes with bold', () => {
    const editor = mount('<p><strong>hello</strong></p>')
    selectAll(editor)
    editor.commands.setSuperscript()
    const html = editor.getHTML()
    expect(html).toContain('<sup>')
    expect(html).toContain('<strong>')
    editor.destroy()
  })
})

describe('parsing', () => {
  it('reads back stored tags', () => {
    const editor = mount('<p>H<sub>2</sub>O and m<sup>2</sup></p>')
    const html = editor.getHTML()
    expect(html).toContain('<sub>2</sub>')
    expect(html).toContain('<sup>2</sup>')
    editor.destroy()
  })

  it('reads the vertical-align spelling pasted from other editors', () => {
    // Word and Google Docs both export the style form rather than the tag.
    const editor = mount('<p><span style="vertical-align: super">x</span></p>')
    expect(editor.getHTML()).toContain('<sup>')
    editor.destroy()
  })
})

describe('surviving a save', () => {
  // content_md is written on every save and read back on every source-mode
  // toggle. Markdown has no syntax for either mark, so the turndown rule keeps
  // the tags — without it the first autosave would drop them silently.
  it('keeps sup and sub through HTML → Markdown', () => {
    const md = htmlToMarkdown('<p>H<sub>2</sub>O and m<sup>2</sup></p>')
    expect(md).toContain('<sub>2</sub>')
    expect(md).toContain('<sup>2</sup>')
  })

  it('comes back as marks after Markdown → HTML', () => {
    const md = htmlToMarkdown('<p>m<sup>2</sup></p>')
    const html = markdownToHtml(md, false)
    expect(html).toContain('<sup>2</sup>')
  })

  it('round-trips through the editor without accumulating markup', () => {
    const first = mount('<p>m<sup>2</sup></p>')
    const once = first.getHTML()
    first.destroy()
    const second = mount(markdownToHtml(htmlToMarkdown(once), false))
    expect(second.getHTML()).toBe('<p>m<sup>2</sup></p>')
    second.destroy()
  })
})
