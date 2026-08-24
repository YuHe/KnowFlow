import { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

export interface FailedImage {
  url: string
  /** Server-provided reason, already humanized. */
  reason: string
}

interface Props {
  images: FailedImage[]
  open: boolean
  onClose: () => void
}

/**
 * Reports images that could not be localized.
 *
 * A toast is too transient for this: the list is actionable (the user may need
 * to re-host the images or accept that they only render on the origin network),
 * and it can be long. The original external links are kept in the document, so
 * the images still render wherever those URLs are reachable.
 */
export function FailedImagesDialog({ images, open, onClose }: Props) {
  const [copied, setCopied] = useState(false)

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
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{images.length} 张图片无法下载到本地</DialogTitle>
          <DialogDescription>
            这些图片已保留原始外链，文档内容不受影响。在能访问这些链接的网络环境下仍可正常显示；
            否则会显示为裂图。
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-72 overflow-auto rounded border border-gray-200 divide-y divide-gray-100">
          {images.map((img, i) => (
            <div key={`${img.url}-${i}`} className="px-3 py-2 text-xs">
              <div className="break-all font-mono text-gray-700">{img.url}</div>
              <div className="mt-0.5 text-gray-500">{img.reason}</div>
            </div>
          ))}
        </div>

        <DialogFooter>
          <button
            type="button"
            onClick={copyAll}
            className="rounded border border-gray-300 px-3 py-1.5 text-xs text-gray-600 transition hover:bg-gray-50"
          >
            {copied ? '已复制' : '复制全部链接'}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded bg-indigo-600 px-3 py-1.5 text-xs text-white transition hover:bg-indigo-700"
          >
            知道了
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export default FailedImagesDialog
