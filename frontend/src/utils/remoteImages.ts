import { assetsApi } from '@/api/assets'

/**
 * Markdown image syntax: ![alt](url). Captures the URL in group 2.
 * Matches the common form; doesn't try to handle the rare reference-style
 * `![alt][ref]` because pasted articles virtually always use inline form.
 */
const MD_IMG_RE = /!\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g

/**
 * Max downloads in flight. Browsers cap concurrent HTTP/1.1 connections per
 * host at ~6, and an XHR's timeout starts at send() — including queue time.
 * Firing all images at once means later ones time out while still queued,
 * even when nothing is wrong. Staying under the connection cap keeps every
 * request's timeout measuring the actual download.
 */
const MAX_CONCURRENT = 4

function isRemoteLink(url: string): boolean {
  return /^https?:\/\//i.test(url) && !url.startsWith('/uploads/')
}

/**
 * Run tasks with at most `limit` in flight, preserving result order.
 * Never rejects: a failed task resolves to null.
 */
async function mapLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<(R | null)[]> {
  const results: (R | null)[] = new Array(items.length).fill(null)
  let next = 0

  const worker = async (): Promise<void> => {
    while (next < items.length) {
      const i = next++
      try {
        results[i] = await fn(items[i])
      } catch {
        results[i] = null
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, () => worker()),
  )
  return results
}

export interface LocalizeOptions {
  /** Aborts in-flight downloads; already-finished ones are still applied. */
  signal?: AbortSignal
  /** Called as downloads settle, for progress UI. */
  onProgress?: (done: number, total: number) => void
}

export interface FailedImage {
  url: string
  reason: string
}

/**
 * Turn an axios failure into something a user can act on. The bare message
 * ("Request failed with status code 422") names neither the URL nor the cause.
 */
function describeFailure(e: unknown): string {
  const err = e as {
    response?: { status?: number; data?: { error?: { code?: string; message?: string } } }
    code?: string
    message?: string
  }
  const status = err?.response?.status
  const serverCode = err?.response?.data?.error?.code
  const serverMsg = err?.response?.data?.error?.message

  if (serverCode === 'UNSAFE_URL') {
    // Overwhelmingly this means the host is internal-only or does not resolve
    // from the server — the common case being an intranet wiki link.
    return '服务器无法访问该地址（域名解析失败或指向内网），已保留原链接'
  }
  if (serverCode === 'IMAGE_TOO_LARGE') return serverMsg || '图片超出大小上限'
  if (serverCode === 'INVALID_MIME_TYPE') return serverMsg || '该地址返回的不是图片'
  if (serverCode === 'RATE_LIMITED') return serverMsg || '下载过于频繁，请稍后重试'
  if (serverCode === 'REMOTE_FETCH_FAILED') return serverMsg || '源站下载失败'
  if (serverCode === 'FORBIDDEN') return '没有权限在该知识库中保存图片'

  if (err?.code === 'ECONNABORTED') return '下载超时'
  if (status) return `请求失败（HTTP ${status}）`
  return err?.message || '未知错误'
}

/**
 * Scan a markdown string for external image URLs, download each one through
 * the backend (which bypasses CORS and is SSRF-guarded), and return the
 * markdown with every successful image replaced by its local /uploads/ URL.
 *
 * Images that fail to download keep their original external URL, so the
 * document still renders wherever that URL is reachable. `failures` carries the
 * per-URL reason so the caller can report it.
 *
 * Downloads run concurrently up to MAX_CONCURRENT; one failure never blocks the
 * others. Identical URLs are fetched once and reused.
 */
export async function localizeRemoteImages(
  md: string,
  kbId: string,
  docId?: string,
  options: LocalizeOptions = {},
): Promise<{
  md: string
  downloaded: number
  failed: number
  aborted: boolean
  failures: FailedImage[]
}> {
  const { signal, onProgress } = options
  const matches = [...md.matchAll(MD_IMG_RE)]
  const remoteUrls = matches.map((m) => m[2]).filter(isRemoteLink)
  if (remoteUrls.length === 0) {
    return { md, downloaded: 0, failed: 0, aborted: false, failures: [] }
  }

  // Dedupe: an article that repeats a URL (banner, divider, logo) would
  // otherwise download it N times and create N Asset rows for one image.
  const uniqueUrls = [...new Set(remoteUrls)]

  let settled = 0
  const localUrls = new Map<string, string>()
  const reasons = new Map<string, string>()

  const results = await mapLimit(uniqueUrls, MAX_CONCURRENT, async (url) => {
    if (signal?.aborted) throw new Error('aborted')
    try {
      const { url: localUrl } = await assetsApi.fetchRemoteImage(url, kbId, docId, {
        signal,
      })
      localUrls.set(url, localUrl)
      return localUrl
    } catch (e) {
      if (signal?.aborted) {
        reasons.set(url, '已取消下载')
      } else {
        reasons.set(url, describeFailure(e))
      }
      throw e
    } finally {
      settled++
      onProgress?.(settled, uniqueUrls.length)
    }
  })

  const failedUnique = results.filter((r) => r === null).length

  // Rewrite by URL lookup rather than by positional cursor: a positional pair
  // with the match list silently misaligns the moment dedupe or a skipped
  // match changes the counts.
  let downloaded = 0
  let failed = 0
  const localized = md.replace(MD_IMG_RE, (full, alt, url) => {
    if (!isRemoteLink(url)) return full
    const local = localUrls.get(url)
    if (local) {
      downloaded++
      return `![${alt}](${local})`
    }
    failed++
    // Keep the image node (it renders wherever the URL is reachable) and append
    // a visible link to the original so the URL is recoverable from the
    // document itself — a broken <img> alone shows nothing the user can act on.
    // Separate paragraph: an inline link next to an image is dropped when
    // TipTap parses the image into a block node.
    return `${full}\n\n[原图链接：${url}](${url})`
  })

  const failures: FailedImage[] = uniqueUrls
    .filter((u) => !localUrls.has(u))
    .map((u) => ({ url: u, reason: reasons.get(u) || '未知错误' }))

  return {
    md: localized,
    downloaded,
    failed,
    aborted: Boolean(signal?.aborted) && failedUnique > 0,
    failures,
  }
}
