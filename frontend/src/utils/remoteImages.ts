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

/**
 * Scan a markdown string for external image URLs, download each one through
 * the backend (which bypasses CORS and is SSRF-guarded), and return the
 * markdown with every successful image replaced by its local /uploads/ URL.
 *
 * Images that fail to download are left as-is (still pointing at the remote
 * source) so the user sees a broken image rather than losing the link.
 * Downloads run concurrently up to MAX_CONCURRENT; one failure never blocks
 * the others. Identical URLs are fetched once and reused.
 *
 * @returns { md, downloaded, failed, aborted } — counts for UI feedback.
 */
export async function localizeRemoteImages(
  md: string,
  kbId: string,
  docId?: string,
  options: LocalizeOptions = {},
): Promise<{ md: string; downloaded: number; failed: number; aborted: boolean }> {
  const { signal, onProgress } = options
  const matches = [...md.matchAll(MD_IMG_RE)]
  const remoteUrls = matches.map((m) => m[2]).filter(isRemoteLink)
  if (remoteUrls.length === 0) {
    return { md, downloaded: 0, failed: 0, aborted: false }
  }

  // Dedupe: an article that repeats a URL (banner, divider, logo) would
  // otherwise download it N times and create N Asset rows for one image.
  const uniqueUrls = [...new Set(remoteUrls)]

  let settled = 0
  const localUrls = new Map<string, string>()

  const results = await mapLimit(uniqueUrls, MAX_CONCURRENT, async (url) => {
    if (signal?.aborted) throw new Error('aborted')
    try {
      const { url: localUrl } = await assetsApi.fetchRemoteImage(url, kbId, docId, {
        signal,
      })
      localUrls.set(url, localUrl)
      return localUrl
    } catch (e) {
      if (!signal?.aborted) {
        console.warn('[localizeRemoteImages] failed to fetch', url, e)
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
    return full
  })

  return {
    md: localized,
    downloaded,
    failed,
    aborted: Boolean(signal?.aborted) && failedUnique > 0,
  }
}
