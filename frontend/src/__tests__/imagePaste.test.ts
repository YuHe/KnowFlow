/**
 * Paste/editing regressions on the image path.
 *
 * The reported symptom was "after pasting an image I cannot type any more; I
 * have to delete it and pre-write a few empty lines first". Cause: the image
 * node is block-level, and pasting into an empty trailing paragraph *replaces*
 * that paragraph, so the document ends with the image. The selection then
 * remaps to a NodeSelection on the image — no text caret, and typing replaces
 * the image. TrailingNode guarantees a paragraph after it.
 */
import { describe, it, expect, vi } from 'vitest'
import { Editor } from '@tiptap/core'
import Document from '@tiptap/extension-document'
import Paragraph from '@tiptap/extension-paragraph'
import Text from '@tiptap/extension-text'
import Image from '@tiptap/extension-image'
import { TrailingNode } from '@/components/editor/TrailingNode'

function makeEditor(extraExtensions: unknown[] = []) {
  return new Editor({
    extensions: [Document, Paragraph, Text, Image, ...(extraExtensions as never[])],
  })
}

describe('TrailingNode', () => {
  it('appends a paragraph when the document ends with an image', () => {
    const editor = makeEditor([TrailingNode])
    editor.commands.setContent('<p>text</p><img src="/uploads/x.png">')
    expect(editor.state.doc.lastChild?.type.name).toBe('paragraph')
    editor.destroy()
  })

  it('leaves a document that already ends with a paragraph alone', () => {
    const editor = makeEditor([TrailingNode])
    editor.commands.setContent('<p>a</p><p>b</p>')
    expect(editor.state.doc.childCount).toBe(2)
    editor.destroy()
  })

  it('gives the caret a text position after replacing the last paragraph', () => {
    // This is the exact failing sequence: cursor in an empty trailing
    // paragraph, then replaceSelectionWith(image).
    const editor = makeEditor([TrailingNode])
    editor.commands.setContent('<p>text</p><p></p>')
    editor.commands.focus('end')
    const { state, view } = editor
    view.dispatch(
      state.tr.replaceSelectionWith(state.schema.nodes.image.create({ src: '/uploads/x.png' })),
    )
    // Without TrailingNode the selection lands on the image itself.
    expect(editor.state.doc.lastChild?.type.name).toBe('paragraph')
    editor.destroy()
  })

  it('is what keeps that sequence typeable — without it the doc ends on the image', () => {
    const editor = makeEditor()
    editor.commands.setContent('<p>text</p><p></p>')
    editor.commands.focus('end')
    const { state, view } = editor
    view.dispatch(
      state.tr.replaceSelectionWith(state.schema.nodes.image.create({ src: '/uploads/x.png' })),
    )
    expect(editor.state.doc.lastChild?.type.name).toBe('image')
    editor.destroy()
  })
})

describe('downscaleImage', () => {
  it('passes through files below the size threshold untouched', async () => {
    const { downscaleImage } = await import('@/utils/imageCompress')
    const small = new File([new Uint8Array(1024)], 'a.png', { type: 'image/png' })
    expect(await downscaleImage(small)).toBe(small)
  })

  it('passes through SVG and GIF regardless of size', async () => {
    const { downscaleImage } = await import('@/utils/imageCompress')
    const big = new Uint8Array(3 * 1024 * 1024)
    for (const type of ['image/svg+xml', 'image/gif']) {
      const file = new File([big], `a.${type.split('/')[1]}`, { type })
      expect(await downscaleImage(file)).toBe(file)
    }
  })

  it('passes through non-images', async () => {
    const { downscaleImage } = await import('@/utils/imageCompress')
    const file = new File([new Uint8Array(3 * 1024 * 1024)], 'a.pdf', {
      type: 'application/pdf',
    })
    expect(await downscaleImage(file)).toBe(file)
  })

  it('returns the original rather than throwing when decoding fails', async () => {
    const { downscaleImage } = await import('@/utils/imageCompress')
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn().mockRejectedValue(new Error('not an image')),
    )
    const file = new File([new Uint8Array(3 * 1024 * 1024)], 'a.png', { type: 'image/png' })
    expect(await downscaleImage(file)).toBe(file)
    vi.unstubAllGlobals()
  })
})

describe('dataUrlToFile', () => {
  it('rejects a non-image payload', async () => {
    const { dataUrlToFile } = await import('@/utils/imageCompress')
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ blob: async () => new Blob(['x'], { type: 'text/plain' }) }),
    )
    expect(await dataUrlToFile('data:text/plain;base64,eA==')).toBeNull()
    vi.unstubAllGlobals()
  })

  it('returns a File for an image payload', async () => {
    const { dataUrlToFile } = await import('@/utils/imageCompress')
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ blob: async () => new Blob(['x'], { type: 'image/png' }) }),
    )
    const file = await dataUrlToFile('data:image/png;base64,eA==')
    expect(file?.type).toBe('image/png')
    expect(file?.name).toBe('pasted-image.png')
    vi.unstubAllGlobals()
  })

  it('returns null rather than throwing when fetch fails', async () => {
    const { dataUrlToFile } = await import('@/utils/imageCompress')
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('bad data url')))
    expect(await dataUrlToFile('data:image/png;base64,!!')).toBeNull()
    vi.unstubAllGlobals()
  })
})

describe('gapcursor stylesheet', () => {
  it('is declared outside @layer so Tailwind cannot purge it', async () => {
    // Tailwind drops rules inside @layer whose class names never appear in the
    // scanned source. `.ProseMirror-gapcursor` only exists at runtime, so a
    // layered declaration was silently missing from the production build —
    // leaving the caret invisible between block nodes even though the plugin
    // was registered. Guarded structurally: a build-output assertion would
    // require running vite here.
    const fs = await import('node:fs/promises')
    const path = await import('node:path')
    const css = await fs.readFile(
      path.resolve(process.cwd(), 'src/index.css'),
      'utf-8',
    )

    const ruleIndex = css.indexOf('.ProseMirror-gapcursor {')
    expect(ruleIndex).toBeGreaterThan(-1)

    // Depth of @layer nesting at the rule's position must be zero.
    let depth = 0
    let inLayer = false
    for (let i = 0; i < ruleIndex; i++) {
      if (css.startsWith('@layer', i)) inLayer = true
      if (css[i] === '{') depth++
      else if (css[i] === '}') {
        depth--
        if (depth === 0) inLayer = false
      }
    }
    expect(inLayer && depth > 0).toBe(false)
  })
})
