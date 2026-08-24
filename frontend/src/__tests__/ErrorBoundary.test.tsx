/**
 * Tests for the ErrorBoundary: it must catch render-phase throws, capture
 * volatile state, and persist a diagnosable report instead of blanking.
 */
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import React from 'react'

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

const { ErrorBoundary } = await import('@/components/ErrorBoundary')
const { listCrashReports } = await import('@/utils/crashReport')

function Boom({ message = 'kaboom' }: { message?: string }): JSX.Element {
  throw new Error(message)
}

let consoleErr: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  for (const k of Object.keys(memStore)) delete memStore[k]
  // React logs caught errors; silence it so the output stays readable.
  consoleErr = vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  consoleErr.mockRestore()
})

describe('ErrorBoundary', () => {
  it('renders children when nothing throws', () => {
    render(
      <ErrorBoundary label="t">
        <div>all good</div>
      </ErrorBoundary>,
    )
    expect(screen.getByText('all good')).toBeInTheDocument()
  })

  it('shows a fallback instead of unmounting the tree', () => {
    render(
      <ErrorBoundary label="t">
        <Boom />
      </ErrorBoundary>,
    )
    expect(screen.getByText('页面出错了')).toBeInTheDocument()
    // The message must be visible — a blank screen was the original bug.
    expect(screen.getByText(/kaboom/)).toBeInTheDocument()
  })

  it('persists a crash report containing the error', () => {
    render(
      <ErrorBoundary label="editor">
        <Boom message="insertContent failed" />
      </ErrorBoundary>,
    )
    const reports = listCrashReports()
    expect(reports).toHaveLength(1)
    expect(reports[0].message).toBe('insertContent failed')
    expect(reports[0].label).toBe('editor')
    expect(reports[0].componentStack).toBeTruthy()
  })

  it('captures volatile state via onCapture', () => {
    render(
      <ErrorBoundary
        label="editor"
        onCapture={() => ({ editorHtml: '<p>unsaved</p>', docId: 'd9' })}
      >
        <Boom />
      </ErrorBoundary>,
    )
    const [report] = listCrashReports()
    expect(report.captured?.editorHtml).toBe('<p>unsaved</p>')
    expect(report.captured?.docId).toBe('d9')
  })

  it('still reports when onCapture itself throws', () => {
    render(
      <ErrorBoundary
        label="editor"
        onCapture={() => {
          throw new Error('capture blew up')
        }}
      >
        <Boom />
      </ErrorBoundary>,
    )
    const [report] = listCrashReports()
    expect(report).toBeTruthy()
    expect(String(report.captured?.onCaptureFailed)).toContain('capture blew up')
  })

  it('offers a recovery path', () => {
    render(
      <ErrorBoundary label="t">
        <Boom />
      </ErrorBoundary>,
    )
    expect(screen.getByRole('button', { name: /刷新页面/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /尝试恢复/ })).toBeInTheDocument()
  })
})
