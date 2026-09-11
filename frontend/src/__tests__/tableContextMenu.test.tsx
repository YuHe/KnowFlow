/**
 * The table right-click menu.
 *
 * Every comparable editor drives table editing from the grid; ours drove it
 * entirely from the top toolbar, whose table cluster is hidden behind
 * `isActive('table')` — which is why the controls felt missing in the first
 * place. This is the discoverable path.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import React from 'react'
import TableContextMenu from '@/components/editor/TableContextMenu'

/** Minimal editor stand-in: records the command chain that was invoked. */
function makeEditor() {
  const calls: string[] = []
  const chain: Record<string, unknown> = {}
  const commands = [
    'focus',
    'addRowBefore',
    'addRowAfter',
    'addColumnBefore',
    'addColumnAfter',
    'deleteRow',
    'deleteColumn',
    'mergeOrSplit',
    'toggleHeaderRow',
    'toggleHeaderColumn',
    'distributeTableColumns',
    'setCellAttribute',
    'deleteTable',
  ]
  for (const name of commands) {
    chain[name] = (...args: unknown[]) => {
      calls.push(args.length ? `${name}(${JSON.stringify(args)})` : name)
      return chain
    }
  }
  chain.run = () => true
  const editor = {
    chain: () => chain,
    can: () => ({ mergeOrSplit: () => true }),
  }
  return { editor: editor as never, calls }
}

const POSITION = { x: 100, y: 100 }

beforeEach(() => {
  // jsdom reports 0 for every box; the clamping effect must cope with that.
  window.innerWidth = 1200
  window.innerHeight = 800
})

describe('menu contents', () => {
  it('offers the structural edits', () => {
    const { editor } = makeEditor()
    render(<TableContextMenu editor={editor} position={POSITION} onClose={vi.fn()} />)
    for (const label of [
      '上方插入行',
      '下方插入行',
      '左侧插入列',
      '右侧插入列',
      '删除当前行',
      '删除当前列',
      '合并 / 拆分单元格',
      '切换表头行',
      '切换表头列',
      '均分列宽',
      '删除表格',
    ]) {
      expect(screen.getByText(label)).toBeInTheDocument()
    }
  })

  it('offers vertical alignment and a fill palette', () => {
    const { editor } = makeEditor()
    render(<TableContextMenu editor={editor} position={POSITION} onClose={vi.fn()} />)
    expect(screen.getByText('顶端对齐')).toBeInTheDocument()
    expect(screen.getByText('垂直居中')).toBeInTheDocument()
    expect(screen.getByText('底端对齐')).toBeInTheDocument()
    expect(screen.getByTitle('无填充')).toBeInTheDocument()
    expect(screen.getByTitle('蓝')).toBeInTheDocument()
  })

  it('does not offer sort or filter', () => {
    // 飞书 and Notion both refuse these in a document table and point at an
    // embedded spreadsheet instead; adding them here would invent a third answer.
    const { editor } = makeEditor()
    render(<TableContextMenu editor={editor} position={POSITION} onClose={vi.fn()} />)
    expect(screen.queryByText(/排序/)).toBeNull()
    expect(screen.queryByText(/筛选/)).toBeNull()
  })
})

describe('running a command', () => {
  it('dispatches the matching editor command', () => {
    const { editor, calls } = makeEditor()
    render(<TableContextMenu editor={editor} position={POSITION} onClose={vi.fn()} />)
    fireEvent.click(screen.getByText('删除当前行'))
    expect(calls).toContain('deleteRow')
  })

  it('closes afterwards', () => {
    const onClose = vi.fn()
    const { editor } = makeEditor()
    render(<TableContextMenu editor={editor} position={POSITION} onClose={onClose} />)
    fireEvent.click(screen.getByText('删除当前列'))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('passes the colour through to setCellAttribute', () => {
    const { editor, calls } = makeEditor()
    render(<TableContextMenu editor={editor} position={POSITION} onClose={vi.fn()} />)
    fireEvent.click(screen.getByTitle('蓝'))
    expect(calls.some((c) => c.startsWith('setCellAttribute') && c.includes('#dbeafe'))).toBe(true)
  })

  it('clears the fill with null rather than an empty string', () => {
    // An empty string would round-trip as `background-color: ` and linger.
    const { editor, calls } = makeEditor()
    render(<TableContextMenu editor={editor} position={POSITION} onClose={vi.fn()} />)
    fireEvent.click(screen.getByTitle('无填充'))
    expect(calls.some((c) => c.includes('backgroundColor') && c.includes('null'))).toBe(true)
  })
})

describe('dismissal', () => {
  it('closes on Escape', () => {
    const onClose = vi.fn()
    const { editor } = makeEditor()
    render(<TableContextMenu editor={editor} position={POSITION} onClose={onClose} />)
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalled()
  })

  it('closes on an outside mousedown', () => {
    const onClose = vi.fn()
    const { editor } = makeEditor()
    render(<TableContextMenu editor={editor} position={POSITION} onClose={onClose} />)
    fireEvent.mouseDown(document.body)
    expect(onClose).toHaveBeenCalled()
  })

  it('closes on a second right-click elsewhere', () => {
    const onClose = vi.fn()
    const { editor } = makeEditor()
    render(<TableContextMenu editor={editor} position={POSITION} onClose={onClose} />)
    fireEvent.contextMenu(document.body)
    expect(onClose).toHaveBeenCalled()
  })

  it('stays open when the click is inside it', () => {
    const onClose = vi.fn()
    const { editor } = makeEditor()
    const { container } = render(
      <TableContextMenu editor={editor} position={POSITION} onClose={onClose} />,
    )
    fireEvent.mouseDown(container.querySelector('[role="menu"]')!)
    expect(onClose).not.toHaveBeenCalled()
  })
})

describe('placement', () => {
  it('is fixed-positioned at the pointer', () => {
    const { editor } = makeEditor()
    const { container } = render(
      <TableContextMenu editor={editor} position={{ x: 250, y: 300 }} onClose={vi.fn()} />,
    )
    const menu = container.querySelector('[role="menu"]') as HTMLElement
    expect(menu.className).toContain('fixed')
    // jsdom measures every box as 0×0, so the clamp resolves to the raw point.
    expect(menu.style.left).toBe('250px')
    expect(menu.style.top).toBe('300px')
  })

  it('clamps so it cannot open past the viewport edge', () => {
    const { editor } = makeEditor()
    const { container } = render(
      <TableContextMenu editor={editor} position={{ x: 5000, y: 5000 }} onClose={vi.fn()} />,
    )
    const menu = container.querySelector('[role="menu"]') as HTMLElement
    expect(parseInt(menu.style.left, 10)).toBeLessThanOrEqual(window.innerWidth)
    expect(parseInt(menu.style.top, 10)).toBeLessThanOrEqual(window.innerHeight)
  })
})
