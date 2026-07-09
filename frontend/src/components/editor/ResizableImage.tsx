import Image from '@tiptap/extension-image'
import { ReactNodeViewRenderer, NodeViewWrapper } from '@tiptap/react'
import type { NodeViewProps } from '@tiptap/react'
import { useRef } from 'react'

/**
 * Image node view with drag-to-resize handles.
 *
 * Adds a `width` attribute (rendered as the img `width` attribute so it
 * survives HTML round-trips). Height is left auto so the aspect ratio is
 * preserved while resizing by width.
 */
function ImageNodeView({ node, updateAttributes, selected, editor }: NodeViewProps) {
  const imgRef = useRef<HTMLImageElement>(null)
  const { src, alt, title, width } = node.attrs as {
    src: string
    alt?: string
    title?: string
    width?: number | null
  }
  const editable = editor.isEditable

  const startResize = (e: React.MouseEvent, side: 'left' | 'right') => {
    e.preventDefault()
    e.stopPropagation()
    const startX = e.clientX
    const startWidth = imgRef.current?.offsetWidth ?? 0
    const dir = side === 'left' ? -1 : 1

    const onMove = (ev: MouseEvent) => {
      const delta = (ev.clientX - startX) * dir
      const newWidth = Math.max(40, Math.round(startWidth + delta))
      updateAttributes({ width: newWidth })
    }
    const onUp = () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  const handleClass =
    'absolute w-2.5 h-2.5 bg-indigo-500 border border-white rounded-sm cursor-ew-resize'

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
        style={{ width: width ? `${width}px` : undefined, maxWidth: '100%', height: 'auto' }}
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
