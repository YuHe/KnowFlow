/**
 * Find and replace.
 *
 * 飞书 and Google Docs both have it; Notion has find but no replace. Implemented
 * in-tree rather than as a dependency — it is a text scan plus a decoration set.
 *
 * Matches are decorations, never document mutations: prosemirror-view treats
 * attribute changes on managed nodes as dirty and would redraw on every keystroke
 * of the query, a trap this codebase has already hit twice.
 */
import { describe, it, expect } from 'vitest'
import { Editor } from '@tiptap/core'
import Document from '@tiptap/extension-document'
import Paragraph from '@tiptap/extension-paragraph'
import Text from '@tiptap/extension-text'
import Bold from '@tiptap/extension-bold'
import { SearchAndReplace, searchPluginKey } from '@/components/editor/SearchAndReplace'

function mount(content: string) {
  const element = document.createElement('div')
  document.body.appendChild(element)
  return new Editor({
    element,
    extensions: [Document, Paragraph, Text, Bold, SearchAndReplace],
    content,
  })
}

const state = (editor: Editor) => searchPluginKey.getState(editor.state)!

describe('finding', () => {
  it('finds every occurrence', () => {
    const editor = mount('<p>cat dog cat</p><p>cat</p>')
    editor.commands.setSearchQuery('cat')
    expect(state(editor).matches).toHaveLength(3)
    editor.destroy()
  })

  it('is case-insensitive by default', () => {
    const editor = mount('<p>Cat cat CAT</p>')
    editor.commands.setSearchQuery('cat')
    expect(state(editor).matches).toHaveLength(3)
    editor.destroy()
  })

  it('respects case sensitivity when asked', () => {
    const editor = mount('<p>Cat cat CAT</p>')
    editor.commands.setSearchQuery('cat', true)
    expect(state(editor).matches).toHaveLength(1)
    editor.destroy()
  })

  it('finds text that spans a mark boundary', () => {
    // "hello" is split across a bold run; a naive per-text-node scan misses it.
    const editor = mount('<p>he<strong>ll</strong>o world</p>')
    editor.commands.setSearchQuery('hello')
    expect(state(editor).matches).toHaveLength(1)
    editor.destroy()
  })

  it('does not match across a block boundary', () => {
    const editor = mount('<p>foo</p><p>bar</p>')
    editor.commands.setSearchQuery('foobar')
    expect(state(editor).matches).toHaveLength(0)
    editor.destroy()
  })

  it('reports positions that actually cover the text', () => {
    const editor = mount('<p>abc cat xyz</p>')
    editor.commands.setSearchQuery('cat')
    const { from, to } = state(editor).matches[0]
    expect(editor.state.doc.textBetween(from, to)).toBe('cat')
    editor.destroy()
  })

  it('clears on an empty query', () => {
    const editor = mount('<p>cat</p>')
    editor.commands.setSearchQuery('cat')
    editor.commands.setSearchQuery('')
    expect(state(editor).matches).toHaveLength(0)
    expect(state(editor).current).toBe(-1)
    editor.destroy()
  })

  it('clearSearch resets everything', () => {
    const editor = mount('<p>cat</p>')
    editor.commands.setSearchQuery('cat')
    editor.commands.clearSearch()
    expect(state(editor).query).toBe('')
    expect(state(editor).matches).toHaveLength(0)
    editor.destroy()
  })
})

describe('navigating', () => {
  it('starts on the first match', () => {
    const editor = mount('<p>cat cat cat</p>')
    editor.commands.setSearchQuery('cat')
    expect(state(editor).current).toBe(0)
    editor.destroy()
  })

  it('advances and wraps', () => {
    const editor = mount('<p>cat cat</p>')
    editor.commands.setSearchQuery('cat')
    editor.commands.findNext()
    expect(state(editor).current).toBe(1)
    editor.commands.findNext()
    expect(state(editor).current).toBe(0)
    editor.destroy()
  })

  it('goes back and wraps the other way', () => {
    const editor = mount('<p>cat cat</p>')
    editor.commands.setSearchQuery('cat')
    editor.commands.findPrevious()
    expect(state(editor).current).toBe(1)
    editor.destroy()
  })

  it('declines to navigate with no matches', () => {
    const editor = mount('<p>dog</p>')
    editor.commands.setSearchQuery('cat')
    expect(editor.commands.findNext()).toBe(false)
    editor.destroy()
  })
})

describe('replacing', () => {
  it('replaces the current match only', () => {
    const editor = mount('<p>cat cat</p>')
    editor.commands.setSearchQuery('cat')
    editor.commands.replaceCurrent('dog')
    expect(editor.state.doc.textContent).toBe('dog cat')
    editor.destroy()
  })

  it('re-scans after replacing, so the count follows', () => {
    const editor = mount('<p>cat cat cat</p>')
    editor.commands.setSearchQuery('cat')
    editor.commands.replaceCurrent('dog')
    expect(state(editor).matches).toHaveLength(2)
    editor.destroy()
  })

  it('replaces all occurrences, across blocks', () => {
    const editor = mount('<p>cat dog cat</p><p>cat</p>')
    editor.commands.setSearchQuery('cat')
    editor.commands.replaceAll('bird')
    // doc.textContent concatenates blocks with no separator.
    expect(editor.getHTML()).toContain('<p>bird dog bird</p>')
    expect(editor.getHTML()).toContain('<p>bird</p>')
    expect(editor.state.doc.textContent).not.toContain('cat')
    editor.destroy()
  })

  it('replaceAll survives a replacement longer than the match', () => {
    // Replacing front-to-back would invalidate every later position as soon as
    // the text length changed; the implementation goes back to front.
    const editor = mount('<p>a a a</p>')
    editor.commands.setSearchQuery('a')
    editor.commands.replaceAll('xxxx')
    expect(editor.state.doc.textContent).toBe('xxxx xxxx xxxx')
    editor.destroy()
  })

  it('replaceAll survives a shorter replacement', () => {
    const editor = mount('<p>aaa aaa aaa</p>')
    editor.commands.setSearchQuery('aaa')
    editor.commands.replaceAll('b')
    expect(editor.state.doc.textContent).toBe('b b b')
    editor.destroy()
  })

  it('declines with no matches', () => {
    const editor = mount('<p>dog</p>')
    editor.commands.setSearchQuery('cat')
    expect(editor.commands.replaceAll('bird')).toBe(false)
    expect(editor.commands.replaceCurrent('bird')).toBe(false)
    editor.destroy()
  })
})

describe('reacting to edits', () => {
  it('re-scans when the document changes under an active search', () => {
    const editor = mount('<p>cat</p>')
    editor.commands.setSearchQuery('cat')
    expect(state(editor).matches).toHaveLength(1)
    editor.commands.insertContentAt(editor.state.doc.content.size - 1, ' cat')
    expect(state(editor).matches).toHaveLength(2)
    editor.destroy()
  })

  it('does no work when there is no query', () => {
    const editor = mount('<p>cat</p>')
    editor.commands.insertContentAt(1, 'more ')
    expect(state(editor).matches).toHaveLength(0)
    editor.destroy()
  })
})

describe('highlight styles', () => {
  it('are declared outside @layer so Tailwind cannot purge them', async () => {
    // The classes are produced by the plugin at runtime and appear nowhere in the
    // scanned source — the same trap that silently dropped the gapcursor and
    // hljs rules.
    const fs = await import('node:fs/promises')
    const path = await import('node:path')
    const css = await fs.readFile(path.resolve(process.cwd(), 'src/index.css'), 'utf-8')

    const at = css.indexOf('.search-match {')
    expect(at).toBeGreaterThan(-1)
    let depth = 0
    for (let i = 0; i < at; i++) {
      if (css[i] === '{') depth++
      else if (css[i] === '}') depth--
    }
    expect(depth).toBe(0)
  })
})
