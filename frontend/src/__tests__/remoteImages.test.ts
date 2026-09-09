/**
 * Tests for localizeRemoteImages — the markdown-paste image localizer.
 *
 * Covers the failure modes that made "渲染为富文本" appear to hang: unbounded
 * concurrency, duplicate downloads, positional result misalignment, and the
 * absence of cancellation.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const fetchRemoteImage = vi.fn()

vi.mock('@/api/assets', () => ({
  assetsApi: {
    fetchRemoteImage: (...args: unknown[]) => fetchRemoteImage(...args),
  },
}))

const { localizeRemoteImages } = await import('@/utils/remoteImages')

const KB = 'kb-1'

beforeEach(() => {
  fetchRemoteImage.mockReset()
})

/** Resolve every URL to a deterministic local path. */
function mockSuccess() {
  fetchRemoteImage.mockImplementation(async (url: string) => ({
    url: `/uploads/${KB}/${encodeURIComponent(url).slice(-8)}.png`,
  }))
}

describe('localizeRemoteImages', () => {
  it('leaves markdown untouched when there are no remote images', async () => {
    const md = '# Title\n\n![local](/uploads/kb-1/a.png)\n\nplain text'
    const res = await localizeRemoteImages(md, KB)
    expect(res.md).toBe(md)
    expect(res.downloaded).toBe(0)
    expect(res.failed).toBe(0)
    expect(fetchRemoteImage).not.toHaveBeenCalled()
  })

  it('rewrites remote images to their local URLs and preserves alt text', async () => {
    fetchRemoteImage.mockResolvedValue({ url: '/uploads/kb-1/x.png' })
    const md = '![一张图](https://example.com/a.png)'
    const res = await localizeRemoteImages(md, KB)
    expect(res.md).toBe('![一张图](/uploads/kb-1/x.png)')
    expect(res.downloaded).toBe(1)
    expect(res.failed).toBe(0)
  })

  it('downloads a repeated URL only once', async () => {
    fetchRemoteImage.mockResolvedValue({ url: '/uploads/kb-1/logo.png' })
    const md = [
      '![logo](https://example.com/logo.png)',
      'text',
      '![logo again](https://example.com/logo.png)',
      '![logo third](https://example.com/logo.png)',
    ].join('\n\n')

    const res = await localizeRemoteImages(md, KB)

    expect(fetchRemoteImage).toHaveBeenCalledTimes(1)
    // Every occurrence still gets rewritten.
    expect(res.md).not.toContain('https://example.com/logo.png')
    expect(res.downloaded).toBe(3)
  })

  it('never runs more than 4 downloads concurrently', async () => {
    let inFlight = 0
    let peak = 0
    fetchRemoteImage.mockImplementation(async (url: string) => {
      inFlight++
      peak = Math.max(peak, inFlight)
      await new Promise((r) => setTimeout(r, 5))
      inFlight--
      return { url: `/uploads/kb-1/${url.slice(-6)}` }
    })

    const md = Array.from(
      { length: 20 },
      (_, i) => `![img${i}](https://example.com/${i}.png)`,
    ).join('\n\n')

    const res = await localizeRemoteImages(md, KB)

    expect(peak).toBeLessThanOrEqual(4)
    expect(fetchRemoteImage).toHaveBeenCalledTimes(20)
    expect(res.downloaded).toBe(20)
  })

  it('keeps the original URL for failures and reports an accurate count', async () => {
    fetchRemoteImage.mockImplementation(async (url: string) => {
      if (url.includes('bad')) throw new Error('502')
      return { url: '/uploads/kb-1/ok.png' }
    })

    const md = [
      '![a](https://example.com/good-1.png)',
      '![b](https://example.com/bad-1.png)',
      '![c](https://example.com/good-2.png)',
      '![d](https://example.com/bad-2.png)',
    ].join('\n\n')

    const res = await localizeRemoteImages(md, KB)

    expect(res.downloaded).toBe(2)
    expect(res.failed).toBe(2)
    expect(res.md).toContain('https://example.com/bad-1.png')
    expect(res.md).toContain('https://example.com/bad-2.png')
    expect(res.md).not.toContain('https://example.com/good-1.png')
  })

  it('reports each failed URL with a human-readable reason', async () => {
    // Mirrors the real backend envelope so the reason mapping is exercised.
    fetchRemoteImage.mockImplementation(async (url: string) => {
      if (url.includes('intranet')) {
        throw {
          response: {
            status: 422,
            data: { error: { code: 'UNSAFE_URL', message: 'Remote URL rejected: ...' } },
          },
        }
      }
      if (url.includes('huge')) {
        throw {
          response: {
            status: 413,
            data: { error: { code: 'IMAGE_TOO_LARGE', message: '图片超过 10 MB' } },
          },
        }
      }
      return { url: '/uploads/kb-1/ok.png' }
    })

    const md = [
      '![a](https://ok.example.com/a.png)',
      '![b](https://intranet.corp/b.png)',
      '![c](https://cdn.example.com/huge.png)',
    ].join('\n\n')

    const res = await localizeRemoteImages(md, KB)

    expect(res.failures).toHaveLength(2)
    const byUrl = Object.fromEntries(res.failures.map((f) => [f.url, f.reason]))
    expect(byUrl['https://intranet.corp/b.png']).toContain('内网')
    expect(byUrl['https://cdn.example.com/huge.png']).toContain('10 MB')
    // The failed images keep their original links so they still render on a
    // network where those URLs resolve.
    expect(res.md).toContain('https://intranet.corp/b.png')
  })

  it('returns no failures when everything succeeds', async () => {
    fetchRemoteImage.mockResolvedValue({ url: '/uploads/kb-1/x.png' })
    const res = await localizeRemoteImages('![a](https://example.com/a.png)', KB)
    expect(res.failures).toEqual([])
    expect(res.failed).toBe(0)
  })

  it('appends a visible link to the original for each failed image', async () => {
    fetchRemoteImage.mockRejectedValue({
      response: { status: 422, data: { error: { code: 'UNSAFE_URL' } } },
    })
    const url = 'https://intranet.corp/pic.png'
    const res = await localizeRemoteImages(`![图1](${url})`, KB)

    // The image node stays (it renders wherever the URL is reachable) …
    expect(res.md).toContain(`![图1](${url})`)
    // … and the URL is also recoverable from the document as a link.
    expect(res.md).toContain(`[原图链接：${url}](${url})`)
  })

  it('does not append a link for images that succeeded', async () => {
    fetchRemoteImage.mockResolvedValue({ url: '/uploads/kb-1/ok.png' })
    const res = await localizeRemoteImages('![a](https://example.com/a.png)', KB)
    expect(res.md).not.toContain('原图链接')
  })

  it('renders the rest of the document when every image fails', async () => {
    fetchRemoteImage.mockRejectedValue(new Error('down'))
    const md = [
      '# 标题',
      '',
      '正文段落。',
      '',
      '![图1](https://a.com/1.png)',
      '',
      '## 小节',
      '',
      '- 列表项',
      '',
      '| A | B |',
      '| --- | --- |',
      '| 1 | 2 |',
      '',
      '结尾段落。',
    ].join('\n')

    const res = await localizeRemoteImages(md, KB)

    // Failure must be local to the image, never truncate the document.
    expect(res.md).toContain('# 标题')
    expect(res.md).toContain('正文段落。')
    expect(res.md).toContain('## 小节')
    expect(res.md).toContain('- 列表项')
    expect(res.md).toContain('| A | B |')
    expect(res.md).toContain('结尾段落。')
    expect(res.failed).toBe(1)
  })

  it('maps each URL to its own local file rather than pairing by position', async () => {
    // Regression: results were consumed via a positional cursor, so a mix of
    // local and remote images (or any dedupe) silently shifted the pairing and
    // images ended up with each other's files.
    mockSuccess()
    const md = [
      '![local](/uploads/kb-1/already.png)',
      '![one](https://example.com/one.png)',
      '![local2](/uploads/kb-1/also.png)',
      '![two](https://example.com/two.png)',
    ].join('\n\n')

    const res = await localizeRemoteImages(md, KB)

    const oneLocal = (await fetchRemoteImage.mock.results[0].value).url
    const twoLocal = (await fetchRemoteImage.mock.results[1].value).url
    expect(res.md).toContain(`![one](${oneLocal})`)
    expect(res.md).toContain(`![two](${twoLocal})`)
    // Untouched local images stay exactly as they were.
    expect(res.md).toContain('![local](/uploads/kb-1/already.png)')
    expect(res.md).toContain('![local2](/uploads/kb-1/also.png)')
  })

  it('resolves promptly when aborted, keeping already-downloaded images', async () => {
    const controller = new AbortController()
    let started = 0

    fetchRemoteImage.mockImplementation(async (url: string, _kb, _doc, opts) => {
      started++
      if (started === 1) return { url: '/uploads/kb-1/first.png' }
      // Later ones hang until aborted — mimics a slow CDN.
      return new Promise((_resolve, reject) => {
        opts?.signal?.addEventListener('abort', () => reject(new Error('canceled')))
      })
    })

    const md = Array.from(
      { length: 8 },
      (_, i) => `![img${i}](https://example.com/${i}.png)`,
    ).join('\n\n')

    const pending = localizeRemoteImages(md, KB, undefined, {
      signal: controller.signal,
    })
    // Let the first worker settle, then cancel.
    await new Promise((r) => setTimeout(r, 10))
    controller.abort()

    const res = await pending

    expect(res.aborted).toBe(true)
    expect(res.downloaded).toBe(1)
    expect(res.failed).toBe(7)
    // The successful one is still localized; the rest keep their remote URLs.
    expect(res.md).toContain('/uploads/kb-1/first.png')
    expect(res.md).toContain('https://example.com/7.png')
  })

  it('reports progress as downloads settle', async () => {
    mockSuccess()
    const md = Array.from(
      { length: 6 },
      (_, i) => `![img${i}](https://example.com/${i}.png)`,
    ).join('\n\n')

    const seen: Array<[number, number]> = []
    await localizeRemoteImages(md, KB, undefined, {
      onProgress: (done, total) => seen.push([done, total]),
    })

    expect(seen).toHaveLength(6)
    expect(seen[seen.length - 1]).toEqual([6, 6])
    // Monotonically increasing, total constant.
    expect(seen.map(([d]) => d)).toEqual([1, 2, 3, 4, 5, 6])
    expect(seen.every(([, t]) => t === 6)).toBe(true)
  })

  it('passes kbId and docId through to the API', async () => {
    fetchRemoteImage.mockResolvedValue({ url: '/uploads/kb-1/x.png' })
    await localizeRemoteImages('![a](https://example.com/a.png)', KB, 'doc-9')
    expect(fetchRemoteImage).toHaveBeenCalledWith(
      'https://example.com/a.png',
      KB,
      'doc-9',
      expect.objectContaining({ signal: undefined }),
    )
  })

  it('ignores non-http URLs and data URIs', async () => {
    const md = [
      '![data](data:image/png;base64,AAAA)',
      '![rel](./images/a.png)',
      '![abs](/uploads/kb-1/b.png)',
    ].join('\n\n')

    const res = await localizeRemoteImages(md, KB)
    expect(fetchRemoteImage).not.toHaveBeenCalled()
    expect(res.md).toBe(md)
  })
})

describe('failed image inside a markdown table row', () => {
  // Regression: the fallback for a failed download was `${image}\n\n[原图链接…]`.
  // A pipe-table row has to occupy exactly one line, so that blank line split
  // the row and marked then rendered the header, the delimiter and every
  // remaining row as loose paragraphs — the table was destroyed. Reported
  // against a Baidu wiki attachment URL, which cannot be fetched server-side.
  const URL_IN_TABLE = 'https://wiki.example.com/attach?attachId=36ae&docGuid=dH'
  const TABLE = [
    `|点击分布水平|host数|占比|![](${URL_IN_TABLE})|`,
    '|-|-|-|-|',
    '|>5%|5|0.01%||',
  ].join('\n')

  beforeEach(() => {
    fetchRemoteImage.mockRejectedValue(new Error('unreachable'))
  })

  it('keeps the fallback on the same line', async () => {
    const { md, failed } = await localizeRemoteImages(TABLE, KB)
    expect(failed).toBe(1)
    expect(md.split('\n')).toHaveLength(3)
    expect(md.split('\n')[0]).toContain('原图链接')
  })

  it('still renders as a real table', async () => {
    const { markdownToHtml } = await import('@/utils/markdown')
    const { md } = await localizeRemoteImages(TABLE, KB)
    const html = markdownToHtml(md, false)
    expect(html).toContain('<table')
    expect(html).toContain('<img')
    expect(html).toContain('原图链接')
  })

  it('keeps the original URL recoverable from the cell', async () => {
    const { md } = await localizeRemoteImages(TABLE, KB)
    expect(md).toContain(URL_IN_TABLE)
  })

  it('escapes a pipe in the URL so it cannot split the cell', async () => {
    const piped = `|a|b|![](https://wiki.example.com/x?a=1|b)|\n|-|-|-|\n|1|2|3|`
    const { md } = await localizeRemoteImages(piped, KB)
    expect(md.split('\n')).toHaveLength(3)
    expect(md).toContain('%7C')
  })

  it('still uses a separate paragraph outside a table', async () => {
    const { md } = await localizeRemoteImages(
      `text\n\n![a](${URL_IN_TABLE})\n\nmore`,
      KB,
    )
    expect(md).toContain(`\n\n[原图链接：${URL_IN_TABLE}]`)
  })
})
