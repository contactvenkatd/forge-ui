/** Full pipeline (agentic vision loop) on the multi-mechanism tripod. */
import puppeteer from 'puppeteer-core'
import { spawn } from 'child_process'
import { readFileSync } from 'fs'
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const PORT = 5196
const KEY = readFileSync('.env','utf8').match(/VITE_XAI_API_KEY=(.*)/)[1].trim()
const sleep = (ms) => new Promise(r => setTimeout(r, ms))
const BRIEF = 'Design a camera tripod: a central hub, three legs hinged to the hub that swing out to spread, ' +
  'each leg having two telescoping tube sections that slide independently, a rubber foot on each leg, ' +
  'and a height-adjustable centre column that slides vertically through the hub.'
const EXP_ROT = 3, EXP_SLIDE = 7, EXP_TOTAL = 10

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
  console.log(`\n=== TRIPOD · FULL AGENTIC PIPELINE · ${RUNS} runs ===`)
  console.log(`  expected: ${EXP_ROT} rotate + ${EXP_SLIDE} slide = ${EXP_TOTAL} controls; hub in contact with >= 3 legs\n`)
  for (let i=1;i<=RUNS;i++){
    const r = await page.evaluate((b,k)=>window.__tripod(b,k), BRIEF, KEY)
    rows.push(r)
    console.log(r.ok
      ? `  run ${i}: solids ${String(r.solids).padStart(2)} | rot ${r.rotate}/${EXP_ROT} slide ${r.slide}/${EXP_SLIDE} | ` +
        `floating ${r.firstFloating}->${r.floating} (${r.rounds}r${r.corrected?',CORR':''}) | hub#${r.hub} touches ${r.hubNeighbours} | mats ${r.materials}`
      : `  run ${i}: ERROR ${r.error?.slice(0,60)}`)
  }
} finally { await browser?.close(); vite.kill('SIGTERM') }

const ok = rows.filter(r=>r.ok)
const n = ok.length || 1
const avg = k => (ok.reduce((s,r)=>s+r[k],0)/n).toFixed(1)
console.log('  ' + '-'.repeat(66))
console.log(`  runs ok               ${ok.length}/${RUNS}`)
console.log(`  rotate controls       avg ${avg('rotate')} / ${EXP_ROT}   (>=3: ${ok.filter(r=>r.rotate>=EXP_ROT).length}/${ok.length})`)
console.log(`  slide controls        avg ${avg('slide')} / ${EXP_SLIDE}   (>=7: ${ok.filter(r=>r.slide>=EXP_SLIDE).length}/${ok.length})`)
console.log(`  total controls        avg ${avg('tagged')} / ${EXP_TOTAL}  (>=10: ${ok.filter(r=>r.tagged>=EXP_TOTAL).length}/${ok.length})`)
console.log(`  distinct hinge pivots avg ${(ok.reduce((s,r)=>s+new Set(r.pivots).size,0)/n).toFixed(1)}   (3 distinct: ${ok.filter(r=>new Set(r.pivots).size>=3).length}/${ok.length})`)
console.log(`  hub contacts          avg ${avg('hubNeighbours')}   (>=3 legs on hub: ${ok.filter(r=>r.hubNeighbours>=3).length}/${ok.length})`)
console.log(`  floating single-shot  avg ${avg('firstFloating')}   (clean: ${ok.filter(r=>r.firstFloating===0).length}/${ok.length})`)
console.log(`  floating after loop   avg ${avg('floating')}   (clean: ${ok.filter(r=>r.floating===0).length}/${ok.length})`)
console.log(`  materials populated   ${ok.filter(r=>r.materials>0).length}/${ok.length}`)
