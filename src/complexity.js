// Nouns that name a repeated SUB-ASSEMBLY arranged around a shared centre.
// Deliberately narrow: these are things that attach radially and carry their own
// mechanism. Sections/stages/tubes are excluded - they nest in a chain, not a
// radial pattern, so replicating them by rotation would be wrong.
const RADIAL_NOUN = /\b(legs?|arms?|spokes?|prongs?|tines?|jaws?|blades?|uprights?|outriggers?|brackets?|fingers?|claws?)\b/i

// Things that come in counts but are NOT sub-assemblies. Seeing "three mounting
// holes" must never route a design into decomposition.
const NOT_A_SUBASSEMBLY = /\b(holes?|bolts?|screws?|fasteners?|slots?|pins?|washers?|nuts?|rivets?|threads?|teeth|grooves?|ribs?|vents?|tabs?|notches?)\b/i

// A shared central structure the repeated elements attach to. Detected by ROLE
// rather than by a fixed vocabulary: either something explicitly described as
// central/single, or whatever noun the repeated elements are said to attach to.
// A hardcoded noun list would miss "turntable", "motor housing", "spider" and
// every other centre a future brief invents.
// Allow an intervening participle: "central ROTATING turntable" names the
// turntable, not the act of rotating.
const CENTRAL_ADJECTIVE = /\b(?:central|centre|center|main|shared|common)\s+(?:[a-z-]+ing\s+)?([a-z][a-z-]{2,})/i
const SINGLE_NOUN = /\b(?:a\s+single|one)\s+(?:[a-z-]+\s+){0,2}?([a-z][a-z-]{2,})\b/i
const ATTACHED_TO = /\b(?:hinged|attached|mounted|fixed|joined|connected|pivoting|radiating|secured)\s+(?:to|on|from|about|around)\s+(?:the|a|an)?\s*(?:[a-z-]+\s+){0,2}?([a-z][a-z-]{2,})\b/i

function centralStructure(brief, repeatedNoun) {
  const text = String(brief)
  const repeated = String(repeatedNoun ?? '').toLowerCase().replace(/s$/, '')
  for (const pattern of [CENTRAL_ADJECTIVE, ATTACHED_TO, SINGLE_NOUN]) {
    const hit = text.match(pattern)
    if (!hit) continue
    const noun = hit[1].toLowerCase().replace(/s$/, '')
    // The centre cannot be the repeated element itself.
    if (noun && noun !== repeated) return noun
  }
  return ''
}

// Repeated elements that are explicitly NOT identical - naive replication by
// rotation would be wrong, so these fall back to whole-assembly generation.
const NON_UNIFORM = /\b(different|differing|varying|unequal|uneven|asymmetric|non-uniform|longer rear|shorter front|each of a different|mixed lengths?|two front .*one|one longer|staggered)\b/i

const WORDS = { two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8 }
const NUM = `(\\d+|${Object.keys(WORDS).join('|')})`

// Mechanism families, reused from the movement vocabulary.
const FAMILIES = {
  hinge: /\b(hinge\w*|fold\w*|swing\w*)\b/i,
  rotate: /\b(rotat\w*|pivot\w*|swivel\w*|tilt\w*|swing\w*)\b/i,
  telescope: /\b(telescop\w*|nest\w*|extend\w*|retract\w*)\b/i,
  slide: /\b(slid\w*|drawer\w*|rails?)\b/i,
  lift: /\b(stack\w*|lift(s|ed)?\s+(off|out)|removable)\b/i,
}

/**
 * Finds "three legs", "four arms" - but only when the counted noun is a genuine
 * sub-assembly, and only when the phrase is not disqualified by a nearby
 * fastener noun ("three legs bolted with six bolts" counts the legs, not bolts).
 */
function repeatedSubAssembly(brief) {
  const pattern = new RegExp(`\\b${NUM}\\s+((?:\\w+[- ]){0,3}?)(${RADIAL_NOUN.source.slice(2, -2)})\\b`, 'gi')
  let best = null
  for (const match of String(brief).matchAll(pattern)) {
    const count = WORDS[match[1].toLowerCase()] ?? Number(match[1])
    const qualifier = match[2] ?? ''
    if (!Number.isFinite(count) || count < 2) continue
    if (NOT_A_SUBASSEMBLY.test(qualifier)) continue
    if (!best || count > best.count) best = { count, noun: match[3], phrase: match[0] }
  }
  return best
}

function mechanismFamilies(brief) {
  return Object.entries(FAMILIES).filter(([, re]) => re.test(brief)).map(([name]) => name)
}

/**
 * Decides whether a brief should use decomposed generation.
 *
 * Deliberately conservative - EVERY condition must hold. A false positive routes
 * a working design into the less-proven path, which is worse than missing an
 * opportunity, so anything ambiguous falls back.
 */
export function analyseComplexity(brief) {
  const text = String(brief ?? '')
  const repeated = repeatedSubAssembly(text)
  const centralNoun = centralStructure(text, repeated?.noun)
  const central = Boolean(centralNoun)
  const families = mechanismFamilies(text)
  const nonUniform = NON_UNIFORM.test(text)

  const reasons = []
  if (!repeated) reasons.push('no counted repeated sub-assembly (legs/arms/spokes...)')
  else if (repeated.count < 3) reasons.push(`only ${repeated.count} repeated elements; needs 3+`)
  if (!central) reasons.push('no central hub/chassis/frame named')
  if (families.length < 2) reasons.push(`only ${families.length} mechanism family; needs 2+`)
  if (nonUniform) reasons.push('repeated elements are described as non-identical')

  const decompose = Boolean(repeated) && repeated.count >= 3 && central && families.length >= 2 && !nonUniform

  return {
    decompose,
    count: repeated?.count ?? 0,
    noun: repeated?.noun ?? '',
    phrase: repeated?.phrase ?? '',
    central,
    centralNoun,
    families,
    nonUniform,
    reasons,
    strategy: decompose ? 'decomposed' : 'single-shot',
  }
}
