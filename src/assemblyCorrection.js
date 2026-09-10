import { buildModel } from './jscadRuntime.js'
import { parseDesignResponse } from './designParser.js'
import { analyzeAssembly, describeDisconnection } from './assemblyCheck.js'
import { requestCorrection } from './grok.js'

/** Parses, builds and scores one reply. Never throws. */
export function evaluateReply(reply) {
  try {
    const parsed = parseDesignResponse(reply)
    const built = buildModel(parsed.code)
    const assembly = analyzeAssembly(built.solids)
    return {
      ok: true,
      reply,
      ...parsed,
      solids: built.solids,
      buildReport: built.report,
      assembly,
      floating: assembly.floating.length,
    }
  } catch (error) {
    return { ok: false, reply, error: error.message, floating: Infinity }
  }
}

/**
 * Folds a corrected candidate onto the design it replaces.
 *
 * A critique round may return only geometry - the model often omits the
 * materials and parts arrays when it did not need to change them. Taking the
 * candidate wholesale then silently empties the bill of materials and the
 * movable-part metadata, so anything the correction did not restate is carried
 * forward instead of being lost.
 */
export function mergeCorrection(previous, candidate) {
  if (!candidate?.ok) return previous
  if (!previous?.ok) return candidate

  const solidCount = candidate.solids.length
  const inRange = (part) => part.index >= 0 && part.index < solidCount

  // Materials describe purchased items, not solids, so they carry over intact.
  const materials = candidate.materials?.length ? candidate.materials : previous.materials
  const materialsRaw = candidate.materialsRaw?.length ? candidate.materialsRaw : previous.materialsRaw

  let parts = []
  let partsStale = false
  if (candidate.parts?.length) {
    // The correction restated the parts: trust it, minus anything out of range.
    parts = candidate.parts.filter(inRange)
  } else if (previous.parts?.length) {
    const carried = previous.parts.filter(inRange)
    if (solidCount === previous.solids.length) {
      // Same number of solids: index alignment holds, keep movement metadata.
      parts = carried
    } else {
      // The correction added or removed parts, so index-bound movement metadata
      // can no longer be trusted - a slider pointing at the wrong mesh is worse
      // than no slider. Names are kept, axis/min/max are dropped.
      partsStale = true
      parts = carried.map(({ index, name }) => ({ index, name }))
    }
  }

  return {
    ...candidate,
    materials,
    materialsRaw,
    parts,
    partsStale,
    carriedMaterials: !candidate.materials?.length && Boolean(previous.materials?.length),
    carriedParts: !candidate.parts?.length && Boolean(previous.parts?.length),
  }
}

/**
 * Runs at most ONE corrective round.
 * The follow-up carries exact measured gaps, and the result is kept only if it
 * genuinely has fewer floating parts - otherwise the original stands. There is
 * no loop: a single bounded attempt, then the best of the two.
 */
export async function correctAssembly({ brief, history = [], attempt, apiKey, onPhase = () => {} }) {
  if (!attempt.ok || attempt.floating === 0) return { chosen: attempt, correction: null }

  const feedback = describeDisconnection(attempt.assembly, attempt.parts ?? [])
  if (!feedback) return { chosen: attempt, correction: null }

  onPhase('correcting')

  let corrected
  let failure = ''
  try {
    const { content } = await requestCorrection({ brief, history, reply: attempt.reply, feedback, apiKey })
    corrected = evaluateReply(content)
  } catch (error) {
    failure = error.message
  }

  // Fewer floating parts wins; a tie keeps the original, since the retry has no
  // proven advantage and the original is what the user already saw building.
  const improved = Boolean(corrected?.ok) && corrected.floating < attempt.floating
  const chosen = improved ? mergeCorrection(attempt, corrected) : attempt

  return {
    chosen,
    correction: {
      feedback,
      reply: corrected?.reply ?? '',
      error: failure || (corrected && !corrected.ok ? corrected.error : ''),
      beforeCode: attempt.code,
      afterCode: corrected?.code ?? '',
      beforeFloating: attempt.floating,
      afterFloating: corrected?.ok ? corrected.floating : null,
      applied: improved,
    },
  }
}
