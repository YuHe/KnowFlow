import { useEffect, useRef } from 'react'
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

  useEffect(() => {
    const host = hostRef.current
    if (!host) return

    // attachShadow throws if called twice on the same element, and React may
    // re-run this effect for the same host.
    if (!shadowRef.current) {
      try {
        shadowRef.current = host.attachShadow({ mode: 'open' })
      } catch {
        // Already attached (fast refresh), or unsupported. Fall back to the host
        // itself: the report still renders, it just is not style-isolated.
        shadowRef.current = null
      }
    }

    const target: ShadowRoot | HTMLElement = shadowRef.current ?? host
    target.innerHTML = sanitizeHtml(html)
  }, [html])

  return <div ref={hostRef} className={className} data-html-document="true" />
}
