/**
 * Embeddable URLs.
 *
 * An `<iframe>` whose `src` a document author controls is a real hole: it can
 * frame a login page, cover the document with a transparent overlay, or simply
 * load a tracker. So the source is restricted to an allow-list of video hosts
 * rather than validated for shape, and **the same list is applied by the
 * sanitizer** — otherwise stored HTML could carry any iframe it liked past the
 * editor, which is the only place a shape check would run.
 *
 * Watch URLs are rewritten to their player form, because that is what people
 * copy out of the address bar; an already-embeddable URL is accepted as-is.
 */

const YOUTUBE_ID = /^[\w-]{6,20}$/
const BILIBILI_ID = /^(BV[\w]{8,12}|av\d+)$/i
const QQ_VIDEO_ID = /^[\w-]{6,30}$/
const VIMEO_ID = /^\d{5,12}$/

/** Hosts an `<iframe src>` may point at, after normalisation. */
export const ALLOWED_EMBED_HOSTS = [
  'www.youtube.com',
  'www.youtube-nocookie.com',
  'player.bilibili.com',
  'v.qq.com',
  'player.vimeo.com',
]

function parse(raw: string): URL | null {
  try {
    const url = new URL(raw.trim())
    // http would be blocked as mixed content anyway, and every host below
    // supports TLS.
    return url.protocol === 'https:' ? url : null
  } catch {
    return null
  }
}

/** Last path segment, ignoring a trailing slash and any extension. */
function lastSegment(url: URL): string {
  const parts = url.pathname.split('/').filter(Boolean)
  const last = parts[parts.length - 1] ?? ''
  return last.replace(/\.html?$/i, '')
}

/**
 * Turn a pasted URL into one that may be framed, or null if the host is not on
 * the list.
 */
export function normalizeEmbedUrl(raw: string): string | null {
  const url = parse(raw)
  if (!url) return null
  const host = url.hostname.toLowerCase()

  if (host === 'youtu.be') {
    const id = lastSegment(url)
    return YOUTUBE_ID.test(id) ? `https://www.youtube.com/embed/${id}` : null
  }

  if (host === 'youtube.com' || host === 'www.youtube.com' || host === 'm.youtube.com' || host === 'www.youtube-nocookie.com') {
    if (url.pathname.startsWith('/embed/')) {
      const id = lastSegment(url)
      return YOUTUBE_ID.test(id) ? `https://www.youtube.com/embed/${id}` : null
    }
    const id = url.searchParams.get('v') || ''
    return YOUTUBE_ID.test(id) ? `https://www.youtube.com/embed/${id}` : null
  }

  if (host === 'player.bilibili.com') {
    const bvid = url.searchParams.get('bvid') || ''
    const aid = url.searchParams.get('aid') || ''
    if (BILIBILI_ID.test(bvid)) return `https://player.bilibili.com/player.html?bvid=${bvid}`
    if (/^\d+$/.test(aid)) return `https://player.bilibili.com/player.html?aid=${aid}`
    return null
  }

  if (host === 'bilibili.com' || host === 'www.bilibili.com' || host === 'm.bilibili.com') {
    const id = lastSegment(url)
    if (!BILIBILI_ID.test(id)) return null
    return id.toLowerCase().startsWith('av')
      ? `https://player.bilibili.com/player.html?aid=${id.slice(2)}`
      : `https://player.bilibili.com/player.html?bvid=${id}`
  }

  if (host === 'v.qq.com') {
    if (url.pathname.startsWith('/txp/iframe/player.html')) {
      const vid = url.searchParams.get('vid') || ''
      return QQ_VIDEO_ID.test(vid) ? `https://v.qq.com/txp/iframe/player.html?vid=${vid}` : null
    }
    const vid = url.searchParams.get('vid') || lastSegment(url)
    return QQ_VIDEO_ID.test(vid) ? `https://v.qq.com/txp/iframe/player.html?vid=${vid}` : null
  }

  if (host === 'player.vimeo.com') {
    const id = lastSegment(url)
    return VIMEO_ID.test(id) ? `https://player.vimeo.com/video/${id}` : null
  }

  if (host === 'vimeo.com' || host === 'www.vimeo.com') {
    const id = lastSegment(url)
    return VIMEO_ID.test(id) ? `https://player.vimeo.com/video/${id}` : null
  }

  return null
}

/**
 * Whether an `<iframe src>` already in stored HTML may stay.
 *
 * Deliberately stricter than `normalizeEmbedUrl`: this one does not rewrite, so
 * it only accepts a URL that is already exactly what we would have written. That
 * makes the check idempotent, which matters because sanitizing happens on every
 * save as well as on render.
 */
export function isAllowedEmbedUrl(raw: string | null | undefined): boolean {
  if (!raw) return false
  const url = parse(raw)
  if (!url) return false
  if (!ALLOWED_EMBED_HOSTS.includes(url.hostname.toLowerCase())) return false
  return normalizeEmbedUrl(raw) === raw
}
