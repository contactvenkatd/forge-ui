/**
 * Measures the corrective retry against the single-shot baseline.
 *   node scripts/retry-eval.mjs <runs> [category]
 */
import { readFileSync } from 'fs'
import { evaluateReply, correctAssembly } from '../src/assemblyCorrection.js'
import { DESIGN_SYSTEM_PROMPT } from '../src/grok.js'

const KEY = readFileSync('.env', 'utf8').match(/VITE_XAI_API_KEY=(.*)/)?.[1]?.trim()
if (!KEY) { console.error('no VITE_XAI_API_KEY'); process.exit(1) }

const BRIEFS = [
  ['hinge',       'Design a compact wall-mounted folding workbench bracket supporting 100 kg. It must fold flat against the wall and bolt to wall studs.'],
  ['hinge',       'Design an adjustable monitor arm segment: a base clamp, a pivoting arm, and a pivot pin, mounted to a desk edge.'],
  ['bolted',      'Design a bolted pipe flange coupling joining two 50mm aluminium tubes, using six M8 bolts.'],
  ['bolted',      'Design a steel shelf bracket that bolts to a wall and supports a 300mm deep shelf.'],
  ['stacked',     'Design a stacked tray desk organizer: three trays that stack vertically on spindle posts rising from a base plate.'],
  ['stacked',     'Design a braced monitor riser stand: a top platform, two side uprights, and diagonal braces stiffening the uprights.'],
  ['telescoping', 'Design a telescoping tripod leg: an outer tube, an inner tube that slides inside it, a locking collar, and a top mounting yoke that attaches to the tripod head.'],
  ['telescoping', 'Design a telescoping camera monopod section: a wide lower tube, a narrower upper tube nested inside it, and a twist-lock collar.'],
  ['sliding',     'Design a sliding drawer slide assembly for a toolbox: a fixed rail that screws to the cabinet and a moving carriage that slides along it.'],
  ['sliding',     'Design a linear slide table: a base with a machined channel, a carriage riding in the channel, and an end stop.'],
]

async function generate(brief) {
  const res = await fetch('https://api.x.ai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${KEY}` },
    body: JSON.stringify({ model: 'grok-3', messages: [
      { role: 'system', content: DESIGN_SYSTEM_PROMPT }, { role: 'user', content: brief },
    ] }),
  })
  if (!res.ok) throw new Error(`${res.status}`)
  return (await res.json()).choices[0].message.content
}

async function sample(label, brief) {
  try {
    const first = evaluateReply(await generate(brief))
    if (!first.ok) return { label, ok: false }
    const { chosen, correction } = await correctAssembly({ brief, attempt: first, apiKey: KEY })
    return {
      label, ok: true,
      singleShot: { floating: first.floating, parts: first.assembly.parts },
      withRetry: { floating: chosen.floating, parts: chosen.assembly.parts },
      retried: Boolean(correction),
      applied: Boolean(correction?.applied),
    }
  } catch (e) {
    return { label, ok: false, error: e.message.slice(0, 60) }
  }
}

const RUNS = Number(process.argv[2] ?? 3)
const ONLY = process.argv[3]
const briefs = ONLY ? BRIEFS.filter(([c]) => c === ONLY) : BRIEFS
console.log(`\n=== RETRY EVAL · ${RUNS} runs x ${briefs.length} briefs${ONLY ? ` (${ONLY})` : ''} ===`)

const all = []
for (let run = 1; run <= RUNS; run += 1) {
  const results = await Promise.all(briefs.map(([l, b]) => sample(l, b)))
  all.push(...results)
  console.log(`  run ${run}: ` + results.map((r) =>
    !r.ok ? `${r.label}:ERR`
      : `${r.label}:${r.singleShot.floating}${r.retried ? `→${r.withRetry.floating}${r.applied ? '*' : ''}` : ''}`).join('  '))
}

const ok = all.filter((r) => r.ok)
const pct = (a, b) => (b ? `${Math.round((a / b) * 100)}%` : 'n/a')
const stat = (key) => {
  const conn = ok.filter((r) => r[key].floating === 0).length
  const parts = ok.reduce((n, r) => n + r[key].parts, 0)
  const floating = ok.reduce((n, r) => n + r[key].floating, 0)
  return { conn, parts, floating }
}
const before = stat('singleShot')
const after = stat('withRetry')

console.log('  ' + '-'.repeat(64))
console.log(`  ${'category'.padEnd(13)} ${'single-shot'.padEnd(22)} with retry`)
for (const category of [...new Set(briefs.map(([c]) => c))]) {
  const rows = ok.filter((r) => r.label === category)
  const s = rows.filter((r) => r.singleShot.floating === 0).length
  const w = rows.filter((r) => r.withRetry.floating === 0).length
  const sf = rows.reduce((n, r) => n + r.singleShot.floating, 0)
  const wf = rows.reduce((n, r) => n + r.withRetry.floating, 0)
  const sp = rows.reduce((n, r) => n + r.singleShot.parts, 0)
  const wp = rows.reduce((n, r) => n + r.withRetry.parts, 0)
  console.log(`  ${category.padEnd(13)} ${`${s}/${rows.length} ${pct(s, rows.length)}  ${sf}/${sp} float`.padEnd(22)} ${w}/${rows.length} ${pct(w, rows.length)}  ${wf}/${wp} float`)
}
console.log('  ' + '-'.repeat(64))
console.log(`  ${'ALL'.padEnd(13)} ${`${before.conn}/${ok.length} ${pct(before.conn, ok.length)}  ${before.floating}/${before.parts} float ${pct(before.floating, before.parts)}`.padEnd(22)}`)
console.log(`  ${''.padEnd(13)} ${''.padEnd(22)} ${after.conn}/${ok.length} ${pct(after.conn, ok.length)}  ${after.floating}/${after.parts} float ${pct(after.floating, after.parts)}`)
console.log(`\n  retries triggered: ${ok.filter((r) => r.retried).length}/${ok.length} | corrections accepted: ${ok.filter((r) => r.applied).length}`)
