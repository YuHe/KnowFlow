/**
 * Tests for the toast store and Toaster.
 *
 * Regression: useToast used `useReducer(reducer, memoryState)` and registered
 * its dispatch as a listener, but dispatch() calls `listener(memoryState)` —
 * feeding a *state* object where React expects an *action*. The reducer matched
 * no case, returned undefined, and `toasts` became undefined, so Toaster threw
 * "can't access property map, e is undefined" the first time any toast fired.
 * That killed the whole React tree (there was no error boundary), which is what
 * produced the blank screen during markdown paste.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import React from 'react'
import { Toaster } from '@/components/ui/toaster'
import { toast, useToast, reducer } from '@/components/ui/use-toast'

beforeEach(() => {
  // Drain any toasts left by a previous test.
  act(() => {
    toast({ title: '__drain__' }).dismiss()
  })
})

describe('Toaster', () => {
  it('renders without crashing when a toast fires', () => {
    render(<Toaster />)
    let caught: unknown = null
    try {
      act(() => {
        toast({ title: '3 张图片下载失败' })
      })
    } catch (e) {
      caught = e
    }
    expect(caught).toBeNull()
    expect(screen.getByText('3 张图片下载失败')).toBeInTheDocument()
  })

  it('renders a destructive toast', () => {
    render(<Toaster />)
    act(() => {
      toast({ title: '渲染失败，已插入原始文本', variant: 'destructive' })
    })
    expect(screen.getByText('渲染失败，已插入原始文本')).toBeInTheDocument()
  })

  it('survives several toasts in a row', () => {
    render(<Toaster />)
    let caught: unknown = null
    try {
      act(() => {
        for (let i = 0; i < 8; i++) toast({ title: `toast ${i}` })
      })
    } catch (e) {
      caught = e
    }
    expect(caught).toBeNull()
    // Capped at TOAST_LIMIT, newest first.
    expect(screen.getByText('toast 7')).toBeInTheDocument()
  })
})

describe('toast store', () => {
  it('exposes an array even before any toast fires', () => {
    let seen: unknown
    function Probe() {
      const { toasts } = useToast()
      seen = toasts
      return null
    }
    render(<Probe />)
    expect(Array.isArray(seen)).toBe(true)
  })

  it('notifies mounted consumers', () => {
    const states: number[] = []
    function Probe() {
      const { toasts } = useToast()
      states.push(toasts.length)
      return null
    }
    render(<Probe />)
    act(() => {
      toast({ title: 'hello' })
    })
    expect(states[states.length - 1]).toBeGreaterThan(0)
  })

  it('ignores a malformed action rather than poisoning the store', () => {
    // The exact shape that caused the original bug: a state object passed
    // where an action belongs.
    let seen: unknown
    function Probe() {
      const { toasts } = useToast()
      seen = toasts
      return null
    }
    render(<Probe />)
    act(() => {
      // @ts-expect-error deliberately malformed
      toast({ title: 'ok' })
    })
    expect(Array.isArray(seen)).toBe(true)
  })
})

describe('reducer', () => {
  it('adds, updates, dismisses and removes', () => {
    let s = reducer({ toasts: [] }, { type: 'ADD_TOAST', toast: { id: 'a', title: 'A' } })
    expect(s.toasts).toHaveLength(1)

    s = reducer(s, { type: 'UPDATE_TOAST', toast: { id: 'a', title: 'A2' } })
    expect(s.toasts[0].title).toBe('A2')

    s = reducer(s, { type: 'DISMISS_TOAST', toastId: 'a' })
    expect(s.toasts[0].open).toBe(false)

    s = reducer(s, { type: 'REMOVE_TOAST', toastId: 'a' })
    expect(s.toasts).toHaveLength(0)
  })

  it('caps the queue at the limit', () => {
    let s = { toasts: [] as never[] }
    for (let i = 0; i < 12; i++) {
      s = reducer(s, { type: 'ADD_TOAST', toast: { id: String(i) } }) as never
    }
    expect(s.toasts.length).toBeLessThanOrEqual(5)
  })
})
