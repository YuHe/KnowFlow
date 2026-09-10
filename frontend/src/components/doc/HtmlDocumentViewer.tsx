import { useEffect, useRef, useState } from 'react'
import { sanitizeHtml } from '@/utils/sanitize'

/**
 * Render a standalone HTML document faithfully, inside a shadow root.
 *
 * An LLM-generated report styles itself with a `<style>` block full of global
 * selectors (`body`, `.card`, `h2`). Injected into the page those rules restyle
 * the application's own chrome. A shadow root is a style boundary in both
 * directions: the report's CSS cannot escape, and the app's CSS (including
 * Tailwind's preflight and the `prose` rules) cannot reach in and distort the
 * report.
 *
 * Chosen over a sandboxed iframe because the content stays in the same document:
 * height flows naturally with no measurement, find-in-page reaches the text,
 * selection and copy work across the boundary, and printing/PDF just works.
 *
 * A shadow root is NOT a security boundary — script inside it would still run —
 * so the sanitizer does the security work. `sanitizeHtml` strips script, event
 * handlers and `javascript:` URLs; it is applied here as well as on save, so a
 * document stored before that was in place still renders safely.
 */
interface HtmlDocumentViewerProps {
  html: string
  className?: string
}

export default function HtmlDocumentViewer({ html, className }: HtmlDocumentViewerProps) {
  const hostRef = useRef<HTMLDivElement>(null)
  const shadowRef = useRef<ShadowRoot | null>(null)
  const [isolationFailed, setIsolationFailed] = useState(false)

  useEffect(() => {
    const host = hostRef.current
    if (!host) return

    // attachShadow throws if the element already has a shadow root, which can
    // happen when React reuses a DOM node across a remount. Re-read it in that
    // case rather than giving up.
    if (!shadowRef.current) {
      shadowRef.current = host.shadowRoot
    }
    if (!shadowRef.current) {
      try {
        shadowRef.current = host.attachShadow({ mode: 'open' })
      } catch {
        shadowRef.current = null
      }
    }

    if (!shadowRef.current) {
      // Deliberately render nothing rather than falling back to the light DOM.
      // The report's <style> uses global selectors, so injecting it into the page
      // would restyle the whole application — a far worse outcome than showing a
      // notice. An earlier version of this component did exactly that.
      setIsolationFailed(true)
      return
    }

    setIsolationFailed(false)
    shadowRef.current.innerHTML = sanitizeHtml(html)
  }, [html])

  return (
    <>
      <div ref={hostRef} className={className} data-html-document="true" />
      {isolationFailed && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          当前浏览器无法为 HTML 文档创建样式隔离容器，为避免其样式影响整个页面，已暂停渲染。
          请切换到「源码」查看内容。
        </div>
      )}
    </>
  )
}
