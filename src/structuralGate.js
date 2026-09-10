import { radialGroups } from './componentCount.js'

const WORDS = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 }
// Nouns that name a repeated MAJOR component, not a fastener or a sub-feature.
const COMPONENT = '(?:legs?|arms?|handles?|jaws?|blades?|wheels?|hands?|spokes?|prongs?|tines?|feet|foot|sections?|uprights?|posts?|columns?)'

/**
 * The count the critique itself asserted, e.g. "a real tripod needs three legs".
 * Falls back to a count stated in the brief. Returns null when neither says one,
 * because a gate needs a number it can actually check.
 */
export function claimedComponentCount(structuralLines = [], brief = '') {
  const NUM = `(\\d+|${Object.keys(WORDS).join('|')})`
  const toNumber = (raw) => WORDS[String(raw).toLowerCase()] ?? Number(raw)

  // Ordered by authority. A critique usually states the OBSERVED count first and
  // the CORRECT one second ("four arms instead of three legs", "only two legs,
  // a real tripod needs three"), so prescriptive phrasing must win over the
  // first number in the line.
  const PATTERNS = [
    new RegExp(`instead of\\s+(?:only\\s+)?${NUM}`, 'i'),
    new RegExp(`(?:needs?|requires?|should have|must have|should be)\\s+(?:at least\\s+)?${NUM}`, 'i'),
    new RegExp(`${NUM}\\s+(?:evenly spaced\\s+|independent\\s+|separate\\s+|distinct\\s+)?${COMPONENT}\\b`, 'i'),
  ]

  const fromClaim = (text) => {
    const t = String(text ?? '')
    for (const pattern of PATTERNS) {
      const hit = t.match(pattern)
      if (hit) {
        const value = toNumber(hit[1])
        if (Number.isFinite(value) && value > 0) return value
      }
    }
    return null
  }

  for (const line of structuralLines) {
    // "only two legs visible, a real tripod needs three" - the prescriptive
    // number wins, so scan for it across the whole line first.
    const claim = fromClaim(line)
    if (claim !== null && claim > 0) return claim
  }
  const fromBrief = fromClaim(brief)
  return fromBrief !== null && fromBrief > 0 ? fromBrief : null
}

/**
 * Turns the model's own claim into a verifiable acceptance test.
 * A structural correction is kept only when the measured component count moves
 * toward - or reaches - the count the critique said was needed.
 */
export function judgeStructuralCorrection({ beforeSolids, afterSolids, structuralLines, brief }) {
  const before = radialGroups(beforeSolids).groups
  const after = radialGroups(afterSolids).groups
  const target = claimedComponentCount(structuralLines, brief)

  if (target === null) {
    // No checkable number. Allow the fix, but never let it delete components -
    // that is how a two-handed tool became a one-piece blob.
    const accept = after >= before
    return { accept, before, after, target, reason: accept ? 'no count claimed; components preserved' : `no count claimed and components dropped ${before} -> ${after}` }
  }

  const wasOff = Math.abs(before - target)
  const nowOff = Math.abs(after - target)

  // Accept when the count reaches the target, genuinely closes on it, or is left
  // alone (the correction addressed something other than count). An equidistant
  // swap such as 2 -> 4 against a target of 3 is a different wrong, not progress.
  const hitsTarget = after === target
  const closer = nowOff < wasOff
  const unchanged = after === before
  const accept = hitsTarget || closer || unchanged

  let reason
  if (hitsTarget) reason = `components ${before} -> ${after} matches target ${target}`
  else if (closer) reason = `components ${before} -> ${after} closer to target ${target}`
  else if (unchanged) reason = `components unchanged at ${before}; correction was not about count`
  else reason = `rejected: components ${before} -> ${after} does not approach target ${target}`

  return { accept, before, after, target, reason }
}
