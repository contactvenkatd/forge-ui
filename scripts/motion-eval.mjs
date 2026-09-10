/**
 * How many movable parts does each brief describe, versus how many actually got
 * an adjustment control? Runs the real generation + metadata repair path.
 *   node scripts/motion-eval.mjs <runs> [before|after]
 */
import { readFileSync } from 'fs'
import { requestDesign, requestMetadata } from '../src/grok.js'
import { parseDesignResponse, parseMetadataOnly } from '../src/designParser.js'
import { buildModel } from '../src/jscadRuntime.js'
import { checkMotionCoverage, motionWarning } from '../src/motionCheck.js'
import { PROMPT_BEFORE_MOTION } from './prompt-before-motion.js'
import { DESIGN_SYSTEM_PROMPT } from '../src/grok.js'

const KEY = readFileSync('.env', 'utf8').match(/VITE_XAI_API_KEY=(.*)/)[1].trim()
const WHICH = process.argv[3] ?? 'after'
const SYSTEM = WHICH === 'before' ? PROMPT_BEFORE_MOTION : DESIGN_SYSTEM_PROMPT

// expected = moving parts a careful engineer would tag for this brief
const BRIEFS = [
  ['telescoping', 3, 'Design a telescoping tripod leg with three nested tube sections that slide out and lock, plus a foot and a top mounting yoke.'],
  ['hinge',       2, 'Design a wall-mounted folding workbench bracket: a wall plate, a fixed knuckle, a folding support arm that swings down on a hinge pin, and the pin itself.'],
  ['sliding',     2, 'Design a sliding drawer assembly: a fixed cabinet rail, a drawer box that slides out along it, and a handle fixed to the drawer front.'],
  ['pivot',       2, 'Design a rotating pivot arm: a fixed base plate, a pivot post, an arm that rotates about the post, and a mounting head fixed to the end of the arm.'],
]

async function ask(system, messages) {
  const res = await fetch('https://api.x.ai/v1/chat/completions', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${KEY}` },
    body: JSON.stringify({ model: 'grok-3', messages: [{ role: 'system', content: system }, ...messages] }),
  })
  if (!res.ok) throw new Error(`${res.status}`)
  return (await res.json()).choices[0].message.content
}

async function sample(label, expected, brief) {
  try {
    const reply = await ask(SYSTEM, [{ role: 'user', content: brief }])
    let { code, parts } = parseDesignResponse(reply)
    const { solids } = buildModel(code)
    if (parts.length === 0) {
      const meta = await ask(SYSTEM, [
        { role: 'user', content: brief }, { role: 'assistant', content: reply },
        { role: 'user', content: `Your previous reply omitted the parts array. The code returns ${solids.length} solids. Reply with ONE \`\`\`json block: exactly ${solids.length} entries { index, name }, plus motion/axis/min/max (and pivot for rotate) for every part that can move. No other text.` },
      ])
      parts = parseMetadataOnly(meta).parts.filter((p) => p.index < solids.length)
    }
    const m = checkMotionCoverage(brief, parts)
    return { label, ok: true, expected, tagged: m.tagged, slide: m.byMotion.slide,
             rotate: m.byMotion.rotate, parts: parts.length, solids: solids.length,
             flagged: Boolean(motionWarning(m)) }
  } catch (e) { return { label, ok: false, expected, error: e.message.slice(0, 50) } }
}

const RUNS = Number(process.argv[2] ?? 3)
console.log(`\n=== MOTION TAGGING · ${WHICH.toUpperCase()} · ${RUNS} runs x ${BRIEFS.length} briefs ===`)
const all = []
for (let run = 1; run <= RUNS; run += 1) {
  const rows = await Promise.all(BRIEFS.map(([l, e, b]) => sample(l, e, b)))
  all.push(...rows)
  console.log('  run ' + run + ': ' + rows.map((r) => r.ok
    ? `${r.label}:${r.tagged}/${r.expected}${r.rotate ? `(${r.slide}s+${r.rotate}r)` : ''}`
    : `${r.label}:ERR`).join('  '))
}

const ok = all.filter((r) => r.ok)
console.log('  ' + '-'.repeat(68))
console.log(`  ${'category'.padEnd(13)} ${'expected'.padEnd(9)} ${'tagged'.padEnd(9)} ${'slide/rot'.padEnd(11)} complete`)
for (const category of [...new Set(BRIEFS.map(([c]) => c))]) {
  const g = ok.filter((r) => r.label === category)
  const exp = g.reduce((n, r) => n + r.expected, 0)
  const tag = g.reduce((n, r) => n + r.tagged, 0)
  const sl = g.reduce((n, r) => n + r.slide, 0)
  const ro = g.reduce((n, r) => n + r.rotate, 0)
  const full = g.filter((r) => r.tagged >= r.expected).length
  console.log(`  ${category.padEnd(13)} ${String(exp).padEnd(9)} ${String(tag).padEnd(9)} ${`${sl}/${ro}`.padEnd(11)} ${full}/${g.length}`)
}
const exp = ok.reduce((n, r) => n + r.expected, 0)
const tag = ok.reduce((n, r) => n + r.tagged, 0)
const full = ok.filter((r) => r.tagged >= r.expected).length
console.log('  ' + '-'.repeat(68))
console.log(`  ${'ALL'.padEnd(13)} ${String(exp).padEnd(9)} ${String(tag).padEnd(9)} ${`${ok.reduce((n,r)=>n+r.slide,0)}/${ok.reduce((n,r)=>n+r.rotate,0)}`.padEnd(11)} ${full}/${ok.length}`)
console.log(`  coverage ${Math.round((tag / exp) * 100)}% of expected controls | fully covered ${full}/${ok.length} | flagged by validator ${ok.filter((r) => r.flagged).length}`)
