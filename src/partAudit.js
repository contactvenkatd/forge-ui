import * as modelingNamespace from '@jscad/modeling'

const unwrap = (ns, probe) => (ns?.[probe] ? ns : ns?.default ?? ns)
const modeling = unwrap(modelingNamespace, 'primitives')

/**
 * Accounts for every solid in a decomposed build: each one is either part of the
 * hub group or of a specific replica. Anything outside those ranges is
 * unexplained and must be surfaced rather than quietly rendered.
 */
export function auditParts({ solids = [], parts = [], hubSolidCount = 0, unitSolidCount = 0, count = 0 }) {
  const expected = hubSolidCount + unitSolidCount * count
  const nameOf = (i) => parts.find((p) => p.index === i)?.name ?? `Part ${i + 1}`

  const groups = { hub: [], legs: [] }
  const unexplained = []
  for (let i = 0; i < solids.length; i += 1) {
    if (i < hubSolidCount) { groups.hub.push({ index: i, name: nameOf(i) }); continue }
    const offset = i - hubSolidCount
    const replica = Math.floor(offset / unitSolidCount)
    if (unitSolidCount > 0 && replica < count) {
      if (!groups.legs[replica]) groups.legs[replica] = []
      groups.legs[replica].push({ index: i, name: nameOf(i) })
    } else {
      unexplained.push({ index: i, name: nameOf(i) })
    }
  }

  // Every replica must contain the same number of solids, or replication slipped.
  const uniform = groups.legs.every((g) => g.length === unitSolidCount)
  return {
    total: solids.length,
    expected,
    matches: solids.length === expected,
    hubSolidCount,
    unitSolidCount,
    count,
    groups,
    unexplained,
    uniform,
    ok: solids.length === expected && unexplained.length === 0 && uniform,
  }
}

// Components a brief names explicitly, and how to recognise them in part names.
const COMPONENTS = [
  ['centre column', /\b(cent(?:re|er)\s+column|centre post|center post|column)\b/i, /\b(column|centre post|center post|riser)\b/i],
  ['foot', /\b(feet|foot|rubber feet|rubber foot)\b/i, /\b(foot|feet|pad|tip)\b/i],
  ['hub', /\b(hub|chassis|frame|spider)\b/i, /\b(hub|chassis|frame|spider|body)\b/i],
  ['leg', /\b(legs?|arms?|spokes?)\b/i, /\b(leg|arm|spoke|tube|knuckle)\b/i],
  ['hinge', /\b(hinge\w*|pivot\w*)\b/i, /\b(hinge|knuckle|clevis|pin|pivot)\b/i],
  ['telescoping section', /\b(telescop\w*|nested?|sliding sections?)\b/i, /\b(tube|section|stage|inner|outer)\b/i],
  ['head', /\b(head|mounting plate|camera mount|platform)\b/i, /\b(head|plate|mount|platform)\b/i],
]

/**
 * Cross-checks components the brief names against parts that were built.
 * Decomposition splits the design across two prompts, so a component belonging
 * to neither half can be dropped without anything noticing.
 */
export function auditComponents(brief, parts = []) {
  const names = parts.map((p) => String(p.name ?? '')).join(' | ')
  const asked = []
  const missing = []
  for (const [label, inBrief, inParts] of COMPONENTS) {
    if (!inBrief.test(String(brief ?? ''))) continue
    asked.push(label)
    if (!inParts.test(names)) missing.push(label)
  }
  return { asked, missing, ok: missing.length === 0 }
}

/** Parts touching only one neighbour: legitimate, but worth reporting. */
export function weaklyAttached(report, parts = []) {
  const degree = new Map()
  for (const [i, j] of report?.contactPairs ?? []) {
    degree.set(i, (degree.get(i) ?? 0) + 1)
    degree.set(j, (degree.get(j) ?? 0) + 1)
  }
  const out = []
  for (let i = 0; i < (report?.parts ?? 0); i += 1) {
    const d = degree.get(i) ?? 0
    if (d <= 1) out.push({ index: i, name: parts.find((p) => p.index === i)?.name ?? `Part ${i + 1}`, contacts: d })
  }
  return out
}

export function auditWarning(audit, components) {
  const bits = []
  if (audit && !audit.matches) bits.push(`${audit.total} solids built but ${audit.expected} expected`)
  if (audit?.unexplained?.length) bits.push(`${audit.unexplained.length} unexplained solid(s)`)
  if (audit && !audit.uniform) bits.push('replicas have differing part counts')
  if (components?.missing?.length) bits.push(`brief asked for ${components.missing.join(', ')} but none was built`)
  return bits.join('; ')
}
