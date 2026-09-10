import React from 'react'

/**
 * Toolbar for a standalone HTML document.
 *
 * The rich-text toolbar cannot be reused: every one of its buttons calls into a
 * TipTap `Editor`, and an HTML document has none — it is edited as source. The
 * formatting controls are shown disabled rather than hidden, so the row keeps
 * the same shape as the rich-text toolbar and it is visible *why* they cannot be
 * used, per the agreed interaction.
 */
interface HtmlDocumentToolbarProps {
  zoom?: number
  onZoomChange?: (zoom: number) => void
  sourceMode: boolean
  onSourceModeChange: (v: boolean) => void
}

const DISABLED_HINT = 'HTML 文档不支持富文本格式操作，请切换到「源码」直接编辑 HTML'

const DisabledButton: React.FC<{ label: string; children: React.ReactNode }> = ({
  label,
  children,
}) => (
  <button
    type="button"
    disabled
    aria-label={label}
    title={DISABLED_HINT}
    className="w-7 h-7 flex items-center justify-center rounded text-sm text-gray-600 opacity-40 cursor-not-allowed"
  >
    {children}
  </button>
)

const Divider = () => <div className="w-px h-5 bg-gray-200 mx-1" />

export default function HtmlDocumentToolbar({
  zoom = 100,
  onZoomChange,
  sourceMode,
  onSourceModeChange,
}: HtmlDocumentToolbarProps) {
  return (
    <div className="border-b border-gray-200 bg-white px-3 py-1.5 flex items-center gap-0.5 flex-wrap flex-shrink-0">
      {/* Shown disabled so the row matches the rich-text toolbar and the reason
          is discoverable from the tooltip. */}
      <DisabledButton label="加粗"><span className="font-bold">B</span></DisabledButton>
      <DisabledButton label="斜体"><span className="italic">I</span></DisabledButton>
      <DisabledButton label="下划线"><span className="underline">U</span></DisabledButton>
      <DisabledButton label="删除线"><span className="line-through">S</span></DisabledButton>
      <Divider />
      <DisabledButton label="标题"><span className="text-xs font-medium">H</span></DisabledButton>
      <DisabledButton label="列表"><span className="text-xs">☰</span></DisabledButton>
      <DisabledButton label="表格"><span className="text-xs">⊞</span></DisabledButton>
      <DisabledButton label="图片"><span className="text-xs">🖼</span></DisabledButton>
      <Divider />

      <span className="text-xs text-gray-400 px-1.5" title={DISABLED_HINT}>
        HTML 文档
      </span>

      <div className="flex-1" />

      {onZoomChange && (
        <>
          <button
            type="button"
            onClick={() => onZoomChange(Math.max(50, zoom - 10))}
            title="缩小"
            className="w-7 h-7 flex items-center justify-center rounded text-gray-600 hover:bg-gray-100 transition"
          >
            −
          </button>
          <span className="text-xs text-gray-500 w-10 text-center">{zoom}%</span>
          <button
            type="button"
            onClick={() => onZoomChange(Math.min(200, zoom + 10))}
            title="放大"
            className="w-7 h-7 flex items-center justify-center rounded text-gray-600 hover:bg-gray-100 transition"
          >
            +
          </button>
          <Divider />
        </>
      )}

      <button
        type="button"
        onClick={() => onSourceModeChange(!sourceMode)}
        title={sourceMode ? '切回渲染结果' : '编辑 HTML 源码'}
        className={`h-7 px-2 flex items-center rounded text-xs transition ${
          sourceMode
            ? 'bg-indigo-100 text-indigo-700 font-medium'
            : 'text-gray-600 hover:bg-gray-100'
        }`}
      >
        {sourceMode ? '渲染' : '源码'}
      </button>
    </div>
  )
}
