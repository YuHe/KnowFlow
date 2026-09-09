/**
 * useAutoSave: content may be a lazy getter.
 *
 * `editor.getHTML()` used to run inside the editor's onUpdate, i.e. on every
 * transaction — every keystroke, and (before the resize fix) every mousemove of
 * an image drag — while only the debounced save ever consumed the string. With a
 * large document, or one holding an image as a data URL, that was a full DOM
 * serialization per keypress. The editor now hands over a getter and the hook
 * calls it once, when it actually saves.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { useAutoSave } from '@/hooks/useAutoSave'

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true })
})

afterEach(() => {
  vi.useRealTimers()
})

describe('useAutoSave with a lazy getter', () => {
  it('does not call the getter when the save is merely queued', () => {
    const onSave = vi.fn().mockResolvedValue(undefined)
    const getHtml = vi.fn(() => '<p>hi</p>')
    const { result } = renderHook(() => useAutoSave({ onSave, editor: null }))

    act(() => result.current.triggerSave(getHtml))

    expect(getHtml).not.toHaveBeenCalled()
    expect(onSave).not.toHaveBeenCalled()
  })

  it('calls the getter once, when the debounce fires', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined)
    const getHtml = vi.fn(() => '<p>hi</p>')
    const { result } = renderHook(() => useAutoSave({ onSave, editor: null }))

    act(() => result.current.triggerSave(getHtml))
    await act(async () => {
      vi.advanceTimersByTime(2000)
    })

    await waitFor(() => expect(onSave).toHaveBeenCalledWith('<p>hi</p>', false))
    expect(getHtml).toHaveBeenCalledTimes(1)
  })

  it('serializes only the last edit when several arrive inside the debounce', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined)
    const first = vi.fn(() => '<p>1</p>')
    const last = vi.fn(() => '<p>3</p>')
    const { result } = renderHook(() => useAutoSave({ onSave, editor: null }))

    act(() => {
      result.current.triggerSave(first)
      result.current.triggerSave(vi.fn(() => '<p>2</p>'))
      result.current.triggerSave(last)
    })
    await act(async () => {
      vi.advanceTimersByTime(2000)
    })

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1))
    expect(first).not.toHaveBeenCalled()
    expect(last).toHaveBeenCalledTimes(1)
    expect(onSave).toHaveBeenCalledWith('<p>3</p>', false)
  })

  it('still accepts a plain string', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined)
    const { result } = renderHook(() => useAutoSave({ onSave, editor: null }))

    act(() => result.current.triggerSave('<p>plain</p>'))
    await act(async () => {
      vi.advanceTimersByTime(2000)
    })

    await waitFor(() => expect(onSave).toHaveBeenCalledWith('<p>plain</p>', false))
  })

  it('resolves the getter for a manual save too', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined)
    const onManualSave = vi.fn().mockResolvedValue(undefined)
    const getHtml = vi.fn(() => '<p>manual</p>')
    const { result } = renderHook(() => useAutoSave({ onSave, onManualSave, editor: null }))

    await act(async () => {
      await result.current.triggerManualSave(getHtml)
    })

    expect(onManualSave).toHaveBeenCalledWith('<p>manual</p>')
    expect(getHtml).toHaveBeenCalledTimes(1)
  })
})
