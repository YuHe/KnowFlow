/**
 * The editor toolbar.
 *
 * Two complaints drove this: the icons were hand-drawn and did not match what
 * anyone has learned from Notion, 飞书 or Office, and the table cluster was
 * fifteen flat controls — six of them bare Chinese words, three of them the
 * box-drawing glyphs ⌜ ⌷ ⌞. So the tests assert the two properties that were
 * missing rather than any particular drawing: every control says what it does on
 * hover, and no control is a bare word or glyph.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act, within } from '@testing-library/react'
import React from 'react'
import EditorToolbar from '@/components/editor/EditorToolbar'

/**
 * Editor stand-in. `chain()` is a Proxy so any command name works and the calls
 * are recorded; `can()` answers true for everything unless told otherwise.
 */
function makeEditor(options: { activeNames?: string[]; cannot?: string[] } = {}) {
  const calls: string[] = []
  const active = new Set(options.activeNames ?? [])
  const cannot = new Set(options.cannot ?? [])

  const chain: Record<string, unknown> = {}
  const chainProxy: unknown = new Proxy(chain, {
    get(_target, prop: string) {
      if (prop === 'run') return () => true
      return (...args: unknown[]) => {
        if (prop !== 'focus') calls.push(args.length ? `${prop}(${JSON.stringify(args)})` : prop)
        return chainProxy
      }
    },
  })

  const editor = {
    on: () => undefined,
    off: () => undefined,
    chain: () => chainProxy,
    can: () =>
      new Proxy({}, { get: (_t, prop: string) => () => !cannot.has(prop) }),
    isActive: (name: unknown) => (typeof name === 'string' ? active.has(name) : false),
    getAttributes: () => ({}),
  }
  return { editor: editor as never, calls }
}

/** Every button the toolbar renders, tooltip bubbles excluded. */
const buttons = (container: HTMLElement) => Array.from(container.querySelectorAll('button'))

const settle = () => act(() => { vi.advanceTimersByTime(200) })

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

describe('every control is explained', () => {
  it('gives each button an accessible name', () => {
    // The name is also the hover label, so a missing one means an icon nobody can
    // identify.
    const { editor } = makeEditor()
    const { container } = render(<EditorToolbar editor={editor} />)
    for (const button of buttons(container)) {
      expect(button.getAttribute('aria-label')?.trim()).toBeTruthy()
    }
  })

  it('shows the label on hover', () => {
    const { editor } = makeEditor()
    render(<EditorToolbar editor={editor} />)
    fireEvent.mouseEnter(screen.getByLabelText('加粗').parentElement!)
    settle()
    expect(screen.getByRole('tooltip')).toHaveTextContent('加粗')
  })

  it('names the shortcut where there is one', () => {
    const { editor } = makeEditor()
    render(<EditorToolbar editor={editor} />)
    fireEvent.mouseEnter(screen.getByLabelText('撤销').parentElement!)
    settle()
    expect(screen.getByRole('tooltip')).toHaveTextContent('Ctrl+Z')
  })

  it('does not also set title, which would stack a second native tooltip', () => {
    const { editor } = makeEditor()
    const { container } = render(<EditorToolbar editor={editor} />)
    for (const button of buttons(container)) {
      expect(button.getAttribute('title')).toBeNull()
    }
  })
})

describe('no control is a bare word or glyph', () => {
  it('has dropped the text-label table buttons', () => {
    const { editor } = makeEditor({ activeNames: ['table'] })
    const { container } = render(<EditorToolbar editor={editor} />)
    for (const gone of ['+列前', '+行上', '表头列', '均分', '删表', '⌜', '⌷', '⌞']) {
      expect(container.textContent).not.toContain(gone)
    }
  })

  it('keeps the toolbar itself to icons, bar the two dropdown values', () => {
    // 段落样式 and 字号 show their current value, which is the point of them;
    // everything else on the top row is an icon.
    const { editor } = makeEditor()
    const { container } = render(<EditorToolbar editor={editor} />)
    for (const gone of ['B', 'I', 'U', 'S', 'x²', 'x₂']) {
      expect(
        buttons(container).some((b) => b.textContent?.trim() === gone),
      ).toBe(false)
    }
  })
})

describe('the table controls', () => {
  it('stay hidden outside a table', () => {
    const { editor } = makeEditor()
    render(<EditorToolbar editor={editor} />)
    expect(screen.queryByLabelText('行操作')).toBeNull()
    expect(screen.queryByLabelText('删除表格')).toBeNull()
  })

  it('collapse into three menus and one delete button', () => {
    const { editor } = makeEditor({ activeNames: ['table'] })
    render(<EditorToolbar editor={editor} />)
    expect(screen.getByLabelText('行操作')).toBeInTheDocument()
    expect(screen.getByLabelText('列操作')).toBeInTheDocument()
    expect(screen.getByLabelText('单元格')).toBeInTheDocument()
    expect(screen.getByLabelText('删除表格')).toBeInTheDocument()
  })

  it('spell out every row operation in words', () => {
    const { editor } = makeEditor({ activeNames: ['table'] })
    render(<EditorToolbar editor={editor} />)
    fireEvent.click(screen.getByLabelText('行操作'))
    const menu = screen.getByRole('menu')
    for (const label of ['上方插入行', '下方插入行', '上移一行', '下移一行', '删除当前行', '标准 36px']) {
      expect(within(menu).getByText(label)).toBeInTheDocument()
    }
  })

  it('spell out every column operation in words', () => {
    const { editor } = makeEditor({ activeNames: ['table'] })
    render(<EditorToolbar editor={editor} />)
    fireEvent.click(screen.getByLabelText('列操作'))
    const menu = screen.getByRole('menu')
    for (const label of ['左侧插入列', '右侧插入列', '左移一列', '右移一列', '均分列宽', '删除当前列']) {
      expect(within(menu).getByText(label)).toBeInTheDocument()
    }
  })

  it('offer alignment and a fill palette under 单元格', () => {
    const { editor } = makeEditor({ activeNames: ['table'] })
    render(<EditorToolbar editor={editor} />)
    fireEvent.click(screen.getByLabelText('单元格'))
    const menu = screen.getByRole('menu')
    expect(within(menu).getByText('合并 / 拆分单元格')).toBeInTheDocument()
    expect(within(menu).getByText('垂直居中')).toBeInTheDocument()
    expect(within(menu).getByLabelText('蓝')).toBeInTheDocument()
    expect(within(menu).getByLabelText('无填充')).toBeInTheDocument()
  })

  it('dispatches the command and closes the menu', () => {
    const { editor, calls } = makeEditor({ activeNames: ['table'] })
    render(<EditorToolbar editor={editor} />)
    fireEvent.click(screen.getByLabelText('行操作'))
    fireEvent.click(screen.getByText('下方插入行'))
    expect(calls).toContain('addRowAfter')
    expect(screen.queryByRole('menu')).toBeNull()
  })

  it('greys out a reorder the editor refuses', () => {
    const { editor, calls } = makeEditor({ activeNames: ['table'], cannot: ['moveRowUp'] })
    render(<EditorToolbar editor={editor} />)
    fireEvent.click(screen.getByLabelText('行操作'))
    const item = screen.getByText('上移一行')
    expect(item).toBeDisabled()
    fireEvent.click(item)
    expect(calls).not.toContain('moveRowUp')
  })

  it('add four controls to the row, not fifteen', () => {
    // The crowding was literal: entering a table used to add fifteen controls to
    // an already-full row and wrap the toolbar onto a second line.
    const outside = makeEditor()
    const { container: plain } = render(<EditorToolbar editor={outside.editor} />)
    const before = buttons(plain).length

    const inside = makeEditor({ activeNames: ['table'] })
    const { container: withTable } = render(<EditorToolbar editor={inside.editor} />)
    const after = buttons(withTable).length

    expect(after - before).toBe(4)
  })
})

describe('the menus', () => {
  it('close on an outside mousedown', () => {
    const { editor } = makeEditor()
    render(<EditorToolbar editor={editor} />)
    fireEvent.click(screen.getByLabelText('字号'))
    expect(screen.getByRole('menu')).toBeInTheDocument()
    act(() => { fireEvent.mouseDown(document.body) })
    expect(screen.queryByRole('menu')).toBeNull()
  })

  it('close on Escape', () => {
    const { editor } = makeEditor()
    render(<EditorToolbar editor={editor} />)
    fireEvent.click(screen.getByLabelText('字号'))
    act(() => { fireEvent.keyDown(document, { key: 'Escape' }) })
    expect(screen.queryByRole('menu')).toBeNull()
  })

  it('opening one closes another', () => {
    // Its trigger is outside the first menu, so the first dismisses itself.
    const { editor } = makeEditor()
    render(<EditorToolbar editor={editor} />)
    fireEvent.click(screen.getByLabelText('字号'))
    act(() => { fireEvent.mouseDown(screen.getByLabelText('段落样式')) })
    fireEvent.click(screen.getByLabelText('段落样式'))
    expect(screen.getAllByRole('menu')).toHaveLength(1)
    expect(screen.getByText('标题 1')).toBeInTheDocument()
  })

  it('applies a font size and closes', () => {
    const { editor, calls } = makeEditor()
    render(<EditorToolbar editor={editor} />)
    fireEvent.click(screen.getByLabelText('字号'))
    fireEvent.click(screen.getByText('24'))
    expect(calls.some((c) => c.startsWith('setFontSize') && c.includes('24px'))).toBe(true)
    expect(screen.queryByRole('menu')).toBeNull()
  })
})
