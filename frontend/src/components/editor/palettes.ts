/**
 * The editor's colour palettes.
 *
 * Three tiers of one hue set, which is the part that was missing. Before this the
 * text colours were raw Tailwind 500s (harsh as body text, and two of them
 * unreadable on white), the highlights were Tailwind 200s, and the cell fills were
 * a third unrelated list that also existed in a second copy in
 * TableContextMenu — so the two table menus could disagree about what "蓝" was.
 *
 * The hues follow Notion's palette, which is tuned for text on white rather than
 * for UI chrome, and 飞书's convention of offering one fixed set rather than a
 * colour picker. Same hues, same order, three intensities:
 *
 * - **TEXT_COLORS** — dark enough to read. Every one clears 4.5:1 against white,
 *   which is WCAG AA for body text. Notion's own values sit just under that
 *   line for most hues (4.26–4.50), and its orange and yellow are far under
 *   (3.3:1 and 2.8:1), so each hue is darkened by the few percent that clears it.
 * - **HIGHLIGHT_COLORS** — a visible tint behind a few words.
 * - **CELL_FILL_COLORS** — paler again, because a cell fill sits behind a whole
 *   block rather than a phrase.
 *
 * The tiers are ordered by luminance, per hue, and that ordering is asserted in
 * the tests: a fill as strong as a highlight makes a table unreadable, and it is
 * the kind of thing that drifts silently when someone tweaks one value.
 */

export interface PaletteEntry {
  label: string
  /** Empty string means "remove the colour". */
  value: string
}

/** The hue names shared by all three palettes, in display order. */
export const PALETTE_HUES = ['灰', '棕', '红', '橙', '黄', '绿', '青', '蓝', '紫', '粉'] as const

export const TEXT_COLORS: PaletteEntry[] = [
  { label: '默认', value: '' },
  { label: '深灰', value: '#37352F' },
  { label: '灰', value: '#767572' },
  { label: '棕', value: '#9C6951' },
  { label: '红', value: '#C74743' },
  { label: '橙', value: '#B05D0A' },
  { label: '黄', value: '#916E1B' },
  { label: '绿', value: '#43805F' },
  { label: '青', value: '#0B7A8C' },
  { label: '蓝', value: '#327BA6' },
  { label: '紫', value: '#8D63AC' },
  { label: '粉', value: '#BD4A87' },
]

export const HIGHLIGHT_COLORS: PaletteEntry[] = [
  { label: '无', value: '' },
  { label: '灰', value: '#E9E9E7' },
  { label: '棕', value: '#EEE0DA' },
  { label: '红', value: '#FFE2DD' },
  { label: '橙', value: '#FADEC9' },
  { label: '黄', value: '#FDECC8' },
  { label: '绿', value: '#DBEDDB' },
  { label: '青', value: '#CDEBF0' },
  { label: '蓝', value: '#D3E5EF' },
  { label: '紫', value: '#E8DEEE' },
  { label: '粉', value: '#F5E0E9' },
]

export const CELL_FILL_COLORS: PaletteEntry[] = [
  { label: '无填充', value: '' },
  { label: '灰', value: '#F1F1EF' },
  { label: '棕', value: '#F4EEEE' },
  { label: '红', value: '#FDEBEC' },
  { label: '橙', value: '#FBECDD' },
  { label: '黄', value: '#FBF3DB' },
  { label: '绿', value: '#EDF3EC' },
  { label: '青', value: '#E9F3F5' },
  { label: '蓝', value: '#E7F3F8' },
  { label: '紫', value: '#F6F3F9' },
  { label: '粉', value: '#FAF1F5' },
]

/** Relative luminance per WCAG 2.1, for the palette tests. */
export function relativeLuminance(hex: string): number {
  const channels = [1, 3, 5]
    .map((i) => Number.parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2]
}

/** Contrast ratio between `hex` and white. */
export function contrastOnWhite(hex: string): number {
  return 1.05 / (relativeLuminance(hex) + 0.05)
}
