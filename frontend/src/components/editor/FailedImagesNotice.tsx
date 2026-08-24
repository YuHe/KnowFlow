import { useState } from 'react'
import type { FailedImage } from '@/utils/remoteImages'

interface Props {
  images: FailedImage[]
  onDismiss: () => void
}

/**
 * Reports images that could not be localized, as an inline banner.
 *
 * Deliberately not a modal: a dialog with a dark overlay pops up over the
 * freshly-inserted document and reads as "nothing rendered", which is exactly
 * the opposite of what happened. The document is complete — only the image
 * bytes are missing — so the notice must not obscure it. Collapsed by default;
 * the list is available on demand.
 */
export function FailedImagesNotice({ images, onDismiss }: Props) {
  const [expanded, setExpanded] = useState(false)
  const [copied, setCopied] = useState(false)

  if (images.length === 0) return null

  const copyAll = async () => {
    try {
      await navigator.clipboard.writeText(images.map((i) => i.url).join('\n'))
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      setCopied(false)
    }
  }

  return (
    <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm">
      <div className="flex items-center gap-2">
        <svg className="w-4 h-4 flex-shrink-0 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M5 19h14a2 2 0 001.84-2.75L13.74 4a2 2 0 00-3.5 0l-7.1 12.25A2 2 0 004.98 19z" />
        </svg>
        <span className="flex-1 text-amber-800">
          {images.length} 张图片未能下载到本地，已在原位置保留图片和原始链接，其余内容已正常渲染
        </span>
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="rounded border border-amber-300 px-2 py-0.5 text-xs text-amber-700 transition hover:bg-amber-100"
        >
          {expanded ? '收起' : '查看详情'}
        </button>
        <button
          type="button"
          onClick={onDismiss}
          title="关闭"
          className="p-1 text-amber-400 transition hover:text-amber-600"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {expanded && (
        <>
          <div className="mt-2 max-h-56 overflow-auto rounded border border-amber-200 bg-white divide-y divide-amber-100">
            {images.map((img, i) => (
              <div key={`${img.url}-${i}`} className="px-3 py-2 text-xs">
                <div className="break-all font-mono text-gray-700">{img.url}</div>
                <div className="mt-0.5 text-gray-500">{img.reason}</div>
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={copyAll}
            className="mt-2 rounded border border-amber-300 px-2 py-0.5 text-xs text-amber-700 transition hover:bg-amber-100"
          >
            {copied ? '已复制' : '复制全部链接'}
          </button>
        </>
      )}
    </div>
  )
}

export default FailedImagesNotice
