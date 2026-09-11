/**
 * Document content width.
 *
 * The read view was `max-w-3xl` (768px) while the editor's paper was 1100px, so
 * a document visibly narrowed the moment you stopped editing it — and both left
 * a lot of unused space. Every surface that renders document content now reads
 * the same constant, which is what this guards: a hard-coded width in any of
 * them would let them drift apart again.
 */
import { describe, it, expect } from 'vitest'
import { DOC_CONTENT_MAX_WIDTH, HTML_DOC_MAX_WIDTH } from '@/types'

const SURFACES = [
  'src/pages/DocReadPage.tsx',
  'src/pages/SharedDocPage.tsx',
  'src/pages/PublicKbPage.tsx',
  'src/pages/DocEditPage.tsx',
]

async function read(path: string): Promise<string> {
  const fs = await import('node:fs/promises')
  const nodePath = await import('node:path')
  return fs.readFile(nodePath.resolve(process.cwd(), path), 'utf-8')
}

describe('document width constants', () => {
  it('gives prose a readable but not cramped column', () => {
    expect(DOC_CONTENT_MAX_WIDTH).toBeGreaterThan(768)
    expect(DOC_CONTENT_MAX_WIDTH).toBeLessThanOrEqual(1200)
  })

  it('gives a self-laying-out HTML report more room than prose', () => {
    // A report brings its own sidebar and grid; the prose column would trigger
    // its narrow-screen media queries.
    expect(HTML_DOC_MAX_WIDTH).toBeGreaterThan(DOC_CONTENT_MAX_WIDTH)
  })
})

describe('every document surface uses the shared constant', () => {
  for (const path of SURFACES) {
    it(`${path} references DOC_CONTENT_MAX_WIDTH`, async () => {
      expect(await read(path)).toContain('DOC_CONTENT_MAX_WIDTH')
    })

    it(`${path} no longer pins content to max-w-3xl`, async () => {
      const src = await read(path)
      // The old 768px cap. Other max-w-* on non-content elements are fine.
      expect(src).not.toMatch(/className="[^"]*max-w-3xl[^"]*"[^>]*ref=\{contentRef\}/)
    })
  }

  it('read and edit mode in DocReadPage use the same constant', async () => {
    const src = await read('src/pages/DocReadPage.tsx')
    // Both the grey-canvas "paper" (edit) and the plain column (read).
    const uses = src.match(/DOC_CONTENT_MAX_WIDTH/g) ?? []
    expect(uses.length).toBeGreaterThanOrEqual(2)
  })
})
