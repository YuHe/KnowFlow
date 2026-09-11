/**
 * The colour palettes.
 *
 * Three tiers of one hue set, so what is asserted here is not "these are the
 * right colours" but the properties that make them work together and that drift
 * the moment someone tweaks one value: readable text, a fill paler than a
 * highlight, and one shared definition rather than a copy per menu.
 */
import { describe, it, expect } from 'vitest'
import {
  TEXT_COLORS,
  HIGHLIGHT_COLORS,
  CELL_FILL_COLORS,
  PALETTE_HUES,
  relativeLuminance,
  contrastOnWhite,
} from '@/components/editor/palettes'

const byLabel = (palette: { label: string; value: string }[], label: string) =>
  palette.find((entry) => entry.label === label)!.value

describe('shape', () => {
  it('starts each palette with the clear option', () => {
    expect(TEXT_COLORS[0].value).toBe('')
    expect(HIGHLIGHT_COLORS[0].value).toBe('')
    expect(CELL_FILL_COLORS[0].value).toBe('')
  })

  it('offers the same hues in the same order across all three', () => {
    // The grids sit next to each other in the toolbar; a hue present in one and
    // missing from another is what made the old three lists feel unrelated.
    for (const palette of [TEXT_COLORS, HIGHLIGHT_COLORS, CELL_FILL_COLORS]) {
      const hues = palette.map((entry) => entry.label).filter((l) => PALETTE_HUES.includes(l as never))
      expect(hues).toEqual([...PALETTE_HUES])
    }
  })

  it('uses six-digit hex throughout, which is what the sanitizer keeps', () => {
    for (const palette of [TEXT_COLORS, HIGHLIGHT_COLORS, CELL_FILL_COLORS]) {
      for (const { value } of palette) {
        if (value) expect(value).toMatch(/^#[0-9A-Fa-f]{6}$/)
      }
    }
  })

  it('has no duplicate value inside a palette', () => {
    for (const palette of [TEXT_COLORS, HIGHLIGHT_COLORS, CELL_FILL_COLORS]) {
      const values = palette.map((e) => e.value)
      expect(new Set(values).size).toBe(values.length)
    }
  })
})

describe('text colours are readable', () => {
  it('clears WCAG AA for body text against white', () => {
    // The old palette was raw Tailwind 500s; its yellow measured 2.0:1, which is
    // unreadable as body text. Notion's own orange and yellow also fall short, so
    // those two are darkened.
    for (const { label, value } of TEXT_COLORS) {
      if (!value) continue
      expect(contrastOnWhite(value), `${label} ${value}`).toBeGreaterThanOrEqual(4.5)
    }
  })
})

describe('the tiers are ordered', () => {
  it('makes every fill paler than the matching highlight', () => {
    // A fill sits behind a whole block. As strong as a highlight it swamps the
    // text in the cell, and the two menus stop being distinguishable.
    for (const hue of PALETTE_HUES) {
      const fill = relativeLuminance(byLabel(CELL_FILL_COLORS, hue))
      const highlight = relativeLuminance(byLabel(HIGHLIGHT_COLORS, hue))
      expect(fill, hue).toBeGreaterThan(highlight)
    }
  })

  it('keeps black text legible on every highlight and fill', () => {
    for (const palette of [HIGHLIGHT_COLORS, CELL_FILL_COLORS]) {
      for (const { label, value } of palette) {
        if (!value) continue
        const onBlack = (relativeLuminance(value) + 0.05) / 0.05
        expect(onBlack, `${label} ${value}`).toBeGreaterThanOrEqual(7)
      }
    }
  })

  it('makes every text colour darker than every tint', () => {
    const lightestText = Math.max(
      ...TEXT_COLORS.filter((e) => e.value).map((e) => relativeLuminance(e.value)),
    )
    const darkestTint = Math.min(
      ...[...HIGHLIGHT_COLORS, ...CELL_FILL_COLORS]
        .filter((e) => e.value)
        .map((e) => relativeLuminance(e.value)),
    )
    expect(lightestText).toBeLessThan(darkestTint)
  })
})

describe('one definition, not three', () => {
  it('is what both table menus read the fill palette from', async () => {
    // The cell-fill list used to exist twice — once in the toolbar and once in
    // TableContextMenu — so the two menus could disagree about what 蓝 was.
    const fs = await import('node:fs/promises')
    const path = await import('node:path')
    for (const file of ['EditorToolbar.tsx', 'TableContextMenu.tsx']) {
      const source = await fs.readFile(
        path.resolve(process.cwd(), 'src/components/editor', file),
        'utf-8',
      )
      expect(source).toContain("from './palettes'")
      expect(source).not.toMatch(/const CELL_FILL_COLORS\s*=/)
    }
  })
})
