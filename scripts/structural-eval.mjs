/**
 * Does the vision critique catch STRUCTURAL / count / plausibility problems,
 * not just floating parts?  node scripts/structural-eval.mjs <runs>
 */
import puppeteer from 'puppeteer-core'
import { spawn } from 'child_process'
import { readFileSync } from 'fs'
import { buildModel } from '../src/jscadRuntime.js'
import { radialGroups } from '../src/componentCount.js'

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const PORT = 5195
const KEY = readFileSync('.env','utf8').match(/VITE_XAI_API_KEY=(.*)/)[1].trim()
const sleep = (ms) => new Promise(r => setTimeout(r, ms))

// expectedGroups = major repeated structural components a real one has
const CASES = [
  ['tripod', 3, 'Design a camera tripod: a central hub, three legs hinged to the hub that swing out to spread, each leg having two telescoping tube sections that slide independently, a rubber foot on each leg, and a height-adjustable centre column.'],
  ['pliers', 2, 'Design a pair of pliers: two handles joined by a central pivot, with gripping jaws at the working end.'],
  ['wall clock', 2, 'Design a wall clock: a round face plate, an hour hand and a minute hand on a central spindle, and a rear mounting bracket.'],
]

const RUNS = Number(process.argv[2] ?? 5)
const vite = spawn('npx', ['vite','--port',String(PORT),'--strictPort'], { stdio:'ignore' })
let browser
const rows = []
try {
  for (let i=0;i<60;i++){ try{ const r=await fetch(`http://localhost:${PORT}/scripts/agentic-harness.html`); if(r.ok)break }catch{} await sleep(500) }
  browser = await puppeteer.launch({ executablePath: CHROME, headless:'new', protocolTimeout: 1800000,
    args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--no-sandbox'] })
  const page = await browser.newPage()
  page.setDefaultTimeout(600000)
  await page.goto(`http://localhost:${PORT}/scripts/agentic-harness.html`, { waitUntil:'networkidle0' })
  await page.waitForFunction('window.__ready === true')

  for (const [label, expected, brief] of CASES) {
    const runs = label === 'tripod' ? RUNS : Math.max(2, Math.ceil(RUNS / 2))
    console.log(`\n=== ${label.toUpperCase()} · ${runs} runs · expecting ${expected} major components ===`)
    for (let i=1;i<=runs;i++){
      const r = await page.evaluate((b,k)=>window.__structural(b,k), brief, KEY)
      if (!r.ok) { console.log(`  run ${i}: ERROR ${r.error?.slice(0,60)}`); continue }
      let before = null, after = null
      try { before = radialGroups(buildModel(r.firstCode).solids).groups } catch {}
      try { after = radialGroups(buildModel(r.finalCode).solids).groups } catch {}
      rows.push({ label, expected, before, after, ...r })
      console.log(`  run ${i}: components ${before}->${after} (want ${expected}) | ` +
        `floating ${r.firstFloating}->${r.floating} | S:${r.structural.length} C:${r.connectivity.length} | ${r.rounds}r${r.corrected?',CORR':''}`)
      if (r.structural.length) console.log(`         structural: "${r.structural[0].slice(0,88)}"`)
    }
  }
} finally { await browser?.close(); vite.kill('SIGTERM') }

console.log('\n' + '='.repeat(74))
console.log(`  ${'object'.padEnd(12)} ${'runs'.padEnd(5)} ${'components before'.padEnd(19)} ${'components after'.padEnd(18)} structural flags`)
for (const label of [...new Set(CASES.map(c=>c[0]))]) {
  const g = rows.filter(r=>r.label===label)
  if (!g.length) continue
  const exp = g[0].expected
  const okBefore = g.filter(r=>r.before===exp).length
  const okAfter = g.filter(r=>r.after===exp).length
  const flagged = g.filter(r=>r.structural.length>0).length
  console.log(`  ${label.padEnd(12)} ${String(g.length).padEnd(5)} ` +
    `${`${okBefore}/${g.length} correct`.padEnd(19)} ${`${okAfter}/${g.length} correct`.padEnd(18)} ${flagged}/${g.length} runs raised one`)
}
const all = rows
console.log('  ' + '-'.repeat(72))
console.log(`  structural critiques raised : ${all.reduce((n,r)=>n+r.structural.length,0)} across ${all.length} runs (${all.filter(r=>r.structural.length).length} runs)`)
console.log(`  connectivity critiques raised: ${all.reduce((n,r)=>n+r.connectivity.length,0)} across ${all.length} runs (${all.filter(r=>r.connectivity.length).length} runs)`)
console.log(`  component count correct      : ${all.filter(r=>r.before===r.expected).length}/${all.length} -> ${all.filter(r=>r.after===r.expected).length}/${all.length}`)
console.log(`  floating clean               : ${all.filter(r=>r.firstFloating===0).length}/${all.length} -> ${all.filter(r=>r.floating===0).length}/${all.length}`)
