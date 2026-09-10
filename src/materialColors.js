// Physically-plausible base colours for the materials the BOM is likely to name.
// Ordered: the first key found in the bill of materials wins, so "6061 Aluminum
// Plate" resolves before a generic "steel bolt" further down the list.
const PALETTE = [
  ['carbon fiber', [0.17, 0.18, 0.20, 1]],
  ['carbon-fibre', [0.17, 0.18, 0.20, 1]],
  ['stainless', [0.63, 0.66, 0.70, 1]],
  ['titanium', [0.65, 0.64, 0.66, 1]],
  ['aluminum', [0.75, 0.77, 0.80, 1]],
  ['aluminium', [0.75, 0.77, 0.80, 1]],
  ['brass', [0.79, 0.66, 0.35, 1]],
  ['bronze', [0.72, 0.53, 0.32, 1]],
  ['copper', [0.77, 0.49, 0.33, 1]],
  ['steel', [0.56, 0.59, 0.64, 1]],
  ['iron', [0.48, 0.50, 0.53, 1]],
  ['plywood', [0.68, 0.53, 0.34, 1]],
  ['wood', [0.61, 0.45, 0.28, 1]],
  ['oak', [0.66, 0.50, 0.31, 1]],
  ['nylon', [0.86, 0.86, 0.84, 1]],
  ['abs', [0.80, 0.81, 0.83, 1]],
  ['pla', [0.80, 0.81, 0.83, 1]],
  ['plastic', [0.82, 0.83, 0.85, 1]],
  ['rubber', [0.22, 0.23, 0.25, 1]],
  ['glass', [0.72, 0.80, 0.84, 1]],
]

export const DEFAULT_MATERIAL_COLOR = [0.75, 0.77, 0.80, 1] // 6061 aluminium

function matchPalette(text) {
  if (!text) return null
  const haystack = text.toLowerCase()
  for (const [keyword, color] of PALETTE) {
    if (haystack.includes(keyword)) return color
  }
  return null
}

/**
 * Picks the model colour from what the bill of materials actually says, falling
 * back to the workspace default material, then to aluminium.
 */
export function resolveMaterialColor(materials = [], fallbackMaterial = '') {
  const fromBom = matchPalette(
    materials.map((entry) => `${entry?.name ?? ''} ${entry?.detail ?? ''}`).join(' '),
  )
  return fromBom ?? matchPalette(fallbackMaterial) ?? DEFAULT_MATERIAL_COLOR
}

export function materialLabel(materials = [], fallbackMaterial = '') {
  const text = materials.map((entry) => `${entry?.name ?? ''} ${entry?.detail ?? ''}`).join(' ').toLowerCase()
  for (const [keyword] of PALETTE) {
    if (text.includes(keyword)) return keyword
  }
  return (fallbackMaterial || 'aluminum').toLowerCase()
}
