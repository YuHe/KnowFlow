import DOMPurify, { type Config } from 'dompurify'
import { isAllowedEmbedUrl } from './embed'

/**
 * Sanitize untrusted HTML before injecting into the DOM via
 * dangerouslySetInnerHTML, and before storing markdown-derived HTML.
 *
 * Configured to preserve:
 *  - Mermaid SVG output (svg + children, <style> for inline CSS, class attrs)
 *  - Table column sizing (colgroup, col, width/style on cells)
 *  - Image sizing (width attr, inline style)
 *  - Syntax highlighting (class on <code>)
 *  - TipTap data attributes (data-mermaid, data-drag-handle, etc.)
 *
 * Removes: scripts, event handlers (onerror, onclick...), javascript: URLs.
 */

// SVG tags produced by mermaid that must survive sanitization.
const SVG_TAGS = [
  'svg', 'g', 'path', 'rect', 'circle', 'ellipse', 'line', 'polyline',
  'polygon', 'text', 'tspan', 'defs', 'linearGradient', 'radialGradient',
  'stop', 'marker', 'use', 'symbol', 'title', 'desc', 'foreignObject',
  'style', 'label', 'switch', 'image', 'clipPath', 'pattern',
]

const config: Config = {
  // Use a permissive allow-list approach: start from the default profile and
  // ADD the mermaid/SVG/extras rather than redefining ALLOWED_TAGS from scratch
  // (which would drop many legit tags the editor emits).
  ADD_TAGS: [...SVG_TAGS, 'col', 'colgroup', 'mark', 'del', 's', 'strike', 'iframe'],
  ADD_ATTR: [
    // SVG / mermaid
    'viewBox', 'xmlns', 'xmlns:xlink', 'xlink:href', 'preserveAspectRatio',
    'd', 'fill', 'stroke', 'stroke-width', 'stroke-linecap', 'stroke-linejoin',
    'cx', 'cy', 'r', 'rx', 'ry', 'x', 'y', 'x1', 'y1', 'x2', 'y2',
    'width', 'height', 'points', 'transform', 'opacity', 'class', 'id',
    'offset', 'gradientTransform', 'gradientUnits', 'stop-color', 'stop-opacity',
    'markerUnits', 'markerWidth', 'markerHeight', 'refX', 'refY', 'orient',
    'font-family', 'font-size', 'font-weight', 'text-anchor', 'dominant-baseline',
    'clip-path', 'clip-rule', 'fill-opacity', 'fill-rule', 'href',
    // table sizing. `colwidth` is TipTap's own non-standard attribute on
    // td/th and is the ONLY place @tiptap/extension-table-cell reads a column
    // width from — it never consults the <colgroup>. Without it here the
    // sanitizer stripped every colwidth, so toggling source mode silently reset
    // all column widths back to the 25px minimum.
    'span', 'align', 'valign', 'colwidth',
    // image
    'alt', 'title', 'src', 'target', 'rel',
    // video embeds. `iframe` is allowed only for the hosts in utils/embed —
    // enforced by dropEmbedsFromDisallowedHosts below, not by this list.
    'allow', 'allowfullscreen', 'frameborder', 'loading', 'referrerpolicy', 'sandbox',
  ],
  ALLOW_DATA_ATTR: true,
  ALLOW_ARIA_ATTR: true,
  // Keep inline styles (needed for table/image sizing & font color/size).
  // DOMPurify strips event handlers and javascript: URLs by default;
  // FORBID_ATTR below is redundant defense.
  FORBID_ATTR: ['onerror', 'onload', 'onclick', 'onmouseover', 'onmouseenter'],
  // Parse as a body fragment (we inject into element bodies).
  FORCE_BODY: true,
}

/**
 * Remove every `<iframe>` whose src is not one we would have written ourselves.
 *
 * DOMPurify's allow-list works on tag and attribute *names*, so once `iframe` is
 * allowed at all it is allowed to point anywhere — at a login page to be framed
 * over the document, or at a tracker. The host check therefore has to run here,
 * on the value, and it has to run in the sanitizer rather than only in the editor:
 * stored HTML reaches the read view, share links and the public knowledge base
 * without passing through the editor at all.
 *
 * The whole element goes, not just the attribute: an iframe with no src renders
 * as an empty box, which reads as a broken document rather than a removed one.
 */
function dropDisallowedEmbeds(root: ParentNode): void {
  for (const frame of Array.from(root.querySelectorAll('iframe'))) {
    if (!isAllowedEmbedUrl(frame.getAttribute('src'))) frame.remove()
  }
}

/**
 * Sanitize an HTML string for safe DOM insertion.
 *
 * Keeps `<style>` — required both by mermaid's inline SVG and by a standalone
 * HTML document rendered in a shadow root. Use this ONLY where the result is
 * style-isolated; anywhere it lands in the page's own DOM, use
 * `sanitizeForLightDom` instead.
 */
export function sanitizeHtml(html: string): string {
  const clean = DOMPurify.sanitize(html, config)
  if (!clean.includes('<iframe')) return clean
  const doc = new DOMParser().parseFromString(clean, 'text/html')
  dropDisallowedEmbeds(doc.body)
  return doc.body.innerHTML
}

/** Elements that restyle or re-target the whole page from wherever they sit. */
const PAGE_SCOPED_TAGS = ['style', 'link', 'base', 'meta']

/**
 * Sanitize for insertion into the application's own DOM.
 *
 * A `<style>` element applies to the entire document no matter how deeply it is
 * nested, so a stored HTML report — whose CSS is written with global selectors
 * like `body`, `h1`, `.card` — restyles the whole application the moment it is
 * injected into the page. Rendering such a document belongs in
 * HtmlDocumentViewer, which isolates it in a shadow root; this function is the
 * backstop for every other consumer, so forgetting the distinction degrades the
 * report's appearance instead of breaking the app.
 *
 * mermaid is the reason this is a filter rather than a blanket ban: its
 * generated SVG carries a `<style>` element, scoped by an id selector. Those are
 * kept; anything outside an `<svg>` is dropped.
 */
export function sanitizeForLightDom(html: string): string {
  const clean = DOMPurify.sanitize(html, config)
  if (!clean.includes('<')) return clean

  const doc = new DOMParser().parseFromString(clean, 'text/html')
  for (const tag of PAGE_SCOPED_TAGS) {
    for (const el of Array.from(doc.body.querySelectorAll(tag))) {
      if (tag === 'style' && el.closest('svg')) continue
      el.remove()
    }
  }
  dropDisallowedEmbeds(doc.body)
  return doc.body.innerHTML
}
