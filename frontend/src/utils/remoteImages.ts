import { assetsApi } from '@/api/assets'

/**
 * Markdown image syntax: ![alt](url). Captures the URL in group 2.
 * Matches the common form; doesn't try to handle the rare reference-style
 * `![alt][ref]` because pasted articles virtually always use inline form.
 */
const MD_IMG_RE = /!\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g

function isRemoteLink(url: string): boolean {
  return /^https?:\/\//i.test(url) && !url.startsWith('/uploads/')
}

/**
 * Scan a markdown string for external image URLs, download each one through
 * the backend (which bypasses CORS and is SSRF-guarded), and return the
 * markdown with every successful image replaced by its local /uploads/ URL.
 *
 * Images that fail to download are left as-is (still pointing at the remote
 * source) so the user sees a broken-image rather than losing the link. All
 * downloads run in parallel; one failure never blocks the others.
 *
 * @returns { md, downloaded, failed } — counts for UI feedback.
 */
export async function localizeRemoteImages(
  md: string,
  kbId: string,
  docId?: string,
): Promise<{ md: string; downloaded: number; failed: number }> {
  const matches = [...md.matchAll(MD_IMG_RE)]
  const remote = matches.filter((m) => isRemoteLink(m[2]))
  if (remote.length === 0) return { md, downloaded: 0, failed: 0 }

  const results = await Promise.allSettled(
    remote.map((m) => assetsApi.fetchRemoteImage(m[2], kbId, docId)),
  )

  let cursor = 0
  let downloaded = 0
  let failed = 0
  const localized = md.replace(MD_IMG_RE, (full, alt, url) => {
    if (!isRemoteLink(url)) return full
    const r = results[cursor++]
    if (r && r.status === 'fulfilled') {
      downloaded++
      return `![${alt}](${r.value.url})`
    }
    failed++
    if (r && r.status === 'rejected') {
      console.warn('[localizeRemoteImages] failed to fetch', url, r.reason)
    }
    return full
  })

  return { md: localized, downloaded, failed }
}
