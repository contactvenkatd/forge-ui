import { requestDesign, requestMetadata, requestCorrection, requestInventory } from './grok.js'
import { describeDisconnection } from './assemblyCheck.js'
import { parseMetadataOnly } from './designParser.js'
import { evaluateReply } from './assemblyCorrection.js'
import { analyseComplexity } from './complexity.js'
import {
  replicateAroundAxis, aggregateMaterials, checkRotationalSymmetry,
  checkReplicaCollisions, validateBaseUnit,
} from './replicate.js'
import { analyzeAssembly } from './assemblyCheck.js'
import { checkMotionCoverage, motionWarning } from './motionCheck.js'
import { radialGroups } from './componentCount.js'
import { auditParts, auditComponents, weaklyAttached, auditWarning } from './partAudit.js'
import { normaliseInventory, extractInventoryHeuristic, auditInventory, inventoryWarning } from './inventory.js'
import { readFences } from './designParser.js'

/**
 * The interface between the two generation calls is defined HERE, not by either
 * model call. Both prompts receive the same numbers, so the hub cannot invent a
 * mount at one diameter while the leg assumes another.
 */
export function mountInterface(count) {
  return {
    HUB_R: 40,          // hub outer radius
    HUB_T: 24,          // hub thickness
    MOUNT_R: 40,        // radius at which the clevis face sits (hub rim)
    MOUNT_Z: 0,         // z of the hinge axis
    PIN_D: 8,           // hinge pin diameter
    BORE_D: 8.3,        // matching bore = pin + 0.3 clearance
    CLEVIS_GAP: 26,     // gap between hub clevis cheeks
    KNUCKLE_W: 25,      // leg knuckle width, 1mm under the gap
    SPACING_DEG: Math.round(360 / count),
  }
}

const contractText = (I, count) => [
  'MOUNTING INTERFACE - these numbers are fixed and shared with the other half of this assembly.',
  'Use them EXACTLY as given. Do not invent your own values for any of them.',
  `  HUB_R      = ${I.HUB_R}    // hub outer radius, mm`,
  `  HUB_T      = ${I.HUB_T}    // hub thickness, mm`,
  `  MOUNT_R    = ${I.MOUNT_R}    // radius at which each mount sits`,
  `  MOUNT_Z    = ${I.MOUNT_Z}     // z height of the hinge axis`,
  `  PIN_D      = ${I.PIN_D}     // hinge pin diameter`,
  `  BORE_D     = ${I.BORE_D}   // bore diameter (pin + 0.3 clearance)`,
  `  CLEVIS_GAP = ${I.CLEVIS_GAP}    // clear gap between the hub clevis cheeks`,
  `  KNUCKLE_W  = ${I.KNUCKLE_W}    // leg knuckle width (1mm under CLEVIS_GAP)`,
  `  There are ${count} mounts, ${I.SPACING_DEG} degrees apart.`,
].join('\n')

const checklist = (items, lead) => (items?.length
  ? ['', `${lead}`, ...items.map((c) => `  - ${c}`),
     'Every item on this list must exist as its own solid in your returned array. Omitting any is an error.']
  : [])

const hubPrompt = (brief, I, count, inventory) => [
  `Original brief: ${brief}`,
  '',
  'BUILD ONLY THE CENTRAL SHARED STRUCTURE - the hub and anything permanently fixed to it',
  `(a centre column, for example). Do NOT build the ${count} repeated sub-assemblies; another pass does that.`,
  '',
  contractText(I, count),
  '',
  `Present ${count} identical mounting clevises on the hub, evenly spaced every ${I.SPACING_DEG} degrees about the`,
  'Z axis. Each clevis is a pair of cheeks straddling a CLEVIS_GAP-wide slot, bored BORE_D on a horizontal',
  'axis at radius MOUNT_R and height MOUNT_Z, so a leg knuckle drops into the slot and a pin passes through.',
  'Build the first clevis, then produce the others by rotating it about Z, so all mounts are identical.',
  'The hub must be rotationally symmetric at that spacing.',
  ...checklist(inventory?.shared, 'YOU MUST INCLUDE THESE SINGULAR / SHARED COMPONENTS:'),
].join('\n')

const unitPrompt = (brief, I, count, inventory) => [
  `Original brief: ${brief}`,
  '',
  'BUILD ONLY ONE of the repeated sub-assemblies - a single complete leg/arm with its own hinge and any',
  `telescoping or sliding sections. Do NOT build the hub, and do NOT build the other ${count - 1} copies;`,
  'they are produced by rotating this one.',
  '',
  contractText(I, count),
  '',
  'Position this single unit as if mounted at the FIRST mount, which lies on the +X axis:',
  '  - its knuckle is KNUCKLE_W wide, bored BORE_D, centred at [MOUNT_R, 0, MOUNT_Z] on a Y-parallel axis',
  '  - the knuckle must OVERLAP the hub rim so the two genuinely touch, not merely approach it',
  '  - everything else extends outward from that knuckle, staying within a 120-degree wedge about +X so',
  '    the copies cannot collide with each other',
  '  - include the hinge pin as its own part',
  'Give the hinge parts motion "rotate" with pivot [MOUNT_R, 0, MOUNT_Z] and axis "y".',
  ...checklist(inventory?.repeated, 'YOU MUST INCLUDE THESE COMPONENTS IN EACH REPEATED UNIT:'),
].join('\n')

async function generate({ brief, prompt, apiKey }) {
  const { content } = await requestDesign({ brief: prompt, apiKey })
  let attempt = evaluateReply(content)
  if (!attempt.ok) return attempt
  if (attempt.materials.length === 0 || attempt.parts.length === 0) {
    try {
      const { content: meta } = await requestMetadata({
        brief: prompt, reply: content, solidCount: attempt.solids.length, apiKey,
      })
      const extra = parseMetadataOnly(meta)
      attempt = {
        ...attempt,
        materials: attempt.materials.length ? attempt.materials : extra.materials,
        parts: attempt.parts.length ? attempt.parts : extra.parts.filter((p) => p.index < attempt.solids.length),
      }
    } catch { /* metadata is a nicety */ }
  }
  return attempt
}

/**
 * Decomposed generation: shared hub, then ONE sub-assembly, validated together,
 * then replicated. Returns { ok: false, reason } when it cannot get a clean base
 * unit, so the caller can fall back to whole-assembly generation.
 */
/**
 * Corrects the hub + ONE unit rather than the full assembly: a handful of parts
 * with an exact measured gap report, which is far easier for the model to fix
 * than a fifteen-part model.
 */
async function correctUnit({ hub, unit, prompt, apiKey, count, rounds = 2 }) {
  let current = unit
  let validation = validateBaseUnit(hub.solids, current.solids)
  const log = []

  for (let round = 1; round <= rounds && !validation.connected; round += 1) {
    // Number the parts as the combined unit sees them, so the report lines up.
    const combinedParts = [
      ...hub.parts.map((p, i) => ({ ...p, index: i })),
      ...current.parts.map((p) => ({ ...p, index: hub.solids.length + p.index })),
    ]
    const feedback = [
      `This is ONE sub-assembly mounted on the shared hub (${count} of these will be replicated around it).`,
      'Only the sub-assembly may change - the hub is fixed and is not yours to modify.',
      '',
      describeDisconnection(validation.report, combinedParts),
      '',
      'Return the corrected code for the SUB-ASSEMBLY ONLY, in the same format, keeping the mounting',
      'interface numbers exactly as specified.',
    ].join('\n')

    let corrected
    try {
      const { content } = await requestCorrection({ brief: prompt, reply: current.reply, feedback, apiKey })
      corrected = evaluateReply(content)
    } catch (error) {
      log.push({ round, error: error.message })
      break
    }
    if (!corrected.ok) { log.push({ round, error: corrected.error }); continue }

    const next = validateBaseUnit(hub.solids, corrected.solids)
    log.push({ round, floating: next.floating, parts: next.parts, accepted: next.floating < validation.floating })
    if (next.floating < validation.floating) {
      current = { ...corrected, materials: corrected.materials.length ? corrected.materials : current.materials,
                  parts: corrected.parts.length ? corrected.parts : current.parts }
      validation = next
    }
  }
  return { unit: current, validation, log }
}

/**
 * Adds components the brief listed but generation dropped. Targeted, like the
 * metadata repair call: it asks only for the missing items, appended to the
 * stage that was supposed to own them.
 */
async function repairMissingComponents({ stageAttempt, missing, prompt, apiKey, which }) {
  const ask = [
    `Your previous ${which} code is missing components the brief explicitly asked for:`,
    ...missing.map((m) => `  - ${m}`),
    '',
    'Return the COMPLETE corrected code block for this stage, with those components added as their own',
    'solids, correctly engaged with the parts already present. Keep every existing part, dimension and',
    'the mounting interface numbers exactly as they are - only ADD what is missing.',
    'Then the materials array, then the parts array covering every returned solid.',
  ].join('\n')
  const { content } = await requestCorrection({ brief: prompt, reply: stageAttempt.reply, feedback: ask, apiKey })
  const corrected = evaluateReply(content)
  if (!corrected.ok) return { ok: false, error: corrected.error }
  return {
    ok: true,
    attempt: {
      ...corrected,
      materials: corrected.materials.length ? corrected.materials : stageAttempt.materials,
      parts: corrected.parts.length ? corrected.parts : stageAttempt.parts,
    },
  }
}

export async function runDecomposedDesign({
  brief, apiKey, onPhase = () => {}, hubAttempts = 2, unitAttempts = 2, unitCorrections = 2,
  useInventory = true, componentRepairs = 2,
}) {
  const complexity = analyseComplexity(brief)
  if (!complexity.decompose) return { ok: false, reason: 'not a decomposable brief', complexity }

  const count = complexity.count
  const I = mountInterface(count)
  const stages = []

  // --- component inventory -------------------------------------------------
  // Derived from the brief, before it is split, so a component belonging to
  // neither half cannot fall between the two prompts.
  onPhase('inventory')
  let inventory = extractInventoryHeuristic(brief, { repeatedNoun: complexity.noun, count })
  if (useInventory) {
    try {
      const { content } = await requestInventory({ brief, repeatedNoun: complexity.noun, count, apiKey })
      const fence = readFences(content).find((f) => f.lang === 'json') ?? readFences(content)[0]
      const parsed = JSON.parse(fence ? fence.body : content)
      inventory = normaliseInventory(parsed, { repeatedNoun: complexity.noun, count })
    } catch (error) {
      stages.push({ stage: 'inventory', fallback: true, error: error.message.slice(0, 60) })
    }
  } else {
    inventory = { repeatedName: complexity.noun, count, repeated: [], shared: [], all: [] }
  }
  stages.push({ stage: 'inventory', shared: inventory.shared.length, repeated: inventory.repeated.length, items: inventory.all })

  onPhase('hub')
  let hub = null
  for (let attempt = 1; attempt <= hubAttempts; attempt += 1) {
    const candidate = await generate({ brief, prompt: hubPrompt(brief, I, count, inventory), apiKey })
    stages.push({ stage: 'hub', attempt, ok: candidate.ok, solids: candidate.ok ? candidate.solids.length : 0, error: candidate.error })
    if (candidate.ok && candidate.solids.length > 0) { hub = candidate; break }
  }
  if (!hub) return { ok: false, reason: 'hub generation failed', stages, complexity }

  const symmetry = checkRotationalSymmetry(hub.solids, count)
  stages.push({ stage: 'symmetry', symmetric: symmetry.symmetric, deviation: symmetry.deviation })

  onPhase('unit')
  let unit = null
  let baseCheck = null
  for (let attempt = 1; attempt <= unitAttempts; attempt += 1) {
    const candidate = await generate({ brief, prompt: unitPrompt(brief, I, count, inventory), apiKey })
    if (!candidate.ok) {
      stages.push({ stage: 'unit', attempt, ok: false, error: candidate.error })
      continue
    }
    onPhase('validating')
    // The cheap pass/fail: hub + ONE unit, a handful of parts rather than 15.
    const validation = validateBaseUnit(hub.solids, candidate.solids)
    stages.push({
      stage: 'unit', attempt, ok: true, solids: candidate.solids.length,
      connected: validation.connected, floating: validation.floating, parts: validation.parts,
    })
    if (validation.connected) { unit = candidate; baseCheck = validation; break }
    if (!unit) { unit = candidate; baseCheck = validation }
  }
  if (!unit) return { ok: false, reason: 'sub-assembly generation failed', stages, complexity }

  // Requirement: correct the cheap hub+leg unit before giving up on decomposition.
  if (!baseCheck.connected) {
    onPhase('correcting-unit')
    const fixed = await correctUnit({
      hub, unit, prompt: unitPrompt(brief, I, count, inventory), apiKey, count, rounds: unitCorrections,
    })
    unit = fixed.unit
    baseCheck = fixed.validation
    stages.push({ stage: 'unit-correction', rounds: fixed.log.length, connected: baseCheck.connected, floating: baseCheck.floating, parts: baseCheck.parts })
  }
  if (!baseCheck.connected) {
    return { ok: false, reason: `base unit still had ${baseCheck.floating} floating parts after correction`, stages, complexity }
  }

  // --- inventory validation, with targeted repair --------------------------
  for (let round = 1; round <= componentRepairs; round += 1) {
    const provisional = [
      ...hub.parts.map((p, i) => ({ ...p, index: i })),
      ...unit.parts.map((p) => ({ ...p, index: hub.solids.length + p.index })),
    ]
    const check = auditInventory(inventory, provisional)
    if (check.ok) break

    onPhase('repairing-components')
    stages.push({ stage: 'component-repair', round, missingShared: check.missingShared, missingRepeated: check.missingRepeated })

    if (check.missingShared.length) {
      const fixed = await repairMissingComponents({
        stageAttempt: hub, missing: check.missingShared,
        prompt: hubPrompt(brief, I, count, inventory), apiKey, which: 'hub',
      }).catch((e) => ({ ok: false, error: e.message }))
      if (fixed.ok) hub = fixed.attempt
    }
    if (check.missingRepeated.length) {
      const fixed = await repairMissingComponents({
        stageAttempt: unit, missing: check.missingRepeated,
        prompt: unitPrompt(brief, I, count, inventory), apiKey, which: 'sub-assembly',
      }).catch((e) => ({ ok: false, error: e.message }))
      if (fixed.ok) {
        const revalidated = validateBaseUnit(hub.solids, fixed.attempt.solids)
        // Only take the repair if it does not break the joint we already proved.
        if (revalidated.floating <= baseCheck.floating) { unit = fixed.attempt; baseCheck = revalidated }
      }
    }
  }

  const collisions = checkReplicaCollisions(unit.solids, count)
  stages.push({ stage: 'collision', collides: collisions.collides, worst: collisions.worst })

  onPhase('replicating')
  const { solids, parts } = replicateAroundAxis({
    hubSolids: hub.solids, hubParts: hub.parts,
    unitSolids: unit.solids, unitParts: unit.parts, count,
  })
  const materials = aggregateMaterials(hub.materials, unit.materials, count)

  onPhase('final-check')
  const assembly = analyzeAssembly(solids)
  stages.push({ stage: 'final', parts: assembly.parts, floating: assembly.floating.length, connected: assembly.connected })

  // Every solid must trace back to the hub or a specific replica.
  const audit = auditParts({
    solids, parts, hubSolidCount: hub.solids.length, unitSolidCount: unit.solids.length, count,
  })
  const components = auditComponents(brief, parts)
  // Hard check against the full inventory taken from the brief before splitting.
  const inventoryCheck = auditInventory(inventory, parts)
  stages.push({ stage: 'inventory-check', asked: inventoryCheck.asked, missing: inventoryCheck.missing })
  const weak = weaklyAttached(assembly, parts)
  stages.push({ stage: 'audit', total: audit.total, expected: audit.expected, unexplained: audit.unexplained.length, missing: components.missing })

  const motion = checkMotionCoverage(brief, parts)
  return {
    ok: true,
    audit, components, weak, inventory, inventoryCheck,
    inventoryWarning: inventoryWarning(inventoryCheck),
    auditWarning: [auditWarning(audit, components), inventoryWarning(inventoryCheck)].filter(Boolean).join('; '),
    complexity,
    stages,
    symmetry,
    collisions,
    chosen: {
      ok: true,
      code: `// Decomposed build: hub + ${count} x sub-assembly\n\n// --- hub ---\n${hub.code}\n\n// --- one sub-assembly, replicated ${count}x about Z ---\n${unit.code}`,
      materials, parts, solids, assembly,
      floating: assembly.floating.length,
      reply: unit.reply,
      motion,
      components: radialGroups(solids),
      hubSolidCount: hub.solids.length,
      unitSolidCount: unit.solids.length,
    },
    motion,
    motionWarning: motionWarning(motion),
  }
}
