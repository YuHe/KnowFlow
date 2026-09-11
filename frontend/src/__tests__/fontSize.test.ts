/**
 * Font size.
 *
 * The extension already existed and was inert: it parsed and rendered the
 * attribute, and nothing could ever set it. These tests cover the part that was
 * missing — the commands — plus the value guard, because the style attribute is
 * built by string interpolation.
 */
import { describe, it, expect } from 'vitest'
import { Editor } from '@tiptap/core'
import Document from '@tiptap/extension-document'
import Paragraph from '@tiptap/extension-paragraph'
import Text from '@tiptap/extension-text'
import Bold from '@tiptap/extension-bold'
import TextStyle from '@tiptap/extension-text-style'
import Color from '@tiptap/extension-color'
import { FontSize, FONT_SIZES, safeFontSize } from '@/components/editor/FontSize'

function mount(content = '<p>hello</p>') {
  const element = document.createElement('div')
  document.body.appendChild(element)
  return new Editor({
    element,
    extensions: [Document, Paragraph, Text, Bold, TextStyle, Color, FontSize],
    content,
  })
}

/** Select the whole first paragraph. */
const selectAll = (editor: Editor) => editor.commands.setTextSelection({ from: 1, to: 6 })

describe('safeFontSize', () => {
  it('accepts the CSS length units we offer', () => {
    for (const value of ['16px', '1.5em', '2rem', '12pt', '150%']) {
      expect(safeFontSize(value)).toBe(value)
    }
  })

  it('normalises case and whitespace', () => {
    expect(safeFontSize('  16PX ')).toBe('16px')
  })

  it('refuses anything that could smuggle a second declaration', () => {
    // The attribute is interpolated into `style="font-size: …"`, so a value
    // carrying a `;` would inject a declaration of the caller's choosing.
    expect(safeFontSize('16px; position: fixed; top: 0')).toBeNull()
    expect(safeFontSize('expression(alert(1))')).toBeNull()
    expect(safeFontSize('calc(1px + 2px)')).toBeNull()
  })

  it('refuses unitless numbers, empty values and non-strings', () => {
    expect(safeFontSize('16')).toBeNull()
    expect(safeFontSize('')).toBeNull()
    expect(safeFontSize('   ')).toBeNull()
    expect(safeFontSize(16)).toBeNull()
    expect(safeFontSize(null)).toBeNull()
  })

  it('accepts every size the toolbar offers', () => {
    for (const size of FONT_SIZES) expect(safeFontSize(size)).toBe(size)
  })
})

describe('setFontSize', () => {
  it('writes the size as an inline style', () => {
    const editor = mount()
    selectAll(editor)
    editor.commands.setFontSize('24px')
    expect(editor.getHTML()).toContain('font-size: 24px')
    editor.destroy()
  })

  it('declines an invalid size and leaves the document alone', () => {
    const editor = mount()
    selectAll(editor)
    expect(editor.commands.setFontSize('huge')).toBe(false)
    expect(editor.getHTML()).toBe('<p>hello</p>')
    editor.destroy()
  })

  it('composes with other marks rather than replacing them', () => {
    const editor = mount('<p><strong>hello</strong></p>')
    selectAll(editor)
    editor.commands.setFontSize('20px')
    const html = editor.getHTML()
    expect(html).toContain('font-size: 20px')
    expect(html).toContain('<strong>')
    editor.destroy()
  })

  it('replaces a previous size instead of nesting spans', () => {
    const editor = mount()
    selectAll(editor)
    editor.commands.setFontSize('14px')
    editor.commands.setFontSize('30px')
    const html = editor.getHTML()
    expect(html).toContain('font-size: 30px')
    expect(html).not.toContain('14px')
    editor.destroy()
  })
})

describe('unsetFontSize', () => {
  it('leaves no empty span behind', () => {
    // setMark with a null attribute alone would keep a stripped-down <span>,
    // which then survives every later save.
    const editor = mount()
    selectAll(editor)
    editor.commands.setFontSize('24px')
    editor.commands.unsetFontSize()
    expect(editor.getHTML()).toBe('<p>hello</p>')
    editor.destroy()
  })

  it('keeps other textStyle attributes when only the size is cleared', () => {
    const editor = mount('<p><span style="color: rgb(255, 0, 0)">hello</span></p>')
    selectAll(editor)
    editor.commands.setFontSize('24px')
    editor.commands.unsetFontSize()
    const html = editor.getHTML()
    expect(html).not.toContain('font-size')
    expect(html).toContain('color')
    editor.destroy()
  })
})

describe('parsing stored HTML', () => {
  it('round-trips a size that was saved earlier', () => {
    const editor = mount('<p><span style="font-size: 18px">hello</span></p>')
    expect(editor.getHTML()).toContain('font-size: 18px')
    editor.destroy()
  })

  it('drops a size it would not have written', () => {
    // Reached through pasted or hand-edited HTML, not through the toolbar.
    const editor = mount('<p><span style="font-size: 3vw">hello</span></p>')
    expect(editor.getHTML()).not.toContain('3vw')
    editor.destroy()
  })
})
