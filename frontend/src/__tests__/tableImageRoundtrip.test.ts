/**
 * Reproduction: images inside table cells, and the `<colgroup>` accident.
 *
 * The user reports that inserting an image into a table cell makes the table
 * stop rendering as a table. The mechanism under suspicion:
 *
 *   turndown-plugin-gfm's `cell()` does not collapse newlines, and TipTap wraps
 *   every cell's content in `<p>`. When a table takes the pipe-table path, each
 *   row shatters into `| \nA\n\n | ...`, which marked then renders as a pile of
 *   `<p>` instead of a table.
 *
 * Today that path is avoided only by accident: TipTap's table renderHTML always
 * emits `<colgroup>` before `<tbody>`, which defeats the plugin's
 * `isFirstTbody()` heuristic, so its own `keep()` passes the table through as
 * raw HTML. Any HTML *without* a colgroup — e.g. anything produced by the
 * backend's Python-Markdown importer, which emits `<thead>` and no colgroup —
 * takes the pipe path and shatters.
 *
 * These fixtures deliberately use the real serialized shapes rather than the
 * hand-written `<td>a</td>` of tableRoundtrip.test.ts, which omits both the
 * colgroup and the `<p>` wrappers and therefore cannot catch this.
 */
import { describe, it, expect } from 'vitest'
import { htmlToMarkdown } from '@/components/editor/EditorCore'
import { markdownToHtml } from '@/utils/markdown'

const roundtrip = (html: string) => markdownToHtml(htmlToMarkdown(html), false)

/** What `editor.getHTML()` actually produces: colgroup + `<p>`-wrapped cells. */
const TIPTAP_TABLE_WITH_IMAGE =
  '<table style="min-width: 50px;">' +
  '<colgroup><col style="min-width: 25px;"><col style="min-width: 25px;"></colgroup>' +
  '<tbody>' +
  '<tr><th colspan="1" rowspan="1"><p>A</p></th><th colspan="1" rowspan="1"><p>B</p></th></tr>' +
  '<tr><td colspan="1" rowspan="1"><img src="/uploads/x.png" alt="pic" width="120"></td>' +
  '<td colspan="1" rowspan="1"><p>2</p></td></tr>' +
  '</tbody></table>'

/** What the backend importer produces: `<thead>`, no colgroup, `<p>` in cells. */
const IMPORTED_TABLE_WITH_IMAGE =
  '<table>' +
  '<thead><tr><th><p>A</p></th><th><p>B</p></th></tr></thead>' +
  '<tbody>' +
  '<tr><td><img src="/uploads/x.png" alt="pic" width="120"></td><td><p>2</p></td></tr>' +
  '</tbody></table>'

/** Same shape, no image — isolates the `<p>`-in-cell hazard from the image. */
const IMPORTED_TABLE_PLAIN =
  '<table>' +
  '<thead><tr><th><p>A</p></th><th><p>B</p></th></tr></thead>' +
  '<tbody><tr><td><p>1</p></td><td><p>2</p></td></tr></tbody>' +
  '</table>'

describe('images in table cells', () => {
  it('survive a round trip from real editor output', () => {
    const back = roundtrip(TIPTAP_TABLE_WITH_IMAGE)
    expect(back).toContain('<table')
    expect(back).toContain('<img')
    expect(back).toContain('/uploads/x.png')
  })

  it('keep their width through a round trip', () => {
    const back = roundtrip(TIPTAP_TABLE_WITH_IMAGE)
    expect(back).toContain('width="120"')
  })

  it('stay inside a cell rather than escaping the table', () => {
    const back = roundtrip(TIPTAP_TABLE_WITH_IMAGE)
    // The image must still be within a td, not hoisted out as a sibling.
    expect(back).toMatch(/<td[^>]*>\s*<img/)
  })
})

describe('tables without a colgroup (backend-imported shape)', () => {
  it('still render as a table after a round trip', () => {
    const back = roundtrip(IMPORTED_TABLE_PLAIN)
    expect(back).toContain('<table')
  })

  it('do not shatter their rows into loose paragraphs', () => {
    const md = htmlToMarkdown(IMPORTED_TABLE_PLAIN)
    // The shattered form is `| \nA\n\n | ` — a cell's content pushed onto its
    // own line. Assert no line consists solely of a pipe and whitespace.
    const strayPipeLine = md
      .split('\n')
      .find((line) => /^\s*\|\s*$/.test(line) || /^\s*\|\s*$/.test(line.replace(/\|$/, '')))
    expect(strayPipeLine).toBeUndefined()
  })

  it('keep an image in a cell as a table, not a pile of paragraphs', () => {
    const back = roundtrip(IMPORTED_TABLE_WITH_IMAGE)
    expect(back).toContain('<table')
    expect(back).toContain('<img')
    expect(back).toMatch(/<td[^>]*>\s*<img/)
  })
})
