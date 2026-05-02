/**
 * Utility function tests.
 *
 * Tests formatDate, formatRelativeTime, countWords, and debounce helpers.
 * These functions are expected to be exported from `@/lib/utils` (or a
 * similar path). Adjust the import path to match the actual source location.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// ---------------------------------------------------------------------------
// Inline implementations for testing (mirrors what the production utils
// module should export). Replace the import below with the real module once
// the file exists at the expected path.
//
// import { formatDate, formatRelativeTime, countWords, debounce } from '@/lib/utils'
// ---------------------------------------------------------------------------

function formatDate(dateStr: string): string {
  const date = new Date(dateStr)
  if (isNaN(date.getTime())) return ''
  return date.toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
}

function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffSec = Math.floor(diffMs / 1000)
  const diffMin = Math.floor(diffSec / 60)
  const diffHour = Math.floor(diffMin / 60)
  const diffDay = Math.floor(diffHour / 24)

  if (diffSec < 60) return '刚刚'
  if (diffMin < 60) return `${diffMin}分钟前`
  if (diffHour < 24) return `${diffHour}小时前`
  if (diffDay < 30) return `${diffDay}天前`
  return formatDate(dateStr)
}

function countWords(text: string): number {
  if (!text || !text.trim()) return 0
  // Count CJK characters individually + split Latin words by whitespace
  const cjkMatches = text.match(/[\u4e00-\u9fff\u3400-\u4dbf]/g)
  const latinWords = text
    .replace(/[\u4e00-\u9fff\u3400-\u4dbf]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
  return (cjkMatches?.length ?? 0) + latinWords.length
}

function debounce<T extends (...args: unknown[]) => unknown>(
  fn: T,
  delay: number
): (...args: Parameters<T>) => void {
  let timerId: ReturnType<typeof setTimeout> | null = null
  return (...args: Parameters<T>) => {
    if (timerId !== null) clearTimeout(timerId)
    timerId = setTimeout(() => {
      fn(...args)
    }, delay)
  }
}

// ---------------------------------------------------------------------------
// formatDate
// ---------------------------------------------------------------------------

describe('formatDate', () => {
  it('formats a valid ISO date string to a readable date', () => {
    const result = formatDate('2024-03-15T10:00:00Z')
    // Should contain the year and numeric month/day
    expect(result).toMatch(/2024/)
  })

  it('returns empty string for an invalid date', () => {
    expect(formatDate('not-a-date')).toBe('')
  })

  it('handles date at midnight UTC', () => {
    const result = formatDate('2024-01-01T00:00:00Z')
    expect(result).toMatch(/2024/)
  })
})

// ---------------------------------------------------------------------------
// formatRelativeTime
// ---------------------------------------------------------------------------

describe('formatRelativeTime', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2024-06-01T12:00:00Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns "刚刚" for a timestamp less than 60 seconds ago', () => {
    const recent = new Date(Date.now() - 30 * 1000).toISOString()
    expect(formatRelativeTime(recent)).toBe('刚刚')
  })

  it('returns minutes ago for a timestamp 5 minutes ago', () => {
    const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString()
    expect(formatRelativeTime(fiveMinAgo)).toBe('5分钟前')
  })

  it('returns hours ago for a timestamp 3 hours ago', () => {
    const threeHoursAgo = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString()
    expect(formatRelativeTime(threeHoursAgo)).toBe('3小时前')
  })

  it('returns days ago for a timestamp 2 days ago', () => {
    const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString()
    expect(formatRelativeTime(twoDaysAgo)).toBe('2天前')
  })

  it('falls back to formatted date for timestamps older than 30 days', () => {
    const oldDate = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString()
    const result = formatRelativeTime(oldDate)
    expect(result).not.toBe('刚刚')
    expect(result).toMatch(/\d{4}/)
  })
})

// ---------------------------------------------------------------------------
// countWords
// ---------------------------------------------------------------------------

describe('countWords', () => {
  it('returns 0 for an empty string', () => {
    expect(countWords('')).toBe(0)
  })

  it('returns 0 for a whitespace-only string', () => {
    expect(countWords('   ')).toBe(0)
  })

  it('counts Latin words correctly', () => {
    expect(countWords('hello world test')).toBe(3)
  })

  it('counts CJK characters individually', () => {
    expect(countWords('你好世界')).toBe(4)
  })

  it('counts mixed CJK and Latin text', () => {
    // "hello 你好" → 1 Latin word + 2 CJK = 3
    expect(countWords('hello 你好')).toBe(3)
  })

  it('handles multiple spaces between words', () => {
    expect(countWords('hello   world')).toBe(2)
  })
})

// ---------------------------------------------------------------------------
// debounce
// ---------------------------------------------------------------------------

describe('debounce', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('does not invoke the function before the delay expires', () => {
    const fn = vi.fn()
    const debounced = debounce(fn, 300)
    debounced()
    expect(fn).not.toHaveBeenCalled()
  })

  it('invokes the function after the delay', () => {
    const fn = vi.fn()
    const debounced = debounce(fn, 300)
    debounced()
    vi.advanceTimersByTime(300)
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('resets the timer when called multiple times within the delay', () => {
    const fn = vi.fn()
    const debounced = debounce(fn, 300)
    debounced()
    vi.advanceTimersByTime(200)
    debounced()
    vi.advanceTimersByTime(200)
    // Still within 300ms of the last call – should not have fired yet
    expect(fn).not.toHaveBeenCalled()
    vi.advanceTimersByTime(100)
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('passes arguments to the underlying function', () => {
    const fn = vi.fn()
    const debounced = debounce(fn, 100)
    debounced('a', 1)
    vi.advanceTimersByTime(100)
    expect(fn).toHaveBeenCalledWith('a', 1)
  })
})
