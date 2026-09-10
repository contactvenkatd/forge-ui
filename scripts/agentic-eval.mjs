/**
 * Compares single-shot generation against the full agentic vision loop.
 * Runs inside real Chrome because the render step needs WebGL.
 *   node scripts/agentic-eval.mjs <runs> [category]
 */
import puppeteer from 'puppeteer-core'
import { spawn } from 'child_process'
import { readFileSync } from 'fs'

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const PORT = 5198
const URL = `http://localhost:${PORT}/scripts/agentic-harness.html`
const KEY = readFileSync('.env', 'utf8').match(/VITE_XAI_API_KEY=(.*)/)[1].trim()
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const BRIEFS = [
  ['telescoping', 'Design a telescoping tripod leg: an outer tube, an inner tube that slides inside it, a locking collar, and a top mounting yoke that attaches to the tripod head.'],
  ['telescoping', 'Design a telescoping camera monopod section: a wide lower tube, a narrower upper tube nested inside it, and a twist-lock collar.'],
  ['hinge',       'Design a compact wall-mounted folding workbench bracket supporting 100 kg. It must fold flat against the wall and bolt to wall studs.'],
  ['bolted',      'Design a bolted pipe flange coupling joining two 50mm aluminium tubes, using six M8 bolts.'],
]

const RUNS = Number(process.argv[2] ?? 3)
const ONLY = process.argv[3]
const briefs = ONLY ? BRIEFS.filter(([c]) => c === ONLY) : BRIEFS

const vite = spawn('npx', ['vite', '--port', String(PORT), '--strictPort'], { stdio: 'ignore' })
let browser
const rows = []
try {
  for (let i = 0; i < 60; i++) {
    try { const r = await fetch(URL); if (r.ok) break } catch { /* waiting */ }
    await sleep(500)
  }
  browser = await puppeteer.launch({
    executablePath: CHROME, headless: 'new', protocolTimeout: 1800000,
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'],
  })
  const page = await browser.newPage()
  page.setDefaultTimeout(300000)
  await page.goto(URL, { waitUntil: 'networkidle0' })
  await page.waitForFunction('window.__ready === true', { timeout: 30000 })

  console.log(`\n=== AGENTIC EVAL · ${RUNS} runs x ${briefs.length} briefs${ONLY ? ` (${ONLY})` : ''} ===`)
  for (let run = 1; run <= RUNS; run += 1) {
    const line = []
    for (const [label, brief] of briefs) {
      const r = await page.evaluate((b, k) => window.__agentic(b, k), brief, KEY)
      rows.push({ label, ...r })
      line.push(r.ok
        ? `${label}:${r.first.floating}→${r.final.floating}(${r.rounds}r${r.correctionApplied ? ',CORR' : ''}) mat${r.finalMaterials}/prt${r.finalParts}${r.finalMovable ? `/mov${r.finalMovable}` : ''}`
        : `${label}:ERR`)
    }
    console.log(`  run ${run}: ${line.join('  ')}`)
  }
} finally {
  await browser?.close()
  vite.kill('SIGTERM')
}

const ok = rows.filter((r) => r.ok)
const pct = (a, b) => (b ? `${Math.round((a / b) * 100)}%` : 'n/a')
console.log('  ' + '-'.repeat(70))
console.log(`  ${'category'.padEnd(13)} ${'single-shot'.padEnd(24)} agentic vision loop`)
for (const category of [...new Set(briefs.map(([c]) => c))]) {
  const g = ok.filter((r) => r.label === category)
  const sc = g.filter((r) => r.first.floating === 0).length
  const ac = g.filter((r) => r.final.floating === 0).length
  const sf = g.reduce((n, r) => n + r.first.floating, 0)
  const af = g.reduce((n, r) => n + r.final.floating, 0)
  const sp = g.reduce((n, r) => n + r.first.parts, 0)
  const ap = g.reduce((n, r) => n + r.final.parts, 0)
  console.log(`  ${category.padEnd(13)} ${`${sc}/${g.length} ${pct(sc, g.length)}  ${sf}/${sp} float`.padEnd(24)} ${ac}/${g.length} ${pct(ac, g.length)}  ${af}/${ap} float`)
}
const sc = ok.filter((r) => r.first.floating === 0).length
const ac = ok.filter((r) => r.final.floating === 0).length
const sf = ok.reduce((n, r) => n + r.first.floating, 0)
const af = ok.reduce((n, r) => n + r.final.floating, 0)
const sp = ok.reduce((n, r) => n + r.first.parts, 0)
const ap = ok.reduce((n, r) => n + r.final.parts, 0)
console.log('  ' + '-'.repeat(70))
console.log(`  ${'ALL'.padEnd(13)} ${`${sc}/${ok.length} ${pct(sc, ok.length)}  ${sf}/${sp} float ${pct(sf, sp)}`.padEnd(24)} ${ac}/${ok.length} ${pct(ac, ok.length)}  ${af}/${ap} float ${pct(af, ap)}`)
const corrected = ok.filter((r) => r.correctionApplied)
console.log('  ' + '-'.repeat(70))
console.log(`  DATA SURVIVAL after a correction round (${corrected.length} sample${corrected.length === 1 ? '' : 's'} with an applied correction):`)
for (const r of corrected) {
  const good = r.finalMaterials > 0 && r.finalParts === r.finalSolids
  console.log(`    ${good ? 'PASS' : 'FAIL'}  ${r.label.padEnd(13)} materials ${r.finalMaterials}, parts ${r.finalParts}/${r.finalSolids} solids, movable ${r.finalMovable}`)
}
const bad = corrected.filter((r) => r.finalMaterials === 0 || r.finalParts !== r.finalSolids)
console.log(`    -> ${corrected.length - bad.length}/${corrected.length} kept both materials and parts`)
console.log('  ' + '-'.repeat(70))
console.log('  METADATA ACROSS ALL SAMPLES:')
for (const r of ok) {
  const good = r.finalMaterials > 0 && r.finalParts === r.finalSolids
  console.log(`    ${good ? 'PASS' : 'FAIL'}  ${r.label.padEnd(13)} materials ${String(r.finalMaterials).padStart(2)}  parts ${r.finalParts}/${r.finalSolids}  movable ${r.finalMovable}` +
    `${r.metadataRepaired ? '  [repaired]' : ''}${r.correctionApplied ? '  [corrected]' : ''}`)
}
const bothOk = ok.filter((r) => r.finalMaterials > 0 && r.finalParts === r.finalSolids).length
console.log(`    -> ${bothOk}/${ok.length} have populated materials AND parts matching solids`)
console.log(`\n  rounds run: ${ok.reduce((n, r) => n + r.rounds, 0)} | verdict OK first round: ${ok.filter((r) => r.verdicts[0] === 'OK').length}/${ok.length}`)
console.log(`  image payload per view: ~${Math.round((ok.find((r) => r.imageBytes)?.imageBytes ?? 0) / 1024)}KB`)
