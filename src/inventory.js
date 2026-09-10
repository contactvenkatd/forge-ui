// Words that never name a component on their own.
const STOP = new Set([
  'a', 'an', 'the', 'of', 'and', 'or', 'with', 'for', 'to', 'on', 'in', 'at', 'by', 'each', 'its',
  'that', 'which', 'this', 'these', 'those', 'own', 'one', 'two', 'three', 'four', 'five', 'six',
  'single', 'central', 'centre', 'center', 'main', 'shared', 'complete', 'whole', 'entire',
  'adjustable', 'height', 'small', 'large', 'identical', 'separate', 'independent', 'rotating',
  'sliding', 'hinged', 'telescoping', 'repeated', 'assembly', 'sub', 'unit',
])

const clean = (s) => String(s ?? '').toLowerCase().replace(/[^a-z0-9\s-]/g, ' ').replace(/\s+/g, ' ').trim()
const singular = (w) => (w.length > 3 && w.endsWith('s') && !w.endsWith('ss') ? w.slice(0, -1) : w)

// A trailing prepositional or relative clause modifies the component rather than
// naming it: "a rubber foot ON EACH LEG" is a foot, not a leg.
const TRAILING = /\s+(?:on|at|in|into|through|for|per|to|from|with|between|around|inside|along|under|over|beneath|that|which|where)\b[\s\S]*$/i

/** Content tokens of a phrase, in order, with plurals normalised. */
export function tokens(phrase) {
  return clean(phrase).split(' ')
    .flatMap((w) => w.split('-'))
    .map(singular)
    .filter((w) => w.length >= 3 && !STOP.has(w))
}

/**
 * The head noun of a component phrase. English head nouns come last, so
 * "height-adjustable centre column" -> "column", "rubber foot" -> "foot".
 * This is what makes matching generic: no component vocabulary is hardcoded.
 */
export function headNoun(phrase) {
  const trimmed = String(phrase ?? '').replace(TRAILING, '')
  const t = tokens(trimmed.trim() || phrase)
  return t.length ? t[t.length - 1] : ''
}

/** Is an inventory item represented among the built part names? */
export function inventoryPresent(item, partNames = []) {
  const head = headNoun(item)
  if (!head) return true
  const all = partNames.map((n) => tokens(n))
  // Head noun match is the primary signal; any content token is a weaker backup.
  if (all.some((t) => t.includes(head))) return true
  const others = tokens(item).slice(0, -1)
  return others.some((tok) => all.some((t) => t.includes(tok)))
}

/** Normalises a model-produced inventory into a predictable shape. */
export function normaliseInventory(raw, { repeatedNoun = '', count = 0 } = {}) {
  const list = (value) => (Array.isArray(value) ? value : [])
    .map((v) => (typeof v === 'string' ? v : v?.name))
    .map((v) => String(v ?? '').trim())
    .filter(Boolean)
    // de-duplicate by head noun so "leg tube" and "tube" are not both demanded
    .filter((v, i, arr) => arr.findIndex((o) => headNoun(o) === headNoun(v)) === i)

  const repeated = list(raw?.repeated?.components ?? raw?.repeated)
  const shared = list(raw?.shared ?? raw?.singular)
  return {
    repeatedName: String(raw?.repeated?.name ?? repeatedNoun ?? 'unit'),
    count: Number(raw?.repeated?.count) || count,
    repeated,
    shared,
    all: [...shared, ...repeated],
  }
}

/**
 * Deterministic fallback used when the inventory call fails.
 * Splits the brief on its own list punctuation and keeps phrases that look like
 * physical components, then assigns each by whether the repeated element's noun
 * governs the phrase.
 */
export function extractInventoryHeuristic(brief, { repeatedNoun = '', count = 0 } = {}) {
  const text = String(brief ?? '').replace(/^[^:]*:\s*/, '')
  const phrases = text.split(/,| and | plus |;/i).map((p) => p.trim()).filter(Boolean)
  const repeatedHead = singular(clean(repeatedNoun));

  const shared = []
  const repeated = []
  for (const phrase of phrases) {
    const t = tokens(phrase)
    if (t.length === 0) continue
    const head = t[t.length - 1]
    if (head === repeatedHead) continue // the repeated element itself
    const target = /\beach\b|\bper\b/i.test(phrase) || t.includes(repeatedHead) ? repeated : shared
    if (!target.some((p) => headNoun(p) === head)) target.push(phrase.replace(/^that\s+/i, ''))
  }
  return normaliseInventory({ repeated: { name: repeatedNoun, count, components: repeated }, shared },
    { repeatedNoun, count })
}

/**
 * Checks the FULL inventory against the finished assembly, whichever stage was
 * meant to produce each item.
 */
export function auditInventory(inventory, parts = []) {
  const names = parts.map((p) => String(p?.name ?? ''))
  const check = (items) => items.map((item) => ({ item, present: inventoryPresent(item, names) }))
  const shared = check(inventory?.shared ?? [])
  const repeated = check(inventory?.repeated ?? [])
  const missingShared = shared.filter((r) => !r.present).map((r) => r.item)
  const missingRepeated = repeated.filter((r) => !r.present).map((r) => r.item)
  return {
    asked: (inventory?.shared?.length ?? 0) + (inventory?.repeated?.length ?? 0),
    shared, repeated,
    missingShared, missingRepeated,
    missing: [...missingShared, ...missingRepeated],
    ok: missingShared.length === 0 && missingRepeated.length === 0,
  }
}

export function inventoryWarning(audit) {
  if (!audit || audit.ok) return ''
  return `the brief lists ${audit.missing.join(', ')} but no matching part was built`
}
