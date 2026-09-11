/**
 * In-document tables of contents.
 *
 * A document can carry its own 目录, and until now it rendered through the generic
 * `.doc-content ul` and `a` rules — a full-width nested bullet list of underlined
 * indigo links, visually unrelated to everything else on the page. CSS alone
 * cannot find one, so it is tagged here; these tests pin down what counts as a
 * TOC, because tagging ordinary content would restyle the document.
 */
import { describe, it, expect } from 'vitest'
import { markTableOfContents, repairAnchorLinks } from '@/utils/tableOfContents'

function render(html: string): HTMLElement {
  const host = document.createElement('div')
  host.innerHTML = html
  document.body.appendChild(host)
  return host
}

const LINKS = '<li><a href="#a">第一节</a></li><li><a href="#b">第二节</a></li>'

describe('what counts as a table of contents', () => {
  it('tags the importer wrapper', () => {
    // python-markdown's `toc` extension, which the backend importer enables.
    const host = render(`<div class="toc"><ul>${LINKS}</ul></div>`)
    markTableOfContents(host)
    expect(host.querySelector('div.toc')!.getAttribute('data-toc')).toBe('block')
  })

  it('tags a hand-written 目录 heading and its list as one block', () => {
    const host = render(`<h2>目录</h2><ul>${LINKS}</ul><p>正文</p>`)
    markTableOfContents(host)
    expect(host.querySelector('h2')!.getAttribute('data-toc')).toBe('title')
    expect(host.querySelector('ul')!.getAttribute('data-toc')).toBe('list')
    expect(host.querySelector('p')!.hasAttribute('data-toc')).toBe(false)
  })

  it('accepts the other names people use', () => {
    for (const title of ['大纲', '索引', 'Contents', 'Table of Contents', ' 目录 ']) {
      const host = render(`<h3>${title}</h3><ul>${LINKS}</ul>`)
      markTableOfContents(host)
      expect(host.querySelector('h3')!.getAttribute('data-toc'), title).toBe('title')
    }
  })

  it('leaves an ordinary list alone', () => {
    const host = render('<h2>目录</h2><ul><li>牛奶</li><li>面包</li></ul>')
    markTableOfContents(host)
    expect(host.querySelector('ul')!.hasAttribute('data-toc')).toBe(false)
  })

  it('leaves a list of outbound links alone', () => {
    // A "参考链接" section is a list of links too; only same-page links are a TOC.
    const host = render(
      '<h2>目录</h2><ul><li><a href="https://a.test">A</a></li><li><a href="https://b.test">B</a></li></ul>',
    )
    markTableOfContents(host)
    expect(host.querySelector('ul')!.hasAttribute('data-toc')).toBe(false)
  })

  it('needs more than one entry', () => {
    const host = render('<h2>目录</h2><ul><li><a href="#a">唯一一节</a></li></ul>')
    markTableOfContents(host)
    expect(host.querySelector('ul')!.hasAttribute('data-toc')).toBe(false)
  })

  it('ignores a 目录 heading that is not followed by a list', () => {
    const host = render('<h2>目录</h2><p>本文没有目录</p>')
    markTableOfContents(host)
    expect(host.querySelector('h2')!.hasAttribute('data-toc')).toBe(false)
  })

  it('is idempotent', () => {
    // The read view re-runs its passes whenever the content object changes
    // identity, which happens on every save.
    const host = render(`<h2>目录</h2><ul>${LINKS}</ul>`)
    markTableOfContents(host)
    const once = host.innerHTML
    markTableOfContents(host)
    expect(host.innerHTML).toBe(once)
  })
})

describe('repairing the links', () => {
  it('points a stale slug at the heading with the same text', () => {
    // An imported TOC links at python-markdown's slugs. TipTap's heading node has
    // no id attribute, so every one of those ids is dropped the first time the
    // document is saved, and the viewer assigns positional ones instead — leaving
    // a TOC where nothing happens when you click.
    const host = render(
      '<div class="toc"><ul><li><a href="#安装步骤">安装步骤</a></li>' +
        '<li><a href="#常见问题">常见问题</a></li></ul></div>' +
        '<h2 id="heading-0">安装步骤</h2><h2 id="heading-1">常见问题</h2>',
    )
    repairAnchorLinks(host)
    const hrefs = Array.from(host.querySelectorAll('a')).map((a) => a.getAttribute('href'))
    expect(hrefs).toEqual(['#heading-0', '#heading-1'])
  })

  it('leaves a link that already resolves', () => {
    const host = render('<a href="#kept">安装步骤</a><h2 id="kept">安装步骤</h2>')
    repairAnchorLinks(host)
    expect(host.querySelector('a')!.getAttribute('href')).toBe('#kept')
  })

  it('leaves a link whose text matches no heading', () => {
    const host = render('<a href="#gone">删掉的一节</a><h2 id="heading-0">还在的一节</h2>')
    repairAnchorLinks(host)
    expect(host.querySelector('a')!.getAttribute('href')).toBe('#gone')
  })

  it('handles a percent-encoded Chinese slug', () => {
    const host = render(
      `<a href="#${encodeURIComponent('安装步骤')}">安装步骤</a><h2 id="heading-0">安装步骤</h2>`,
    )
    repairAnchorLinks(host)
    expect(host.querySelector('a')!.getAttribute('href')).toBe('#heading-0')
  })

  it('does not throw on an id that is not a valid selector', () => {
    const host = render('<a href="#a b[c]">x</a><h2 id="heading-0">x</h2>')
    expect(() => repairAnchorLinks(host)).not.toThrow()
  })

  it('ignores an empty fragment', () => {
    const host = render('<a href="#">回到顶部</a><h2 id="heading-0">标题</h2>')
    repairAnchorLinks(host)
    expect(host.querySelector('a')!.getAttribute('href')).toBe('#')
  })
})

describe('the stylesheet', () => {
  it('targets the tag, outside @layer so Tailwind cannot purge it', async () => {
    // `data-toc` is written at runtime and appears nowhere in the scanned source —
    // the same trap that silently dropped the gapcursor and hljs rules.
    const fs = await import('node:fs/promises')
    const path = await import('node:path')
    const css = await fs.readFile(path.resolve(process.cwd(), 'src/index.css'), 'utf-8')
    const at = css.indexOf("[data-toc='block']")
    expect(at).toBeGreaterThan(-1)
    let depth = 0
    for (let i = 0; i < at; i++) {
      if (css[i] === '{') depth++
      else if (css[i] === '}') depth--
    }
    expect(depth).toBe(0)
  })

  it('removes the bullets that made it read as body content', async () => {
    const fs = await import('node:fs/promises')
    const path = await import('node:path')
    const css = await fs.readFile(path.resolve(process.cwd(), 'src/index.css'), 'utf-8')
    const block = css.slice(css.indexOf('In-document table of contents'))
    expect(block).toContain('list-style: none')
  })

  it('does not style the editor, where tagging would fight ProseMirror', async () => {
    const fs = await import('node:fs/promises')
    const path = await import('node:path')
    const css = await fs.readFile(path.resolve(process.cwd(), 'src/index.css'), 'utf-8')
    const start = css.indexOf('In-document table of contents')
    const next = css.indexOf('/*', start + 40)
    const block = css.slice(start, next === -1 ? undefined : next)
    expect(block).toContain('[data-toc')
    expect(block).not.toContain('.ProseMirror')
  })
})
