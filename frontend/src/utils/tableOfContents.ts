/**
 * In-document tables of contents.
 *
 * Some documents carry their own 目录 — a heading plus a list of same-page links.
 * Two things produce them: the backend importer runs python-markdown with the
 * `toc` extension, which turns a `[TOC]` marker into `<div class="toc">`, and
 * authors (or an LLM) write `## 目录` followed by a link list.
 *
 * Neither is recognisable to CSS on its own, so they rendered with the generic
 * `.doc-content ul` and `a` rules: a full-width nested bullet list of underlined
 * indigo links, indistinguishable from body content and unrelated to anything else
 * in the document. This pass tags them so the stylesheet can treat them as one
 * block, and repairs the links, which in an imported document point at heading ids
 * that no longer exist.
 *
 * Read-only surfaces only. In the editor the same content is a ProseMirror
 * document, and adding attributes to nodes it manages is the trap this codebase
 * has hit twice.
 */

/** Heading texts that introduce a table of contents. */
const TOC_HEADINGS = ['目录', '大纲', '索引', 'contents', 'table of contents', 'toc']

const norm = (value: string | null | undefined) =>
  (value ?? '').replace(/\s+/g, ' ').trim().toLowerCase()

/** A list whose items are all links into this same document. */
function isAnchorList(list: Element): boolean {
  const links = Array.from(list.querySelectorAll('a'))
  if (links.length < 2) return false
  return links.every((a) => (a.getAttribute('href') ?? '').startsWith('#'))
}

/**
 * Tag every table of contents in `container` with `data-toc`.
 *
 * Idempotent: re-running on an already-tagged document changes nothing, which
 * matters because the read view re-runs its passes whenever the content object
 * changes identity.
 */
export function markTableOfContents(container: HTMLElement): void {
  // python-markdown's own wrapper.
  for (const el of Array.from(container.querySelectorAll('div.toc, nav.toc, nav'))) {
    const list = el.matches('ul, ol') ? el : el.querySelector('ul, ol')
    if (list && isAnchorList(list)) el.setAttribute('data-toc', 'block')
  }

  // A hand-written "## 目录" followed by a link list. The heading and the list are
  // siblings, so both are tagged and the stylesheet joins them visually.
  for (const heading of Array.from(container.querySelectorAll('h1, h2, h3, h4'))) {
    if (!TOC_HEADINGS.includes(norm(heading.textContent))) continue
    const list = heading.nextElementSibling
    if (!list || !list.matches('ul, ol') || !isAnchorList(list)) continue
    heading.setAttribute('data-toc', 'title')
    list.setAttribute('data-toc', 'list')
  }
}

/**
 * Point same-page links at headings that actually exist.
 *
 * An imported document's TOC links at python-markdown's slugs (`#安装步骤`), and
 * those ids survive only until the document is next edited: TipTap's heading node
 * has no `id` attribute, so every one is dropped on save, and the viewer then
 * assigns its own positional `heading-0`, `heading-1`, … The links were left
 * pointing at nothing — a TOC where every entry does nothing when clicked.
 *
 * Matching on the link's own text is what survives that, because the text is what
 * the slug was made from in the first place.
 */
export function repairAnchorLinks(container: HTMLElement): void {
  const headings = Array.from(container.querySelectorAll('h1, h2, h3, h4, h5, h6'))
  if (headings.length === 0) return
  const byText = new Map<string, Element>()
  for (const heading of headings) {
    const key = norm(heading.textContent)
    if (key && !byText.has(key)) byText.set(key, heading)
  }

  for (const link of Array.from(container.querySelectorAll('a[href^="#"]'))) {
    const href = link.getAttribute('href') ?? ''
    const id = decodeURIComponent(href.slice(1))
    if (!id) continue
    // Still resolves: leave it alone.
    if (container.querySelector(`[id="${CSS.escape(id)}"]`)) continue
    const target = byText.get(norm(link.textContent))
    if (!target?.id) continue
    link.setAttribute('href', `#${target.id}`)
  }
}
