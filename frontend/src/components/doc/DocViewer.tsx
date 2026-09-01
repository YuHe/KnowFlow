import { useEffect, useMemo } from 'react'
import { renderMermaidBlocks } from '@/utils/mermaid'
import { attachCodeCopyButtons } from '@/utils/codeCopy'
import { sanitizeHtml } from '@/utils/sanitize'

interface DocViewerProps {
  content: string
  containerRef: React.RefObject<HTMLDivElement>
}

export default function DocViewer({ content, containerRef }: DocViewerProps) {
  // Sanitize untrusted HTML (from server) before insertion.
  const safeContent = useMemo(() => sanitizeHtml(content), [content])

  // Inject id attributes onto headings so OutlinePanel can scroll to them
  useEffect(() => {
    if (!containerRef.current) return
    const headings = containerRef.current.querySelectorAll('h1, h2, h3')
    headings.forEach((el, i) => {
      if (!el.id) {
        el.id = `heading-${i}`
      }
    })
  }, [safeContent, containerRef])

  // Render mermaid diagrams after content updates.
  useEffect(() => {
    if (!containerRef.current) return
    renderMermaidBlocks(containerRef.current)
  }, [safeContent, containerRef])

  // Give every code block a copy button. Mermaid blocks are skipped inside
  // attachCodeCopyButtons, so this does not need to wait on the render above.
  useEffect(() => {
    if (!containerRef.current) return
    attachCodeCopyButtons(containerRef.current)
  }, [safeContent, containerRef])

  return (
    <div
      className="doc-content prose prose-gray max-w-none"
      dangerouslySetInnerHTML={{ __html: safeContent }}
    />
  )
}
