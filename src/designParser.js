// Grok is asked for a code block followed by a `materials` JSON array. Models are
// inconsistent about fencing and labelling, so parse defensively.

const FENCE = /```([a-zA-Z0-9_+-]*)\s*\n([\s\S]*?)```/g

export function readFences(text) {
  const fences = []
  let match
  FENCE.lastIndex = 0
  while ((match = FENCE.exec(text)) !== null) {
    fences.push({ lang: (match[1] || '').toLowerCase(), body: match[2].trim() })
  }
  return fences
}

// Scans for balanced top-level [...] spans and returns each as raw text.
function findArraySpans(text) {
  const spans = []
  for (let i = 0; i < text.length; i += 1) {
    if (text[i] !== '[') continue
    let depth = 0
    let inString = false
    let quote = ''
    for (let j = i; j < text.length; j += 1) {
      const char = text[j]
      if (inString) {
        if (char === '\\') j += 1
        else if (char === quote) inString = false
        continue
      }
      if (char === '"' || char === "'") { inString = true; quote = char; continue }
      if (char === '[') depth += 1
      else if (char === ']') {
        depth -= 1
        if (depth === 0) { spans.push(text.slice(i, j + 1)); i = j; break }
      }
    }
  }
  return spans
}

const NAME_KEYS = ['name', 'item', 'material', 'part', 'description']
const QTY_KEYS = ['quantity', 'qty', 'count', 'amount']
// Line-item totals. Checked before unit prices so an entry carrying both is
// read as a total rather than multiplied a second time.
const COST_KEYS = [
  'estimated_cost', 'estimatedCost', 'estimated_cost_usd', 'estimatedCostUsd', 'estimated_cost_USD',
  'cost', 'cost_usd', 'costUsd', 'total_cost', 'totalCost', 'line_cost', 'lineCost',
  'price', 'price_usd', 'priceUsd', 'estimated_price', 'estimatedPrice', 'amount', 'usd',
]
// Per-unit prices: these get multiplied by quantity to reach a line total.
const UNIT_COST_KEYS = [
  'unit_cost', 'unitCost', 'unit_price', 'unitPrice', 'cost_each', 'costEach',
  'price_each', 'priceEach', 'each', 'per_unit', 'perUnit',
]

const pick = (object, keys) => {
  for (const key of keys) {
    if (object[key] !== undefined && object[key] !== null) return object[key]
  }
  return undefined
}

// Case/format-insensitive lookup, for keys like "Estimated Cost (USD)".
const pickLoose = (object, keys) => {
  const direct = pick(object, keys)
  if (direct !== undefined) return direct
  const flatten = (k) => k.toLowerCase().replace(/[^a-z]/g, '')
  const wanted = new Set(keys.map(flatten))
  for (const [key, value] of Object.entries(object)) {
    if (value !== undefined && value !== null && wanted.has(flatten(key))) return value
  }
  return undefined
}

export function toNumber(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0
  // Models sometimes wrap a figure: { amount: 12.5, currency: "USD" }
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const inner = pick(value, ['value', 'amount', 'usd', 'total', 'cost', 'price'])
    return inner === undefined ? 0 : toNumber(inner)
  }
  if (typeof value !== 'string') return 0
  const cleaned = value.replace(/[^0-9.-]/g, '')
  const parsed = Number.parseFloat(cleaned)
  return Number.isFinite(parsed) ? parsed : 0
}

export const formatUsd = (value) =>
  `$${toNumber(value).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

const AXES = new Set(['x', 'y', 'z'])
const AXIS_VECTORS = { x: [1, 0, 0], y: [0, 1, 0], z: [0, 0, 1] }

/** Normalises an axis to a unit vector; accepts 'x'|'y'|'z' or a 3-vector. */
export function axisToVector(axis, axisVector) {
  const raw = Array.isArray(axisVector) && axisVector.length === 3
    ? axisVector.map(Number)
    : AXIS_VECTORS[String(axis).toLowerCase()]
  if (!raw || raw.some((n) => !Number.isFinite(n))) return null
  const length = Math.hypot(raw[0], raw[1], raw[2])
  if (length < 1e-9) return null
  return [raw[0] / length, raw[1] / length, raw[2] / length]
}

// A parts array is distinguished from a materials array by its numeric `index`.
function looksLikeParts(value) {
  return Array.isArray(value) && value.length > 0 && value.every(
    (entry) => entry && typeof entry === 'object' && !Array.isArray(entry) && Number.isFinite(Number(entry.index)),
  )
}

const MOTIONS = new Set(['slide', 'rotate'])

export function normalisePartMeta(list) {
  if (!Array.isArray(list)) return []
  const out = []
  for (const entry of list) {
    if (!entry || typeof entry !== 'object') continue
    const index = Number(entry.index)
    if (!Number.isFinite(index) || index < 0) continue

    const axis = typeof entry.axis === 'string' ? entry.axis.trim().toLowerCase() : ''
    const part = { index: Math.floor(index), name: String(entry.name ?? `Part ${Math.floor(index) + 1}`) }

    // Replication rotates a sub-assembly, which turns a cardinal hinge axis into
    // an arbitrary direction, so an explicit vector is accepted alongside x/y/z.
    const vector = axisToVector(axis, entry.axisVector)
    if (vector) {
      const min = toNumber(entry.min ?? 0)
      const max = toNumber(entry.max ?? 0)
      // A zero-width range is not movable, whatever the model claimed.
      if (Number.isFinite(min) && Number.isFinite(max) && Math.abs(max - min) > 0.01) {
        const declared = typeof entry.motion === 'string' ? entry.motion.trim().toLowerCase() : ''
        // Older replies carry no `motion`; an axis plus a range means a slide.
        part.motion = MOTIONS.has(declared) ? declared : 'slide'
        part.axis = AXES.has(axis) ? axis : 'z'
        part.axisVector = vector
        part.min = Math.min(min, max)
        part.max = Math.max(min, max)
        if (part.motion === 'rotate') {
          // Rotation needs a centre, or the part swings about the world origin.
          const pivot = Array.isArray(entry.pivot) ? entry.pivot.map(toNumber) : []
          part.pivot = pivot.length === 3 && pivot.every(Number.isFinite) ? pivot : [0, 0, 0]
        }
      }
    }
    out.push(part)
  }
  return out
}

function looksLikeMaterials(value) {
  return Array.isArray(value) && value.length > 0 && value.every(
    (entry) => entry && typeof entry === 'object' && !Array.isArray(entry) && pick(entry, NAME_KEYS) !== undefined,
  )
}

export function normaliseMaterials(list) {
  if (!Array.isArray(list)) return []
  return list
    .filter((entry) => entry && typeof entry === 'object' && !Array.isArray(entry))
    .map((entry) => {
      const rawQuantity = pickLoose(entry, QTY_KEYS)
      const quantity = rawQuantity === undefined ? 1 : toNumber(rawQuantity) || 1

      // Prefer an explicit line total; fall back to unit price x quantity.
      const lineCost = pickLoose(entry, COST_KEYS)
      const unitCost = pickLoose(entry, UNIT_COST_KEYS)
      const cost = lineCost !== undefined ? toNumber(lineCost) : toNumber(unitCost) * quantity

      return {
        name: String(pickLoose(entry, NAME_KEYS) ?? 'Unnamed item'),
        detail: String(entry.detail ?? entry.notes ?? entry.spec ?? entry.specification ?? ''),
        quantity,
        cost,
      }
    })
}

export function materialsTotal(materials) {
  // Costs from the model are per line item, not per unit.
  return materials.reduce((sum, entry) => sum + toNumber(entry.cost), 0)
}

/**
 * Splits a Grok completion into { code, materials }.
 * Throws when no runnable code block can be found.
 */
export function parseDesignResponse(text) {
  if (!text || !text.trim()) throw new Error('Grok returned an empty response.')

  const fences = readFences(text)
  const codeFence =
    fences.find((fence) => ['javascript', 'js', 'jscad'].includes(fence.lang)) ??
    fences.find((fence) => fence.lang !== 'json' && fence.body.includes('require')) ??
    fences.find((fence) => fence.lang !== 'json')

  // Fall back to treating the whole reply as code when nothing was fenced.
  const code = (codeFence?.body ?? (fences.length === 0 ? text.trim() : '')).trim()
  if (!code) throw new Error('Grok did not return a model code block.')

  // EVERY json fence is a candidate: materials and parts arrive as two separate
  // fenced blocks, so taking only the first one loses the second.
  const candidates = fences.filter((fence) => fence.lang === 'json').map((fence) => fence.body)
  // Anything outside the fences is where a bare materials array usually lives.
  candidates.push(...findArraySpans(text.replace(FENCE, '\n')))

  let materials = []
  let materialsRaw = []
  let parts = []
  for (const candidate of candidates) {
    let parsed
    try {
      parsed = JSON.parse(candidate)
    } catch {
      continue // not JSON, keep looking
    }
    // Parts is checked first: its entries also carry a name, so a materials test
    // would happily claim it.
    if (!parts.length && looksLikeParts(parsed)) { parts = normalisePartMeta(parsed); continue }
    if (!parts.length && parsed && looksLikeParts(parsed.parts)) { parts = normalisePartMeta(parsed.parts); continue }
    if (!materials.length && looksLikeMaterials(parsed)) { materialsRaw = parsed; materials = normaliseMaterials(parsed) }
    else if (!materials.length && parsed && looksLikeMaterials(parsed.materials)) { materialsRaw = parsed.materials; materials = normaliseMaterials(parsed.materials) }
  }

  // materialsRaw is persisted alongside so a later parser fix can be re-applied
  // to projects that were already saved.
  return { code, materials, materialsRaw, parts }
}

/** Parses a reply that contains only the materials and parts arrays. */
export function parseMetadataOnly(text) {
  if (!text) return { materials: [], materialsRaw: [], parts: [] }
  const fences = readFences(text)
  const candidates = fences.map((fence) => fence.body)
  candidates.push(...findArraySpans(text.replace(FENCE, '\n')))

  let materials = []
  let materialsRaw = []
  let parts = []
  for (const candidate of candidates) {
    let parsed
    try { parsed = JSON.parse(candidate) } catch { continue }
    if (!parts.length && looksLikeParts(parsed)) { parts = normalisePartMeta(parsed); continue }
    if (!materials.length && looksLikeMaterials(parsed)) { materialsRaw = parsed; materials = normaliseMaterials(parsed) }
  }
  return { materials, materialsRaw, parts }
}
