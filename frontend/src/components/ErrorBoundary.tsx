import React from 'react'
import { saveCrashReport } from '@/utils/crashReport'

interface Props {
  children: React.ReactNode
  /** Shown in the crash report so we can tell which boundary caught it. */
  label?: string
  /**
   * Called before the fallback renders, to capture volatile in-memory state
   * (e.g. unsaved editor content) that would otherwise be lost.
   */
  onCapture?: () => Record<string, unknown> | undefined
}

interface State {
  error: Error | null
  info: React.ErrorInfo | null
  reportId: string | null
}

/**
 * Catches render-phase exceptions so a crash shows a diagnosable screen with a
 * recovery path instead of a blank page.
 *
 * Without this, any throw during render unmounts the whole React tree — the
 * user sees white, the console message is the only evidence, and every piece of
 * unsaved editor state is gone. The boundary persists a crash report (including
 * whatever onCapture returns) to localStorage before rendering the fallback.
 */
export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null, info: null, reportId: null }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error }
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    let captured: Record<string, unknown> | undefined
    try {
      captured = this.props.onCapture?.()
    } catch (e) {
      captured = { onCaptureFailed: String(e) }
    }

    const reportId = saveCrashReport({
      label: this.props.label ?? 'app',
      message: error.message,
      stack: error.stack,
      componentStack: info.componentStack,
      captured,
    })

    // Keep the console trace — it is the fastest signal during development and
    // the only one available if localStorage is full or disabled.
    console.error(
      `[ErrorBoundary:${this.props.label ?? 'app'}] crash report ${reportId}`,
      error,
      info.componentStack,
    )

    this.setState({ info, reportId })
  }

  private handleReload = () => {
    this.setState({ error: null, info: null, reportId: null })
    window.location.reload()
  }

  render() {
    const { error, info, reportId } = this.state
    if (!error) return this.props.children

    return (
      <div className="min-h-[400px] flex items-center justify-center p-6">
        <div className="w-full max-w-2xl rounded-lg border border-red-200 bg-red-50 p-5">
          <h2 className="text-base font-semibold text-red-800">页面出错了</h2>
          <p className="mt-1 text-sm text-red-700">
            错误详情已保存到本地，可用于排查。未保存的编辑内容也已一并备份。
          </p>

          <pre className="mt-3 max-h-40 overflow-auto rounded bg-white/70 p-3 text-xs text-red-900 whitespace-pre-wrap">
            {error.message}
            {error.stack ? `\n\n${error.stack}` : ''}
            {info?.componentStack ? `\n\n组件栈:${info.componentStack}` : ''}
          </pre>

          {reportId && (
            <p className="mt-2 text-xs text-red-600">
              报告 ID: <code>{reportId}</code>（控制台执行{' '}
              <code>copy(localStorage.getItem('{reportId}'))</code> 可复制全文）
            </p>
          )}

          <div className="mt-4 flex gap-2">
            <button
              type="button"
              onClick={this.handleReload}
              className="rounded bg-red-600 px-3 py-1.5 text-xs text-white transition hover:bg-red-700"
            >
              刷新页面
            </button>
            <button
              type="button"
              onClick={() => this.setState({ error: null, info: null, reportId: null })}
              className="rounded border border-red-300 px-3 py-1.5 text-xs text-red-700 transition hover:bg-red-100"
            >
              尝试恢复（不刷新）
            </button>
          </div>
        </div>
      </div>
    )
  }
}

export default ErrorBoundary
