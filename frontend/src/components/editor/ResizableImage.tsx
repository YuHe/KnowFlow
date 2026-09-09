import Image from '@tiptap/extension-image'
import { ReactNodeViewRenderer, NodeViewWrapper } from '@tiptap/react'
import type { NodeViewProps } from '@tiptap/react'
import { useEffect, useRef, useState } from 'react'

/**
 * Image node view with drag-to-resize handles.
 *
 * Adds a `width` attribute (rendered as the img `width` attribute so it
 * survives HTML round-trips). Height is left auto so the aspect ratio is
 * preserved while resizing by width.
 */
function ImageNodeView({ node, updateAttributes, selected, editor }: NodeViewProps) {
  const imgRef = useRef<HTMLImageElement>(null)
  // Width while dragging. Kept in React state rather than in the document:
  // updateAttributes dispatches a real ProseMirror transaction, and one per
  // mousemove means a full editor.getHTML() serialization plus a re-render of
  // every node view in the document, ~60-120 times a second, with an undo entry
  // for each. The document is written once, on mouseup. This mirrors what
  // TableRowHeight already does for row-height drags.
  const [previewWidth, setPreviewWidth] = useState<number | null>(null)
  const teardownRef = useRef<(() => void) | null>(null)
  const { src, alt, title, width } = node.attrs as {
    src: string
    alt?: string
    title?: string
    width?: number | null
  }
  const editable = editor.isEditable

  // The node view can unmount mid-drag (an autosave-driven re-render is enough),
  // which would otherwise leave the window listeners attached forever.
  useEffect(() => () => teardownRef.current?.(), [])

  const startResize = (e: React.MouseEvent, side: 'left' | 'right') => {
    e.preventDefault()
    e.stopPropagation()
    const img = imgRef.current
    if (!img) return

    const startX = e.clientX
    const startWidth = img.offsetWidth
    const dir = side === 'left' ? -1 : 1
    // An ancestor may carry a CSS zoom (the editor page has a zoom control), so
    // pointer deltas are in screen pixels while offsetWidth is in layout pixels.
    // Deriving the factor from the rendered box covers zoom and transforms alike.
    const rect = img.getBoundingClientRect()
    const scale = startWidth > 0 && rect.width > 0 ? rect.width / startWidth : 1

    let latest = startWidth

    const onMove = (ev: MouseEvent) => {
      const delta = ((ev.clientX - startX) * dir) / scale
      latest = Math.max(40, Math.round(startWidth + delta))
      setPreviewWidth(latest)
    }
    const teardown = () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      teardownRef.current = null
    }
    const onUp = () => {
      teardown()
      setPreviewWidth(null)
      if (latest !== width) updateAttributes({ width: latest })
    }

    teardownRef.current = teardown
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  const handleClass =
    'absolute w-2.5 h-2.5 bg-indigo-500 border border-white rounded-sm cursor-ew-resize'
  const shownWidth = previewWidth ?? width

  return (
    <NodeViewWrapper
      className="resizable-image"
      style={{ display: 'inline-block', position: 'relative', lineHeight: 0, maxWidth: '100%' }}
      data-drag-handle
    >
      <img
        ref={imgRef}
        src={src}
        alt={alt}
        title={title}
        draggable={false}
        style={{ width: shownWidth ? `${shownWidth}px` : undefined, maxWidth: '100%', height: 'auto' }}
        className={`rounded-lg ${selected ? 'ring-2 ring-indigo-400' : ''}`}
      />
      {editable && selected && (
        <>
          <span
            role="presentation"
            onMouseDown={(e) => startResize(e, 'left')}
            className={handleClass}
            style={{ left: -5, bottom: -5 }}
          />
          <span
            role="presentation"
            onMouseDown={(e) => startResize(e, 'right')}
            className={handleClass}
            style={{ right: -5, bottom: -5 }}
          />
        </>
      )}
    </NodeViewWrapper>
  )
}

export const ResizableImage = Image.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      width: {
        default: null,
        parseHTML: (element) => {
          const attr = element.getAttribute('width')
          if (attr) return parseInt(attr, 10) || null
          const style = element.style.width
          if (style) return parseInt(style, 10) || null
          return null
        },
        renderHTML: (attributes) => {
          if (!attributes.width) return {}
          return { width: attributes.width }
        },
      },
    }
  },
  addNodeView() {
    return ReactNodeViewRenderer(ImageNodeView)
  },
})
