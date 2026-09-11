/**
 * The hover label.
 *
 * The toolbar is almost entirely icons, and their only explanation used to be the
 * `title` attribute — shown after about a second, in a style we do not control.
 * These tests pin the three details that decide whether the replacement helps or
 * irritates: the delay, the portal, and dismissal on click.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import React from 'react'
import Tooltip from '@/components/ui/Tooltip'

function mount(label = '加粗', shortcut?: string) {
  return render(
    <Tooltip label={label} shortcut={shortcut}>
      <button type="button">B</button>
    </Tooltip>,
  )
}

const hover = (view: ReturnType<typeof render>) =>
  fireEvent.mouseEnter(view.container.firstElementChild!)

const unhover = (view: ReturnType<typeof render>) =>
  fireEvent.mouseLeave(view.container.firstElementChild!)

const settle = () => act(() => { vi.advanceTimersByTime(200) })

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

describe('showing', () => {
  it('says nothing until the pointer stays', () => {
    // Zero delay would flash a bubble every time the pointer crosses the toolbar
    // on its way somewhere else.
    const view = mount()
    hover(view)
    expect(screen.queryByRole('tooltip')).toBeNull()
    settle()
    expect(screen.getByRole('tooltip')).toHaveTextContent('加粗')
  })

  it('appends the shortcut when there is one', () => {
    const view = mount('加粗', 'Ctrl+B')
    hover(view)
    settle()
    expect(screen.getByRole('tooltip')).toHaveTextContent('Ctrl+B')
  })

  it('shows on keyboard focus too', () => {
    const view = mount()
    fireEvent.focus(view.container.firstElementChild!)
    settle()
    expect(screen.getByRole('tooltip')).toBeInTheDocument()
  })
})

describe('hiding', () => {
  it('goes away when the pointer leaves', () => {
    const view = mount()
    hover(view)
    settle()
    unhover(view)
    expect(screen.queryByRole('tooltip')).toBeNull()
  })

  it('never appears if the pointer leaves before the delay', () => {
    const view = mount()
    hover(view)
    unhover(view)
    settle()
    expect(screen.queryByRole('tooltip')).toBeNull()
  })

  it('goes away on a click anywhere', () => {
    // Otherwise clicking the button leaves the label hanging over whatever the
    // click revealed.
    const view = mount()
    hover(view)
    settle()
    act(() => { fireEvent.mouseDown(document.body) })
    expect(screen.queryByRole('tooltip')).toBeNull()
  })
})

describe('placement', () => {
  it('renders outside the trigger subtree', () => {
    // The toolbar is `sticky` and its menus sit at z-50; a bubble rendered in
    // place would be clipped by the toolbar and stack under the menus.
    const view = mount()
    hover(view)
    settle()
    const bubble = screen.getByRole('tooltip')
    expect(view.container.contains(bubble)).toBe(false)
    expect(document.body.contains(bubble)).toBe(true)
  })

  it('cannot intercept the click aimed at the control it describes', () => {
    const view = mount()
    hover(view)
    settle()
    expect(screen.getByRole('tooltip').className).toContain('pointer-events-none')
  })

  it('is positioned in viewport coordinates', () => {
    const view = mount()
    hover(view)
    settle()
    expect(screen.getByRole('tooltip').className).toContain('fixed')
  })
})
