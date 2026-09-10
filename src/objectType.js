const LEAD = /^\s*(?:please\s+)?(?:design|create|build|make|model|draw|generate)\s+(?:me\s+)?(?:a|an|the)?\s*/i
const CLAUSE = /\s+(?:that|which|with|having|for|to|featuring|consisting|comprising|made|capable|able|supporting|so)\b/i
const FILLER = /^(?:simple|basic|compact|small|large|new|custom|modern|sturdy|robust|lightweight|heavy[- ]duty)\s+/i

/**
 * Best-effort object label for the critique prompt, e.g.
 * "Design a camera tripod: a central hub, ..." -> "camera tripod".
 * Only ever used to phrase a question to the model, so an imperfect label
 * degrades the wording rather than breaking anything.
 */
export function extractObjectType(brief) {
  const text = String(brief ?? '').trim()
  if (!text) return 'object'

  let phrase = text.replace(LEAD, '')
  phrase = phrase.split(/[:.;\n]/)[0]
  phrase = phrase.split(CLAUSE)[0]
  phrase = phrase.split(',')[0]
  phrase = phrase.replace(/\s+/g, ' ').trim()
  while (FILLER.test(phrase)) phrase = phrase.replace(FILLER, '')

  // Keep it short: the head noun phrase, not the whole specification.
  const words = phrase.split(' ').filter(Boolean)
  if (words.length === 0) return 'object'
  return words.slice(0, 4).join(' ').toLowerCase()
}
