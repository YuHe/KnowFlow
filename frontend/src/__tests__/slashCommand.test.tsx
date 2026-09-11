/**
 * The `/` command menu.
 *
 * The file was in the tree, unregistered, so typing `/` did nothing — while the
 * editor's own placeholder has been telling people to try it. Registering it
 * exposed three defects worth locking down: Latin queries could never match the
 * Chinese titles, the menu opened inside words and URLs, and positioning went
 * through a dependency we do not declare.
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import React, { createRef } from 'react'
import { Editor } from '@tiptap/core'
import Document from '@tiptap/extension-document'
import Paragraph from '@tiptap/extension-paragraph'
import Text from '@tiptap/extension-text'
import Code from '@tiptap/extension-code'
import CodeBlock from '@tiptap/extension-code-block'
import {
  buildCommandItems,
  filterCommandItems,
  isSlashAllowed,
  CommandList,
  type CommandListRef,
} from '@/components/editor/SlashCommand'

const items = buildCommandItems()

describe('the command list', () => {
  it('offers the block structures', () => {
    const titles = items.map((i) => i.title)
    for (const title of ['标题 1', '无序列表', '任务列表', '表格', '代码块', '引用', '分割线']) {
      expect(titles).toContain(title)
    }
  })

  it('omits the image entry unless an uploader was supplied', () => {
    // Without one the item could only fall back to window.prompt, which is what
    // the unregistered original did and what several browsers suppress.
    expect(items.map((i) => i.title)).not.toContain('图片')
    expect(buildCommandItems({ uploadImage: async () => null }).map((i) => i.title)).toContain('图片')
  })

  it('has no entry that needs a URL typed into a dialog', () => {
    // Links and images-by-URL stay in the toolbar, which has real inline inputs.
    expect(items.map((i) => i.title)).not.toContain('超链接')
  })
})

describe('filtering', () => {
  it('matches a Chinese title', () => {
    expect(filterCommandItems(items, '表格').map((i) => i.title)).toEqual(['表格'])
  })

  it('matches a Latin alias, which lowercasing a Chinese title never could', () => {
    // The original filter compared `query.toLowerCase()` against 表格 — so
    // `/table` returned nothing at all.
    expect(filterCommandItems(items, 'table').map((i) => i.title)).toEqual(['表格'])
    expect(filterCommandItems(items, 'h2').map((i) => i.title)).toEqual(['标题 2'])
    expect(filterCommandItems(items, 'CODE').map((i) => i.title)).toEqual(['代码块'])
  })

  it('matches pinyin', () => {
    expect(filterCommandItems(items, 'biaoge').map((i) => i.title)).toEqual(['表格'])
  })

  it('returns everything for an empty query and nothing for a miss', () => {
    expect(filterCommandItems(items, '')).toHaveLength(items.length)
    expect(filterCommandItems(items, '   ')).toHaveLength(items.length)
    expect(filterCommandItems(items, 'zzzz')).toHaveLength(0)
  })
})

describe('when the menu may open', () => {
  function docState(content: string) {
    const element = document.createElement('div')
    document.body.appendChild(element)
    const editor = new Editor({
      element,
      extensions: [Document, Paragraph, Text, Code, CodeBlock],
      content,
    })
    return editor
  }

  /** Position of the last `/` in the document's text. */
  function slashAt(editor: Editor): number {
    let found = -1
    editor.state.doc.descendants((node, pos) => {
      if (node.isText) {
        const at = (node.text ?? '').lastIndexOf('/')
        if (at !== -1) found = pos + at
      }
      return true
    })
    return found
  }

  it('opens at the start of a block', () => {
    const editor = docState('<p>/</p>')
    expect(isSlashAllowed(editor.state, { from: slashAt(editor) })).toBe(true)
    editor.destroy()
  })

  it('opens after a space', () => {
    const editor = docState('<p>写点什么 /</p>')
    expect(isSlashAllowed(editor.state, { from: slashAt(editor) })).toBe(true)
    editor.destroy()
  })

  it('stays shut in the middle of a word', () => {
    const editor = docState('<p>and/or</p>')
    expect(isSlashAllowed(editor.state, { from: slashAt(editor) })).toBe(false)
    editor.destroy()
  })

  it('stays shut inside a URL', () => {
    const editor = docState('<p>https://example.com</p>')
    expect(isSlashAllowed(editor.state, { from: slashAt(editor) })).toBe(false)
    editor.destroy()
  })

  it('stays shut inside a code block', () => {
    // Every command here inserts a block; none of them mean anything in code.
    const editor = docState('<pre><code>a = b /</code></pre>')
    expect(isSlashAllowed(editor.state, { from: slashAt(editor) })).toBe(false)
    editor.destroy()
  })

  it('stays shut inside inline code', () => {
    const editor = docState('<p><code>a /</code></p>')
    expect(isSlashAllowed(editor.state, { from: slashAt(editor) })).toBe(false)
    editor.destroy()
  })
})

describe('keyboard and mouse', () => {
  const three = items.slice(0, 3)

  function mountList(onCommand = vi.fn()) {
    const ref = createRef<CommandListRef>()
    const view = render(<CommandList ref={ref} items={three} command={onCommand} />)
    return { ref, view, onCommand }
  }

  // The handler is called imperatively by the suggestion plugin, not from an
  // event React knows about, so its setState needs flushing by hand.
  const press = (ref: React.RefObject<CommandListRef>, key: string) => {
    let handled = false
    act(() => {
      handled = ref.current!.onKeyDown({ event: new KeyboardEvent('keydown', { key }) })
    })
    return handled
  }

  it('highlights the first item', () => {
    mountList()
    expect(screen.getByText(three[0].title).closest('button')!.className).toContain('bg-indigo-50')
  })

  it('moves down and wraps', () => {
    const { ref } = mountList()
    expect(press(ref, 'ArrowDown')).toBe(true)
    expect(screen.getByText(three[1].title).closest('button')!.className).toContain('bg-indigo-50')
  })

  it('moves up from the first item to the last', () => {
    const { ref } = mountList()
    press(ref, 'ArrowUp')
    expect(screen.getByText(three[2].title).closest('button')!.className).toContain('bg-indigo-50')
  })

  it('runs the highlighted item on Enter and on Tab', () => {
    const { ref, onCommand } = mountList()
    expect(press(ref, 'Enter')).toBe(true)
    expect(onCommand).toHaveBeenCalledWith(three[0])
    // Tab too: 飞书 accepts it, and it would otherwise move focus out of the
    // editor while the menu is open.
    expect(press(ref, 'Tab')).toBe(true)
    expect(onCommand).toHaveBeenCalledTimes(2)
  })

  it('leaves other keys to the editor', () => {
    const { ref } = mountList()
    expect(press(ref, 'a')).toBe(false)
  })

  it('runs on mousedown, not click', () => {
    // The editor's selection is gone by the time a click fires.
    const { onCommand } = mountList()
    fireEvent.mouseDown(screen.getByText(three[1].title))
    expect(onCommand).toHaveBeenCalledWith(three[1])
  })

  it('says so when nothing matches, and swallows no keys', () => {
    const ref = createRef<CommandListRef>()
    render(<CommandList ref={ref} items={[]} command={vi.fn()} />)
    expect(screen.getByText('无匹配命令')).toBeInTheDocument()
    expect(ref.current!.onKeyDown({ event: new KeyboardEvent('keydown', { key: 'Enter' }) })).toBe(false)
  })
})
