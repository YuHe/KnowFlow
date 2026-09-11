/**
 * Adapting a standalone HTML document's CSS to a shadow root.
 *
 * A shadow root scopes style *rules*, which is what keeps a report's CSS from
 * restyling the application. Two consequences have to be handled explicitly:
 *
 *  - `:root`, `html` and `body` match nothing inside a shadow tree, so a report
 *    that declares its custom properties on `:root` and its background/font on
 *    `body` renders unstyled. Those selectors are rewritten to `:host`.
 *
 *  - a shadow root is NOT a containing block for `position: fixed`. A report with
 *    a fixed top bar and sidebar would lay them out against the viewport and
 *    cover the whole application. HtmlDocumentViewer gives the host a transform
 *    so those descendants resolve against it instead.
 *
 * This is a targeted text transform, not a CSS parser. Anything it cannot
 * translate confidently is left alone: an unmatched rule degrades the report's
 * appearance, which is far better than corrupting a selector.
 */

/**
 * A document-level selector at the start of a complex selector, plus whatever
 * compound follows it (`.cls`, `[attr=...]`, `:pseudo`).
 *
 * Anchored on the start of the stylesheet or a `,` / `{` / `}` so it only ever
 * fires in selector position — never inside a declaration value
 * (`content: "body"`, `url(body.png)`) and never mid-identifier. The
 * `(?![\w-])` guard is what stops `.qa-note-body` from being mangled into
 * `.qa-note-:host`; that class really does occur in the wild.
 */
const DOC_SELECTOR = /(^|[,{}])(\s*)(?::root|html|body)(?![\w-])((?:[.#[:][^\s,{}>+~]*)*)/g

export function scopeReportStyles(css: string): string {
  if (!css) return css
  return css.replace(DOC_SELECTOR, (_match, anchor: string, space: string, compound: string) => {
    // `body.hide-notes` must become `:host(.hide-notes)`, not `:host.hide-notes`
    // — the latter would require the class on an element *inside* the shadow.
    const host = compound ? `:host(${compound})` : ':host'
    return `${anchor}${space}${host}`
  })
}

/**
 * Baseline rules injected ahead of the report's own stylesheet.
 *
 * `display: block` because a host defaults to inline. The rest re-establishes
 * what the report expects from `html`/`body` and would otherwise inherit from
 * the application: its own `* { margin: 0 }` reset handles descendants, but the
 * host itself sits in the app's `prose` context.
 */
export const SHADOW_BASE_STYLES = `:host {
  display: block;
  /* Containing block for position: fixed descendants — without this the
     report's fixed top bar and sidebar are laid out against the viewport and
     cover the whole application. */
  transform: translateZ(0);
  isolation: isolate;
  position: relative;
  /* A report wider than the pane scrolls itself rather than the page. */
  overflow-x: auto;
  /* Neutralise the surrounding prose/typography context. */
  text-align: left;
  line-height: normal;
  color: initial;
}
`
