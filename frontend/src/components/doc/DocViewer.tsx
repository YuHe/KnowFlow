import { useEffect, useMemo } from 'react'
import { renderMermaidBlocks } from '@/utils/mermaid'
import { attachCodeCopyButtons } from '@/utils/codeCopy'
import { highlightCodeBlocks } from '@/utils/codeHighlight'
import { sanitizeForLightDom } from '@/utils/sanitize'
import HtmlDocumentViewer from '@/components/doc/HtmlDocumentViewer'
import type { ContentFormat } from '@/types'

interface DocViewerProps {
  content: string
  containerRef: React.RefObject<HTMLDivElement>
  /**
   * Defaults to rich text. A standalone HTML document is delegated to
   * HtmlDocumentViewer, which isolates it in a shadow root — its CSS is written
   * with global selectors and would otherwise restyle the whole application.
   */
  format?: ContentFormat
}

export default function DocViewer({ content, containerRef, format = 'richtext' }: DocViewerProps) {
  // Sanitize untrusted HTML (from server) before insertion. This injects into
  // the page's own DOM, so page-scoped elements (<style>, <link>) are dropped —
  // see sanitizeForLightDom.
  const safeContent = useMemo(() => sanitizeForLightDom(content), [content])
  const isHtmlDocument = format === 'html'

  // Inject id attributes onto headings so OutlinePanel can scroll to them
  useEffect(() => {
    if (isHtmlDocument || !containerRef.current) return
    const headings = containerRef.current.querySelectorAll('h1, h2, h3')
    headings.forEach((el, i) => {
      if (!el.id) {
        el.id = `heading-${i}`
      }
    })
  }, [safeContent, containerRef, isHtmlDocument])

  // Render mermaid diagrams after content updates.
  useEffect(() => {
    if (isHtmlDocument || !containerRef.current) return
    renderMermaidBlocks(containerRef.current)
  }, [safeContent, containerRef, isHtmlDocument])

  // Give every code block a copy button. Mermaid blocks are skipped inside
  // attachCodeCopyButtons, so this does not need to wait on the render above.
  useEffect(() => {
    if (isHtmlDocument || !containerRef.current) return
    attachCodeCopyButtons(containerRef.current)
  }, [safeContent, containerRef, isHtmlDocument])

  // Syntax-highlight code blocks. The stored HTML carries only a
  // `language-*` class — TipTap highlights with ProseMirror decorations, which
  // are never serialized — so without this pass the read view shows code in a
  // single flat colour. Runs after the copy buttons because both walk the same
  // <pre> elements and this one is the more expensive of the two.
  useEffect(() => {
    if (isHtmlDocument || !containerRef.current) return
    highlightCodeBlocks(containerRef.current)
  }, [safeContent, containerRef, isHtmlDocument])

  // A standalone HTML document is self-contained: it brings its own styling and
  // must not be touched by the rich-text passes above, nor injected into the
  // page's DOM.
  if (isHtmlDocument) {
    return <HtmlDocumentViewer html={content} />
  }

  return (
    <div
      className="doc-content prose prose-gray max-w-none"
      dangerouslySetInnerHTML={{ __html: safeContent }}
    />
  )
}
