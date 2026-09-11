/**
 * Video embeds.
 *
 * The URL allow-list is the security boundary here, so it gets tested from both
 * sides: what the editor accepts, and what the sanitizer lets through. The second
 * is the one that matters — stored HTML reaches the read view, share links and the
 * public knowledge base without ever passing through the editor.
 */
import { describe, it, expect } from 'vitest'
import { Editor } from '@tiptap/core'
import Document from '@tiptap/extension-document'
import Paragraph from '@tiptap/extension-paragraph'
import Text from '@tiptap/extension-text'
import { Embed } from '@/components/editor/Embed'
import { normalizeEmbedUrl, isAllowedEmbedUrl } from '@/utils/embed'
import { sanitizeHtml, sanitizeForLightDom } from '@/utils/sanitize'
import { htmlToMarkdown } from '@/components/editor/EditorCore'
import { markdownToHtml } from '@/utils/markdown'

function mount(content = '<p>hello</p>') {
  const element = document.createElement('div')
  document.body.appendChild(element)
  return new Editor({ element, extensions: [Document, Paragraph, Text, Embed], content })
}

describe('normalizing a pasted URL', () => {
  it('rewrites a YouTube watch URL to its player', () => {
    expect(normalizeEmbedUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBe(
      'https://www.youtube.com/embed/dQw4w9WgXcQ',
    )
  })

  it('handles the youtu.be short form', () => {
    expect(normalizeEmbedUrl('https://youtu.be/dQw4w9WgXcQ')).toBe(
      'https://www.youtube.com/embed/dQw4w9WgXcQ',
    )
  })

  it('rewrites a Bilibili video page to its player', () => {
    expect(normalizeEmbedUrl('https://www.bilibili.com/video/BV1GJ411x7h7')).toBe(
      'https://player.bilibili.com/player.html?bvid=BV1GJ411x7h7',
    )
  })

  it('handles the legacy Bilibili av number', () => {
    expect(normalizeEmbedUrl('https://www.bilibili.com/video/av170001')).toBe(
      'https://player.bilibili.com/player.html?aid=170001',
    )
  })

  it('rewrites a Vimeo page', () => {
    expect(normalizeEmbedUrl('https://vimeo.com/123456789')).toBe(
      'https://player.vimeo.com/video/123456789',
    )
  })

  it('accepts an already-embeddable URL unchanged', () => {
    for (const url of [
      'https://www.youtube.com/embed/dQw4w9WgXcQ',
      'https://player.bilibili.com/player.html?bvid=BV1GJ411x7h7',
      'https://player.vimeo.com/video/123456789',
    ]) {
      expect(normalizeEmbedUrl(url)).toBe(url)
    }
  })

  it('refuses a host that is not on the list', () => {
    expect(normalizeEmbedUrl('https://evil.example.com/player')).toBeNull()
    // A lookalike host must not pass on a substring match.
    expect(normalizeEmbedUrl('https://youtube.com.evil.test/watch?v=abcdef')).toBeNull()
  })

  it('refuses anything that is not https', () => {
    expect(normalizeEmbedUrl('http://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBeNull()
    expect(normalizeEmbedUrl('javascript:alert(1)')).toBeNull()
    expect(normalizeEmbedUrl('data:text/html,<script>alert(1)</script>')).toBeNull()
  })

  it('refuses an allowed host with no usable id', () => {
    expect(normalizeEmbedUrl('https://www.youtube.com/')).toBeNull()
    expect(normalizeEmbedUrl('https://www.bilibili.com/video/not-an-id')).toBeNull()
    expect(normalizeEmbedUrl('https://player.bilibili.com/player.html')).toBeNull()
  })

  it('refuses junk rather than throwing', () => {
    expect(normalizeEmbedUrl('')).toBeNull()
    expect(normalizeEmbedUrl('not a url')).toBeNull()
  })
})

describe('isAllowedEmbedUrl', () => {
  it('accepts only a URL already in the form we would write', () => {
    expect(isAllowedEmbedUrl('https://www.youtube.com/embed/dQw4w9WgXcQ')).toBe(true)
    // Would be *normalized* to the above, but is not itself what we store — so a
    // second sanitize pass cannot change it, which keeps sanitizing idempotent.
    expect(isAllowedEmbedUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBe(false)
  })

  it('rejects an off-list host and empty input', () => {
    expect(isAllowedEmbedUrl('https://evil.example.com/x')).toBe(false)
    expect(isAllowedEmbedUrl('')).toBe(false)
    expect(isAllowedEmbedUrl(null)).toBe(false)
  })
})

describe('the node', () => {
  it('inserts an iframe for an allowed URL', () => {
    const editor = mount()
    expect(editor.commands.setEmbed('https://www.bilibili.com/video/BV1GJ411x7h7')).toBe(true)
    const html = editor.getHTML()
    expect(html).toContain('data-type="embed"')
    expect(html).toContain('src="https://player.bilibili.com/player.html?bvid=BV1GJ411x7h7"')
    editor.destroy()
  })

  it('declines a disallowed URL and leaves the document alone', () => {
    const editor = mount()
    expect(editor.commands.setEmbed('https://evil.example.com/x')).toBe(false)
    expect(editor.getHTML()).toBe('<p>hello</p>')
    editor.destroy()
  })

  it('sandboxes the frame without allow-same-origin', () => {
    // With allow-same-origin a page from an allowed host could script this one.
    const editor = mount()
    editor.commands.setEmbed('https://youtu.be/dQw4w9WgXcQ')
    const html = editor.getHTML()
    expect(html).toContain('sandbox=')
    expect(html).not.toContain('allow-same-origin')
    expect(html).toContain('referrerpolicy="strict-origin-when-cross-origin"')
    editor.destroy()
  })

  it('adopts a pasted iframe from an allowed host', () => {
    const editor = mount(
      '<p>x</p><iframe src="https://www.youtube.com/embed/dQw4w9WgXcQ"></iframe>',
    )
    expect(editor.getHTML()).toContain('data-type="embed"')
    editor.destroy()
  })

  it('drops a pasted iframe from anywhere else', () => {
    const editor = mount('<p>x</p><iframe src="https://evil.example.com/x"></iframe>')
    expect(editor.getHTML()).not.toContain('evil.example.com')
    editor.destroy()
  })
})

describe('the sanitizer', () => {
  const allowed = '<div data-type="embed"><iframe src="https://www.youtube.com/embed/dQw4w9WgXcQ"></iframe></div>'

  it('keeps an allowed embed on both paths', () => {
    expect(sanitizeHtml(allowed)).toContain('youtube.com/embed')
    expect(sanitizeForLightDom(allowed)).toContain('youtube.com/embed')
  })

  it('removes an iframe pointing anywhere else', () => {
    // This is the check that matters: stored HTML reaches the read view without
    // passing through the editor, so a shape check in the extension alone would
    // let a hand-edited document frame a login page over the document.
    const evil = '<div data-type="embed"><iframe src="https://evil.example.com/login"></iframe></div>'
    expect(sanitizeHtml(evil)).not.toContain('iframe')
    expect(sanitizeForLightDom(evil)).not.toContain('iframe')
  })

  it('removes an srcdoc or src-less frame outright', () => {
    // An empty frame renders as a blank box, which reads as a broken document.
    expect(sanitizeHtml('<iframe srcdoc="<script>alert(1)</script>"></iframe>')).not.toContain('iframe')
    expect(sanitizeHtml('<iframe></iframe>')).not.toContain('iframe')
  })

  it('is idempotent', () => {
    // Sanitizing runs on every save as well as on render, so a second pass that
    // changed anything would make stored content drift.
    const once = sanitizeHtml(allowed)
    expect(sanitizeHtml(once)).toBe(once)
    const lightOnce = sanitizeForLightDom(allowed)
    expect(sanitizeForLightDom(lightOnce)).toBe(lightOnce)
  })
})

describe('surviving a save', () => {
  it('passes through HTML → Markdown → HTML', () => {
    const editor = mount()
    editor.commands.setEmbed('https://youtu.be/dQw4w9WgXcQ')
    const stored = editor.getHTML()
    editor.destroy()

    const md = htmlToMarkdown(stored)
    expect(md).toContain('data-type="embed"')

    const back = mount(markdownToHtml(md, false))
    expect(back.getHTML()).toContain('src="https://www.youtube.com/embed/dQw4w9WgXcQ"')
    back.destroy()
  })
})
