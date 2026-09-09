/**
 * Client-side image downscaling before upload.
 *
 * The backend caps images at IMAGE_MAX_SIZE_MB (10MB) and rejects anything
 * larger with a 413. A macOS Retina screenshot is routinely 5–15MB PNG, so
 * pasting one sat right on that cliff — and the paste path swallowed the error,
 * so the image simply vanished with no explanation.
 *
 * Downscaling also fixes the second-order problem: a 15MB image that *is*
 * accepted still has to be serialized and round-tripped on every save.
 */

/** Longest edge, in device-independent pixels, kept after downscaling. */
const MAX_EDGE = 2000
/** Only bother re-encoding when the file is above this. */
const SIZE_THRESHOLD_BYTES = 1.5 * 1024 * 1024
const JPEG_QUALITY = 0.85

/** Formats that must not be re-encoded: vector, or animation we would flatten. */
const PASSTHROUGH_TYPES = new Set(['image/svg+xml', 'image/gif', 'image/avif'])

function loadBitmap(file: File): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === 'function') {
    return createImageBitmap(file)
  }
  // jsdom and older Safari: fall back to an <img> and an object URL.
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      resolve(img)
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('image decode failed'))
    }
    img.src = url
  })
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, JPEG_QUALITY))
}

/**
 * Return a smaller version of `file`, or the original when shrinking it is not
 * worthwhile or not possible.
 *
 * Never throws: a failure here must not stop the paste, it just means the
 * original bytes get uploaded and the server decides.
 */
export async function downscaleImage(file: File): Promise<File> {
  if (PASSTHROUGH_TYPES.has(file.type)) return file
  if (!file.type.startsWith('image/')) return file
  if (file.size <= SIZE_THRESHOLD_BYTES) return file
  if (typeof document === 'undefined') return file

  try {
    const bitmap = await loadBitmap(file)
    const width = 'width' in bitmap ? bitmap.width : 0
    const height = 'height' in bitmap ? bitmap.height : 0
    if (!width || !height) return file

    const ratio = Math.min(1, MAX_EDGE / Math.max(width, height))
    // Below the size threshold we already returned; a large *file* with small
    // dimensions is usually a PNG that re-encodes well, so still go through.
    const targetWidth = Math.max(1, Math.round(width * ratio))
    const targetHeight = Math.max(1, Math.round(height * ratio))

    const canvas = document.createElement('canvas')
    canvas.width = targetWidth
    canvas.height = targetHeight
    const ctx = canvas.getContext('2d')
    if (!ctx) return file
    ctx.drawImage(bitmap as CanvasImageSource, 0, 0, targetWidth, targetHeight)
    if ('close' in bitmap && typeof bitmap.close === 'function') bitmap.close()

    // PNG screenshots re-encode far smaller as JPEG; keep PNG only when the
    // source may rely on transparency.
    const outType = file.type === 'image/png' ? 'image/jpeg' : file.type
    const blob = await canvasToBlob(canvas, outType)
    if (!blob || blob.size >= file.size) return file

    const ext = outType === 'image/jpeg' ? 'jpg' : outType.split('/')[1] || 'img'
    const base = file.name.replace(/\.[^.]+$/, '') || 'image'
    return new File([blob], `${base}.${ext}`, { type: outType, lastModified: Date.now() })
  } catch {
    return file
  }
}

/** Convert a `data:` URL to a File so it can go through the normal upload. */
export async function dataUrlToFile(dataUrl: string, name = 'pasted-image'): Promise<File | null> {
  try {
    const response = await fetch(dataUrl)
    const blob = await response.blob()
    if (!blob.type.startsWith('image/')) return null
    const ext = blob.type.split('/')[1] || 'png'
    return new File([blob], `${name}.${ext}`, { type: blob.type })
  } catch {
    return null
  }
}
