/**
 * Measures whether generated designs are mechanically coherent.
 * Runs several diverse briefs through the live Grok API, executes the generated
 * code, and reports connectivity + whether required features appear.
 *
 *   node scripts/prompt-eval.mjs [old|new]
 */
import { readFileSync } from 'fs'
import { runJscad } from '../src/jscadRuntime.js'
import { parseDesignResponse } from '../src/designParser.js'
import { analyzeAssembly, assemblyWarning } from '../src/assemblyCheck.js'

const KEY = readFileSync('.env', 'utf8').match(/VITE_XAI_API_KEY=(.*)/)?.[1]?.trim()
if (!KEY) { console.error('no VITE_XAI_API_KEY'); process.exit(1) }

const NEW_PROMPT = (await import('../src/grok.js')).DESIGN_SYSTEM_PROMPT
const { PROMPT_BEFORE } = await import('./prompt-before.js')
const OLD_PROMPT = [
  "You are a mechanical CAD assistant. Convert the user's description into valid JSCAD v2 JavaScript only.",
  'JSCAD v2 has NO method chaining. Every transform is a standalone function taking the geometry LAST:',
  'translate([x, y, z], geometry), rotateX(radians, geometry), scale([x, y, z], geometry).',
  'primitives has cuboid/cylinder/sphere; booleans has union/subtract/intersect; transforms has translate/rotate/scale.',
  'main must return an ARRAY containing one separate solid per physical part in the assembly, each translated into',
  'its assembled position. All dimensions in millimetres. Output the JavaScript code block first, then a JSON array',
  'called materials with name, quantity and estimated cost in USD. No extra explanation.',
].join('\n')

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

async function generate(system, brief) {
  const res = await fetch('https://api.x.ai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${KEY}` },
    body: JSON.stringify({ model: 'grok-3', messages: [
      { role: 'system', content: system }, { role: 'user', content: brief },
    ] }),
  })
  if (!res.ok) throw new Error(`${res.status} ${(await res.text()).slice(0, 120)}`)
  const data = await res.json()
  return data.choices[0].message.content
}

// Cheap textual signals for whether mechanism/fastener features were modelled.
const hasHoles = (code) => /subtract\s*\(/.test(code) && /cylinder\s*\(/.test(code)
const hasSharedConsts = (code) => (code.match(/^const [A-Z_]{3,}\s*=/gm) ?? []).length >= 2

const which = process.argv[2] ?? 'new'
const RUNS = Number(process.argv[3] ?? 3)
const system = which === 'old' ? OLD_PROMPT : which === 'before' ? PROMPT_BEFORE : NEW_PROMPT
console.log(`\n=== ${which.toUpperCase()} PROMPT · ${RUNS} runs x ${BRIEFS.length} briefs ===`)

async function trial(label, brief) {
  try {
    const reply = await generate(system, brief)
    const { code } = parseDesignResponse(reply)
    const solids = runJscad(code)
    const report = analyzeAssembly(solids)
    return {
      label, ok: true, parts: report.parts, floating: report.floating.length,
      connected: report.connected, holes: hasHoles(code), consts: hasSharedConsts(code),
    }
  } catch (e) {
    return { label, ok: false, error: e.message.slice(0, 70) }
  }
}

const all = []
for (let run = 1; run <= RUNS; run += 1) {
  const results = await Promise.all(BRIEFS.map(([l, b]) => trial(l, b)))
  all.push(...results)
  const line = results.map((r) => `${r.label.split(' ')[0]}:${r.ok ? (r.connected ? 'OK' : `${r.floating}float`) : 'ERR'}`).join('  ')
  console.log(`  run ${run}: ${line}`)
  for (const r of results.filter((x) => !x.ok)) console.log(`         ! ${r.label}: ${r.error}`)
}

const built = all.filter((r) => r.ok)
const pct = (a, b) => (b ? `${Math.round((a / b) * 100)}%` : 'n/a')

console.log('  ' + '-'.repeat(66))
console.log(`  ${'category'.padEnd(13)} ${'builds'.padEnd(8)} ${'connected'.padEnd(11)} floating parts`)
const categories = [...new Set(BRIEFS.map(([c]) => c))]
for (const category of categories) {
  const rows = all.filter((r) => r.label === category)
  const ok = rows.filter((r) => r.ok)
  const conn = ok.filter((r) => r.connected)
  const parts = ok.reduce((n, r) => n + r.parts, 0)
  const floating = ok.reduce((n, r) => n + r.floating, 0)
  console.log(
    `  ${category.padEnd(13)} ${`${ok.length}/${rows.length}`.padEnd(8)} ` +
    `${`${conn.length}/${ok.length} ${pct(conn.length, ok.length)}`.padEnd(11)} ${floating}/${parts} (${pct(floating, parts)})`,
  )
}
const connected = built.filter((r) => r.connected)
const parts = built.reduce((n, r) => n + r.parts, 0)
const floating = built.reduce((n, r) => n + r.floating, 0)
console.log('  ' + '-'.repeat(66))
console.log(`  ${'ALL'.padEnd(13)} ${`${built.length}/${all.length}`.padEnd(8)} ` +
  `${`${connected.length}/${built.length} ${pct(connected.length, built.length)}`.padEnd(11)} ${floating}/${parts} (${pct(floating, parts)})`)
