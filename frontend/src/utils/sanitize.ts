import DOMPurify, { type Config } from 'dompurify'

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
  ADD_TAGS: [...SVG_TAGS, 'col', 'colgroup', 'mark', 'del', 's', 'strike'],
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
    // table sizing
    'span', 'align', 'valign',
    // image
    'alt', 'title', 'src', 'target', 'rel',
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

/** Sanitize an HTML string for safe DOM insertion. */
export function sanitizeHtml(html: string): string {
  return DOMPurify.sanitize(html, config)
}
