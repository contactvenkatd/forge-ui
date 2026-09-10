// Movement vocabulary grouped by concept, so "slide" and "sliding" count once
// and a brief saying "slides and extends" counts as two distinct ideas.
const TERM_GROUPS = {
  slide: /\b(slide|slides|sliding|slid)\b/i,
  telescope: /\b(telescop\w*)\b/i,
  extend: /\b(extend\w*|extension)\b/i,
  retract: /\b(retract\w*|collaps\w*)\b/i,
  fold: /\b(fold\w*)\b/i,
  hinge: /\b(hinge\w*|hinged)\b/i,
  rotate: /\b(rotat\w*|spin\w*)\b/i,
  pivot: /\b(pivot\w*|swivel\w*|swing\w*)\b/i,
  tilt: /\b(tilt\w*)\b/i,
  stack: /\b(stack\w*|nest\w*)\b/i,
  drawer: /\b(drawer\w*)\b/i,
  liftoff: /\b(lift(s|ed)?\s+(off|out)|removable|detachab\w*)\b/i,
  adjust: /\b(adjust\w*|telescoping|height[- ]adjust\w*)\b/i,
}

const NUMBER_WORDS = { two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8 }

/** Largest count the brief names near a moving-component noun, e.g. "three nested tube sections". */
function countedStages(brief) {
  const text = brief.toLowerCase()
  let most = 0
  const noun = '(section|stage|tube|tray|shelf|segment|leg|drawer|arm|panel|tier|joint)s?'
  const pattern = new RegExp(`\\b(\\d+|two|three|four|five|six|seven|eight)\\b[^.]{0,40}?\\b${noun}\\b`, 'gi')
  for (const match of text.matchAll(pattern)) {
    const raw = match[1]
    const value = NUMBER_WORDS[raw] ?? Number(raw)
    if (Number.isFinite(value) && value > most) most = value
  }
  return most
}

/**
 * Cross-checks what the brief describes against what the model actually tagged.
 * Deliberately conservative - it flags clear under-delivery, not judgement calls,
 * because a false alarm on every design would train the user to ignore it.
 */
export function checkMotionCoverage(brief, parts = []) {
  const terms = Object.entries(TERM_GROUPS)
    .filter(([, pattern]) => pattern.test(brief ?? ''))
    .map(([name]) => name)

  const tagged = parts.filter((part) => part.motion)
  const stages = countedStages(brief ?? '')

  // A brief naming N moving components implies N-1 stages at minimum: with three
  // nested tubes the outermost is ground, and two sections actually travel.
  const expected = terms.length === 0 ? 0 : Math.max(1, stages > 0 ? stages - 1 : 1)

  return {
    terms,
    stages,
    expected,
    tagged: tagged.length,
    parts: parts.length,
    byMotion: {
      slide: tagged.filter((p) => p.motion === 'slide').length,
      rotate: tagged.filter((p) => p.motion === 'rotate').length,
    },
    // Rotation words present but nothing rotates: the wrong control type.
    missingRotation: terms.some((t) => ['fold', 'hinge', 'rotate', 'pivot', 'tilt'].includes(t)) &&
      tagged.filter((p) => p.motion === 'rotate').length === 0,
    underTagged: terms.length > 0 && tagged.length < expected,
  }
}

export function motionWarning(report) {
  if (!report || report.terms.length === 0) return ''
  const bits = []
  if (report.underTagged) {
    bits.push(`the brief describes movement (${report.terms.join(', ')}) but only ${report.tagged} of ` +
      `${report.parts} parts got adjustment controls` +
      (report.stages ? ` — it names ${report.stages} moving components, so about ${report.expected} were expected` : ''))
  }
  if (report.missingRotation) {
    bits.push('it describes folding/hinging/pivoting but no part was given a rotation control')
  }
  return bits.length ? `Movement tagging looks incomplete: ${bits.join('; ')}.` : ''
}
