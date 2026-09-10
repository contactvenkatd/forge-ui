import { requestDesign, requestCritique, requestMetadata } from './grok.js'
import { evaluateReply, mergeCorrection } from './assemblyCorrection.js'
import { describeDisconnection } from './assemblyCheck.js'
import { buildWarning } from './jscadRuntime.js'
import { parseMetadataOnly } from './designParser.js'
import { checkMotionCoverage, motionWarning } from './motionCheck.js'
import { extractObjectType } from './objectType.js'
import { judgeStructuralCorrection } from './structuralGate.js'
import { radialGroups } from './componentCount.js'
import { runDecomposedDesign } from './decomposedDesign.js'
import { analyseComplexity } from './complexity.js'

const VERDICT_OK = /VERDICT:\s*OK/i

/**
 * Splits a critique into its structural and connectivity findings.
 * Walks the lines rather than using a regex: a multiline lookahead terminates at
 * every line ending, which silently truncated multi-line sections.
 */
export function classifyCritique(text) {
  const structural = []
  const connectivity = []
  const missing = []
  let bucket = null

  for (const rawLine of String(text ?? '').split('\n')) {
    const line = rawLine.trim()
    if (line.startsWith('```')) break // code block: findings are done
    const header = line.match(/^(STRUCTURAL|CONNECTIVITY|MISSING)\s*:\s*(.*)$/i)
    if (header) {
      const kind = header[1].toUpperCase()
      bucket = kind === 'STRUCTURAL' ? structural : kind === 'MISSING' ? missing : connectivity
      const rest = header[2].trim()
      if (rest && !/^none\.?$/i.test(rest)) bucket.push(rest)
      continue
    }
    if (/^VERDICT\s*:/i.test(line)) { bucket = null; continue }
    if (!bucket || !line) continue
    const cleaned = line.replace(/^[-*\u2022]\s*/, '').replace(/^\d+[.)]\s*/, '').trim()
    if (cleaned && !/^none\.?$/i.test(cleaned)) bucket.push(cleaned)
  }

  return {
    structural, connectivity, missing,
    hasStructural: structural.length > 0 || missing.length > 0,
    hasConnectivity: connectivity.length > 0,
    hasMissing: missing.length > 0,
  }
}

/** The critique brief: what to look at, and exactly how to answer. */
function critiqueMessage({ attempt, legend, images, brief, severity = 0, inventory = null }) {
  const objectType = extractObjectType(brief)
  const percent = Math.round(severity * 100)
  const lines = [
    'Here are renders of the geometry YOUR code just produced. Inspect them as an engineer would inspect',
    'a CAD assembly before release.',
    '',
    `Views supplied, in order: ${images.map((i) => i.name).join(', ')}.`,
    'A ground grid is drawn at the underside of the assembly, so a part hanging above it is visibly floating.',
    '',
    'Each part is a different colour:',
    ...legend.map((entry) => `  index ${entry.index} = ${entry.label}`),
    '',
  ]

  // A majority-broken assembly is not a positioning error. Say so plainly and
  // authorise a full rewrite, or the model returns another small nudge.
  if (severity > 0.3) {
    lines.push(
      '*** THIS ASSEMBLY IS SEVERELY BROKEN ***',
      `${percent}% of the parts are floating disconnected from the rest of the model.`,
      'Do NOT attempt minor position adjustments or small nudges - they will not fix this.',
      'COMPLETELY REWRITE the geometry from first principles:',
      '  - define the shared dimension constants first, then derive every position from them',
      '  - build each joint so the parts genuinely share a face or overlap in volume',
      '  - for a hub-and-spoke design, build ONE spoke correctly engaged with the hub, then produce',
      '    the others by rotating that spoke about the hub axis, so every one connects identically',
      '  - re-check every returned part: name what it touches and which coordinate they share',
      'You have explicit permission to discard the previous code entirely and start over.',
      '',
    )
  }

  const measured = describeDisconnection(attempt.assembly, attempt.parts ?? [])
  if (measured) {
    lines.push('MEASURED DEFECTS (computed from your geometry, not guessed):', '', measured, '')
  } else {
    lines.push('The automatic connectivity check found no disconnected parts, but it only tests contact -',
      'it cannot see proportion, orientation, missing features or parts intersecting where they should not.', '')
  }

  const salvage = buildWarning(attempt.buildReport)
  if (salvage) lines.push(`The build also reported: ${salvage}.`, '')

  lines.push(
    `=== CHECK 1 OF 2: IS THIS A RECOGNISABLE ${objectType.toUpperCase()}? ===`,
    `You are looking at a render of a ${objectType}. Based on your general knowledge of what a real`,
    `${objectType} looks like and how it is actually constructed and used, does this render look like a`,
    'plausible, recognisable, functional version of that object? Specifically check:',
    '',
    `  1. Does it have the correct NUMBER of major structural components a real ${objectType} would have?`,
    '     (a tripod has three legs, not one or two; a bicycle has two wheels; pliers have two handles and',
    '     two jaws; a clock has a face plus hour and minute hands.) Count them in the render.',
    `  2. Are components positioned and connected the way they would be on a real manufactured ${objectType},`,
    '     not merely touching at some arbitrary point?',
    `  3. Does the overall proportion and silhouette resemble the general shape category of a real`,
    `     ${objectType}, or is it an abstract collection of shapes that happen to share a name?`,
    '',
    `If the answer to any of these is no, say specifically what is missing, wrong in count, or structurally`,
    `implausible compared to a real ${objectType} - then fix the actual structural completeness, not just`,
    'part positions.',
    '',
    ...(inventory?.all?.length ? [
      '=== CHECK 2 OF 3: IS EVERY COMPONENT THE BRIEF ASKED FOR ACTUALLY THERE? ===',
      'The brief names these components. Confirm each one is visibly present in the render:',
      ...inventory.shared.map((c) => `  - ${c}  (ONE of these, shared by the whole design)`),
      ...inventory.repeated.map((c) => `  - ${c}  (one per ${inventory.repeatedName}, so ${inventory.count} in total)`),
      'A component that is described but absent is a defect on the same level as a floating part.',
      'List any you cannot see under MISSING below.',
      '',
      '=== CHECK 3 OF 3: ASSEMBLY INTEGRITY ===',
    ] : ['=== CHECK 2 OF 2: ASSEMBLY INTEGRITY ===']),
    'Look specifically for:',
    '  - REPEATED COMPONENT COUNT. If the brief asks for three legs, four bolts or six spokes, count them',
    '    in the render. One leg where three were asked for, or three legs fused into one solid, is a defect.',
    '    Radial patterns must be evenly spaced about the hub axis and each instance must engage the hub.',
    '  - A DESCRIBED MECHANISM MISSING ENTIRELY - no hinge where the brief says hinged, no telescoping',
    '    section where it says telescoping, no adjustable column where it says height-adjustable.',
    '  - PARTS MERGED THAT SHOULD BE SEPARATE. Anything that moves independently must be its own entry in',
    '    the returned array, not unioned into its neighbour.',
    '  - MOVEMENT METADATA COVERAGE. Every part that moves needs its own entry in the parts array, with',
    '    the right motion type: rotate for hinges and pivots, slide for telescoping and drawers. Each',
    '    instance of a repeated mechanism needs its own entry - all three legs, not just the first.',
    '  - parts floating clear of the assembly, or touching only at a corner',
    '  - a part at the wrong scale, or rotated onto the wrong axis',
    '  - nested/telescoping parts that do not actually overlap along their shared axis',
    '  - pins that miss their bores, fasteners with no matching holes',
    '  - anything that could not physically be assembled or would not carry load',
    '',
    'ANSWER FORMAT - follow exactly:',
    `If the design is both a recognisable ${objectType} AND correctly assembled, reply with the single`,
    'line: VERDICT: OK',
    'Otherwise reply with exactly this shape:',
    'VERDICT: PROBLEMS',
    'STRUCTURAL: one short line per structural/count/plausibility problem, or "none"',
    'MISSING: one short line per component from the brief you cannot see in the render, or "none"',
    'CONNECTIVITY: one short line per floating, gap or engagement problem, or "none"',
    'then the COMPLETE corrected code block, then the materials array, then the parts array.',
    'You MUST include all three - code, materials, parts - even if materials and parts are completely',
    'unchanged from your previous answer. Restate them verbatim in that case. Omitting them is an error.',
    'Change only what is needed to fix the listed problems; keep everything else identical.',
  )
  return lines.join('\n')
}

/**
 * Generate, render, critique, correct - bounded.
 * `render(solids)` must return { images, legend } and needs a real WebGL context,
 * so this runs in the browser; it is injected rather than imported to keep this
 * module testable and to let the caller decide the capture size.
 */
// --- severity ---------------------------------------------------------------

/** Fraction of the assembly that is not connected to the main body. */
export function severityOf(attempt) {
  if (!attempt?.ok) return 1
  const parts = attempt.assembly?.parts ?? attempt.solids?.length ?? 0
  if (parts === 0) return 1
  return attempt.floating / parts
}

/**
 * How to treat a result, given how much of it is disconnected.
 *  - severe: a fundamentally failed generation. Nudging positions will not save
 *    it, so regenerate from scratch before trying incremental repair.
 *  - unacceptable: too broken to present as finished, even after repair.
 */
export function severityPlan(severity, { severeFraction = 0.30, acceptableFraction = 0.20, baseRounds = 3 } = {}) {
  const severe = severity > severeFraction
  return {
    severity,
    severe,
    unacceptable: severity > acceptableFraction,
    // Give badly broken assemblies more attempts, not the same fixed budget.
    rounds: severe ? baseRounds + 2 : baseRounds,
  }
}

export async function runAgenticDesign({
  brief, history = [], apiKey, render, onPhase = () => {}, onReply = () => {},
  maxRounds = 3, severeFraction = 0.30, acceptableFraction = 0.20, maxRegenerations = 2,
}) {
  let fallbackReason = ''
  // One complete generation, including the metadata repair call.
  const generateAttempt = async (isFirst) => {
    const { content, status } = await requestDesign({ brief, history, apiKey })
    if (isFirst) onReply(content, status)
    let attempt = evaluateReply(content)
    if (!attempt.ok) return { attempt, repaired: false }

    let repaired = false
    if (attempt.materials.length === 0 || attempt.parts.length === 0) {
      try {
        const { content: meta } = await requestMetadata({
          brief, reply: content, solidCount: attempt.solids.length, apiKey,
        })
        const extra = parseMetadataOnly(meta)
        attempt = {
          ...attempt,
          materials: attempt.materials.length ? attempt.materials : extra.materials,
          materialsRaw: attempt.materialsRaw?.length ? attempt.materialsRaw : extra.materialsRaw,
          parts: attempt.parts.length ? attempt.parts : extra.parts.filter((p) => p.index < attempt.solids.length),
        }
        repaired = extra.materials.length > 0 || extra.parts.length > 0
      } catch { /* metadata is a nicety, never a reason to fail */ }
    }
    return { attempt, repaired }
  }

  // --- strategy gate -------------------------------------------------------
  // Complex multi-mechanism assemblies around a shared hub take the decomposed
  // path. Everything else keeps the whole-assembly pipeline that already works.
  const complexity = analyseComplexity(brief)
  let strategy = 'single-shot'
  let decomposition = null
  let best = null
  let iterations = []

  if (complexity.decompose && render) {
    onPhase('analysing')
    try {
      const decomposed = await runDecomposedDesign({ brief, apiKey, onPhase })
      if (decomposed.ok) {
        strategy = 'decomposed'
        decomposition = decomposed
        best = decomposed.chosen
        // Seed the loop instead of returning: a decomposed assembly can be fully
        // connected and still look wrong (a protruding pin, a component the brief
        // asked for that neither half built), and only the vision pass sees that.
        iterations = [{
          round: 0, code: best.code, floating: best.floating,
          parts: best.assembly.parts, images: [], critique: '', applied: true,
          severity: severityOf(best), stages: decomposed.stages,
          audit: decomposed.audit, components: decomposed.components,
        }]
      } else {
        console.log('[design] decomposition declined:', decomposed.reason)
        fallbackReason = decomposed.reason
      }
    } catch (error) {
      console.log('[design] decomposition failed:', error.message)
      fallbackReason = error.message
    }
  }

  if (!best) {
    onPhase('generating')
    const firstRun = await generateAttempt(true)
    best = firstRun.attempt
    if (!best.ok) return { chosen: best, iterations: [{ round: 0, error: best.error }], regenerations: 0, strategy }

    iterations = [{
      round: 0, code: best.code, floating: best.floating,
      parts: best.assembly.parts, images: [], critique: '', applied: true,
      metadataRepaired: firstRun.repaired, severity: severityOf(best),
    }]
  }

  // --- severe failure: regenerate rather than nudge -------------------------
  let regenerations = 0
  let plan = severityPlan(severityOf(best), { severeFraction, acceptableFraction, baseRounds: maxRounds })

  while (strategy === 'single-shot' && plan.severe && regenerations < maxRegenerations) {
    onPhase('regenerating')
    regenerations += 1
    let candidate
    try {
      candidate = (await generateAttempt(false)).attempt
    } catch (error) {
      iterations.push({ round: 0, regeneration: regenerations, error: `regeneration failed: ${error.message}` })
      break
    }
    const better = candidate.ok && severityOf(candidate) < severityOf(best)
    iterations.push({
      round: 0,
      regeneration: regenerations,
      code: candidate.ok ? candidate.code : '',
      floating: candidate.ok ? candidate.floating : null,
      parts: candidate.ok ? candidate.assembly.parts : null,
      severity: candidate.ok ? severityOf(candidate) : 1,
      applied: better,
      error: candidate.ok ? '' : candidate.error,
    })
    if (better) best = candidate
    plan = severityPlan(severityOf(best), { severeFraction, acceptableFraction, baseRounds: maxRounds })
    if (!plan.severe) break
  }

  // --- incremental render / critique / correct ------------------------------
  for (let round = 1; round <= plan.rounds; round += 1) {
    onPhase('rendering')
    let images = []
    let legend = []
    try {
      ({ images, legend } = await render(best.solids))
    } catch (error) {
      iterations.push({ round, error: `render failed: ${error.message}` })
      break
    }
    if (images.length === 0) break

    const severity = severityOf(best)
    onPhase('reviewing')
    let critique = ''
    try {
      const { content } = await requestCritique({
        brief, reply: best.reply, images,
        feedback: critiqueMessage({ attempt: best, legend, images, brief, severity, inventory: decomposition?.inventory ?? null }),
        apiKey,
      })
      critique = content
    } catch (error) {
      iterations.push({ round, images, error: `critique failed: ${error.message}` })
      break
    }

    const findings = classifyCritique(critique)
    if (VERDICT_OK.test(critique)) {
      iterations.push({
        round, images, critique, verdict: 'OK', floating: best.floating, applied: false, findings, severity,
      })
      break
    }

    onPhase('correcting')
    const parsed = evaluateReply(critique)
    const candidate = parsed.ok ? mergeCorrection(best, parsed) : parsed

    const fewerFloating = candidate.ok && candidate.floating < best.floating
    const claimsStructural = candidate.ok && findings.hasStructural && candidate.floating <= best.floating

    let gate = null
    if (candidate.ok && findings.hasStructural) {
      gate = judgeStructuralCorrection({
        beforeSolids: best.solids, afterSolids: candidate.solids,
        structuralLines: findings.structural, brief,
      })
    }

    let improved
    let acceptedFor = null
    if (fewerFloating) {
      const guttedComponents = gate && gate.before > 0 && gate.after === 0
      improved = !guttedComponents
      acceptedFor = improved ? 'connectivity' : null
      if (guttedComponents) gate = { ...gate, accept: false, reason: `rejected: components collapsed ${gate.before} -> 0` }
    } else if (claimsStructural) {
      improved = Boolean(gate?.accept)
      acceptedFor = improved ? 'structural' : null
    } else {
      improved = false
    }

    iterations.push({
      round, images, critique, verdict: 'PROBLEMS', findings, severity,
      code: candidate.ok ? candidate.code : '',
      floating: candidate.ok ? candidate.floating : null,
      parts: candidate.ok ? candidate.assembly.parts : null,
      error: candidate.ok ? '' : candidate.error,
      acceptedFor, gate,
      carriedMaterials: Boolean(candidate.carriedMaterials),
      carriedParts: Boolean(candidate.carriedParts),
      partsStale: Boolean(candidate.partsStale),
      applied: improved,
    })
    if (improved) best = candidate

    // Give up early only when the result is already acceptable. A badly broken
    // assembly keeps its full round budget even through unproductive rounds.
    const stillBad = severityPlan(severityOf(best), { severeFraction, acceptableFraction }).unacceptable
    if (!improved && !findings.hasStructural && !stillBad) break
  }

  const motion = checkMotionCoverage(brief, best.parts ?? [])
  const components = radialGroups(best.solids)
  const finalPlan = severityPlan(severityOf(best), { severeFraction, acceptableFraction, baseRounds: maxRounds })

  const audit = decomposition && best === decomposition.chosen ? decomposition.audit : null
  const componentAudit = decomposition && best === decomposition.chosen ? decomposition.components : null

  return {
    chosen: { ...best, motion, components },
    strategy,
    complexity,
    stages: decomposition?.stages ?? [],
    audit,
    componentAudit,
    auditWarning: decomposition && best === decomposition.chosen ? decomposition.auditWarning : '',
    inventory: decomposition?.inventory ?? null,
    inventoryCheck: decomposition && best === decomposition.chosen ? decomposition.inventoryCheck : null,
    weak: decomposition?.weak ?? [],
    fallbackReason,
    iterations, motion, components, regenerations,
    severity: finalPlan.severity,
    severeUnresolved: finalPlan.unacceptable,
    motionWarning: motionWarning(motion),
  }
}
