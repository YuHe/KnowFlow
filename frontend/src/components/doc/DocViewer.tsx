import { useEffect } from 'react'
import { renderMermaidBlocks } from '@/utils/mermaid'

interface DocViewerProps {
  content: string
  containerRef: React.RefObject<HTMLDivElement>
}

export default function DocViewer({ content, containerRef }: DocViewerProps) {
  // Inject id attributes onto headings so OutlinePanel can scroll to them
  useEffect(() => {
    if (!containerRef.current) return
    const headings = containerRef.current.querySelectorAll('h1, h2, h3')
    headings.forEach((el, i) => {
      if (!el.id) {
        el.id = `heading-${i}`
      }
    })
  }, [content, containerRef])

  // Render mermaid diagrams after content updates.
  useEffect(() => {
    if (!containerRef.current) return
    renderMermaidBlocks(containerRef.current)
  }, [content, containerRef])

  return (
    <div
      className="doc-content prose prose-gray max-w-none"
      dangerouslySetInnerHTML={{ __html: content }}
    />
  )
}
