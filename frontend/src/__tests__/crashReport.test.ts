/**
 * Tests for the crash-recovery layer: crash reports, drafts, and the
 * empty-over-nonempty save guard.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'

const memStore: Record<string, string> = {}
vi.stubGlobal('localStorage', {
  getItem: (k: string) => (k in memStore ? memStore[k] : null),
  setItem: (k: string, v: string) => {
    memStore[k] = v
  },
  removeItem: (k: string) => {
    delete memStore[k]
  },
  clear: () => {
    for (const k of Object.keys(memStore)) delete memStore[k]
  },
  key: (i: number) => Object.keys(memStore)[i] ?? null,
  get length() {
    return Object.keys(memStore).length
  },
})

const {
  saveCrashReport,
  listCrashReports,
  clearCrashReports,
  saveDraft,
  loadDraft,
  clearDraft,
} = await import('@/utils/crashReport')

beforeEach(() => {
  for (const k of Object.keys(memStore)) delete memStore[k]
})

describe('crash reports', () => {
  it('persists a report and returns its key', () => {
    const id = saveCrashReport({ label: 'editor', message: 'boom', stack: 'at x' })
    expect(id).toMatch(/^kf_crash_\d+$/)
    const stored = JSON.parse(localStorage.getItem(id)!)
    expect(stored.message).toBe('boom')
    expect(stored.label).toBe('editor')
    expect(stored.at).toBeTruthy()
  })

  it('includes captured state so unsaved content is recoverable', () => {
    const id = saveCrashReport({
      label: 'editor',
      message: 'boom',
      captured: { editorHtml: '<p>unsaved work</p>', docId: 'd1' },
    })
    const stored = JSON.parse(localStorage.getItem(id)!)
    expect(stored.captured.editorHtml).toBe('<p>unsaved work</p>')
  })

  it('keeps at most 5 reports so a crash loop cannot fill the quota', () => {
    for (let i = 0; i < 9; i++) {
      // Distinct keys require distinct timestamps.
      vi.setSystemTime(new Date(1_700_000_000_000 + i * 1000))
      saveCrashReport({ label: 'editor', message: `boom ${i}` })
    }
    vi.useRealTimers()
    const reports = listCrashReports()
    expect(reports.length).toBeLessThanOrEqual(5)
    // The most recent one survived.
    expect(reports.some((r) => r.message === 'boom 8')).toBe(true)
  })

  it('never throws when storage rejects writes', () => {
    const original = localStorage.setItem
    // @ts-expect-error deliberately break it
    localStorage.setItem = () => {
      throw new Error('QuotaExceededError')
    }
    expect(() => saveCrashReport({ label: 'x', message: 'y' })).not.toThrow()
    localStorage.setItem = original
  })

  it('clears all reports', () => {
    saveCrashReport({ label: 'a', message: '1' })
    clearCrashReports()
    expect(listCrashReports()).toHaveLength(0)
  })
})

describe('drafts', () => {
  it('round-trips a draft', () => {
    saveDraft('doc-1', 'md-paste', '# Hello')
    const d = loadDraft('doc-1')
    expect(d?.content).toBe('# Hello')
    expect(d?.source).toBe('md-paste')
  })

  it('returns null when there is no draft', () => {
    expect(loadDraft('nope')).toBeNull()
  })

  it('ignores empty content and missing ids', () => {
    saveDraft('doc-2', 'md-paste', '')
    expect(loadDraft('doc-2')).toBeNull()
    saveDraft('', 'md-paste', 'x')
    expect(loadDraft('')).toBeNull()
  })

  it('clears a draft', () => {
    saveDraft('doc-3', 'crash', '<p>x</p>')
    clearDraft('doc-3')
    expect(loadDraft('doc-3')).toBeNull()
  })

  it('keeps drafts per document', () => {
    saveDraft('a', 'md-paste', 'AAA')
    saveDraft('b', 'md-paste', 'BBB')
    expect(loadDraft('a')?.content).toBe('AAA')
    expect(loadDraft('b')?.content).toBe('BBB')
  })

  it('survives a corrupted entry', () => {
    localStorage.setItem('kf_draft_bad', '{not json')
    expect(loadDraft('bad')).toBeNull()
  })
})
