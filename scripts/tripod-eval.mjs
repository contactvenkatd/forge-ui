/**
 * Full multi-mechanism tripod: hub + 3 hinged legs + telescoping sections
 * + feet + height-adjustable centre column.
 *   node scripts/tripod-eval.mjs <runs> [before|after]
 */
import { readFileSync } from 'fs'
import { parseDesignResponse, parseMetadataOnly } from '../src/designParser.js'
import { buildModel } from '../src/jscadRuntime.js'
import { analyzeAssembly } from '../src/assemblyCheck.js'
import { checkMotionCoverage, motionWarning } from '../src/motionCheck.js'
import { DESIGN_SYSTEM_PROMPT } from '../src/grok.js'
import { PROMPT_BEFORE_MULTI } from './prompt-before-multi.js'

const KEY = readFileSync('.env', 'utf8').match(/VITE_XAI_API_KEY=(.*)/)[1].trim()
const WHICH = process.argv[3] ?? 'after'
const SYSTEM = WHICH === 'before' ? PROMPT_BEFORE_MULTI : DESIGN_SYSTEM_PROMPT

export const TRIPOD_BRIEF =
  'Design a camera tripod: a central hub, three legs hinged to the hub that swing out to spread, ' +
  'each leg having two telescoping tube sections that slide independently, a rubber foot on each leg, ' +
  'and a height-adjustable centre column that slides vertically through the hub.'

// 3 hinge rotations + 3 legs x 2 sliding sections + 1 centre column
const EXPECTED_ROTATE = 3
const EXPECTED_SLIDE = 7
const EXPECTED_TOTAL = EXPECTED_ROTATE + EXPECTED_SLIDE

async function ask(messages) {
  const res = await fetch('https://api.x.ai/v1/chat/completions', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${KEY}` },
    body: JSON.stringify({ model: 'grok-3', messages: [{ role: 'system', content: SYSTEM }, ...messages] }),
  })
  if (!res.ok) throw new Error(`${res.status}`)
  return (await res.json()).choices[0].message.content
}

const LEG_HINT = /\b(leg|arm)\b/i
const HUB_HINT = /\b(hub|body|centre body|center body|spider|yoke)\b/i

export async function tripodSample() {
  const reply = await ask([{ role: 'user', content: TRIPOD_BRIEF }])
  let { code, materials, parts } = parseDesignResponse(reply)
  const { solids } = buildModel(code)
  if (parts.length === 0 || materials.length === 0) {
    const meta = await ask([
      { role: 'user', content: TRIPOD_BRIEF }, { role: 'assistant', content: reply },
      { role: 'user', content: `Your previous reply omitted the materials and/or parts arrays. The code returns ${solids.length} solids. Reply with TWO \`\`\`json blocks only: materials, then parts with exactly ${solids.length} entries { index, name } plus motion/axis/min/max (and pivot for rotate) for every part that moves. No other text.` },
    ])
    const extra = parseMetadataOnly(meta)
    if (!parts.length) parts = extra.parts.filter((p) => p.index < solids.length)
    if (!materials.length) materials = extra.materials
  }

  const assembly = analyzeAssembly(solids)
  const motion = checkMotionCoverage(TRIPOD_BRIEF, parts)

  // hub-to-leg joints, verified per leg rather than assumed symmetric
  const hubIdx = parts.filter((p) => HUB_HINT.test(p.name)).map((p) => p.index)
  const legIdx = parts.filter((p) => LEG_HINT.test(p.name)).map((p) => p.index)
  const touches = new Set((assembly.contactPairs ?? []).map(([a, b]) => `${a}-${b}`))
  const joined = (a, b) => touches.has(`${Math.min(a, b)}-${Math.max(a, b)}`)
  const legsOnHub = legIdx.filter((l) => hubIdx.some((h) => joined(h, l)))

  // distinct legs implied by the parts naming (leg 1/2/3, left/right/rear...)
  const legGroups = new Set(parts.filter((p) => LEG_HINT.test(p.name))
    .map((p) => (p.name.match(/\b([123]|one|two|three|a|b|c|front|rear|left|right|back)\b/i)?.[1] ?? '').toLowerCase())
    .filter(Boolean))

  return {
    solids: solids.length,
    parts: parts.length,
    materials: materials.length,
    rotate: motion.byMotion.rotate,
    slide: motion.byMotion.slide,
    tagged: motion.tagged,
    floating: assembly.floating.length,
    hubParts: hubIdx.length,
    legParts: legIdx.length,
    legGroups: legGroups.size,
    hubLegJoints: legsOnHub.length,
    contactPairs: (assembly.contactPairs ?? []).length,
    flagged: Boolean(motionWarning(motion)),
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const RUNS = Number(process.argv[2] ?? 5)
  console.log(`\n=== TRIPOD (multi-mechanism) · ${WHICH.toUpperCase()} · ${RUNS} runs ===`)
  console.log(`  expected: ${EXPECTED_ROTATE} rotate + ${EXPECTED_SLIDE} slide = ${EXPECTED_TOTAL} controls, 3 hub-to-leg joints\n`)
  const rows = []
  for (let i = 1; i <= RUNS; i += 1) {
    try {
      const r = await tripodSample()
      rows.push(r)
      console.log(`  run ${i}: solids ${String(r.solids).padStart(2)} | parts ${String(r.parts).padStart(2)} | ` +
        `rot ${r.rotate}/${EXPECTED_ROTATE} slide ${r.slide}/${EXPECTED_SLIDE} | ` +
        `legGroups ${r.legGroups} | hub-leg joints ${r.hubLegJoints}/3 | floating ${r.floating} | mats ${r.materials}`)
    } catch (e) { console.log(`  run ${i}: ERROR ${e.message.slice(0, 60)}`) }
  }
  const n = rows.length || 1
  const avg = (k) => (rows.reduce((s, r) => s + r[k], 0) / n).toFixed(1)
  console.log('  ' + '-'.repeat(64))
  console.log(`  runs ok            ${rows.length}/${RUNS}`)
  console.log(`  rotate controls    avg ${avg('rotate')} / ${EXPECTED_ROTATE}   (all 3 hinges: ${rows.filter((r) => r.rotate >= 3).length}/${rows.length})`)
  console.log(`  slide controls     avg ${avg('slide')} / ${EXPECTED_SLIDE}   (all 7: ${rows.filter((r) => r.slide >= EXPECTED_SLIDE).length}/${rows.length})`)
  console.log(`  total controls     avg ${avg('tagged')} / ${EXPECTED_TOTAL}  (complete: ${rows.filter((r) => r.tagged >= EXPECTED_TOTAL).length}/${rows.length})`)
  console.log(`  distinct legs      avg ${avg('legGroups')} / 3   (3 distinct: ${rows.filter((r) => r.legGroups >= 3).length}/${rows.length})`)
  console.log(`  hub-to-leg joints  avg ${avg('hubLegJoints')} / 3   (all 3 verified: ${rows.filter((r) => r.hubLegJoints >= 3).length}/${rows.length})`)
  console.log(`  floating parts     avg ${avg('floating')}   (clean: ${rows.filter((r) => r.floating === 0).length}/${rows.length})`)
  console.log(`  validator flagged  ${rows.filter((r) => r.flagged).length}/${rows.length}`)
}
