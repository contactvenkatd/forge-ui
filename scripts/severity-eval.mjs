import puppeteer from 'puppeteer-core'
import { spawn } from 'child_process'
import { readFileSync } from 'fs'
const CHROME='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const PORT=5194
const KEY=readFileSync('.env','utf8').match(/VITE_XAI_API_KEY=(.*)/)[1].trim()
const sleep=(ms)=>new Promise(r=>setTimeout(r,ms))
const CASES=[
  ['tripod','Design a camera tripod: a central hub, three legs hinged to the hub that swing out to spread, each leg having two telescoping tube sections that slide independently, a rubber foot on each leg, and a height-adjustable centre column.'],
  ['multi-arm','Design a five-arm articulated desk lamp mount: a weighted base, five hinged arm segments each pivoting on its own pin, and a lamp head at the end.'],
  ['telescoping','Design a telescoping survey pole: four nested tube sections that slide inside each other, three twist-lock collars, a spiked foot and a top mounting plate.'],
]
const RUNS=Number(process.argv[2]??3)
const vite=spawn('npx',['vite','--port',String(PORT),'--strictPort'],{stdio:'ignore'})
let browser; const rows=[]
try{
  for(let i=0;i<60;i++){try{const r=await fetch(`http://localhost:${PORT}/scripts/agentic-harness.html`);if(r.ok)break}catch{}await sleep(500)}
  browser=await puppeteer.launch({executablePath:CHROME,headless:'new', protocolTimeout: 1800000,args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--no-sandbox']})
  const page=await browser.newPage(); page.setDefaultTimeout(900000)
  await page.goto(`http://localhost:${PORT}/scripts/agentic-harness.html`,{waitUntil:'networkidle0'})
  await page.waitForFunction('window.__ready === true')
  console.log(`\n=== SEVERITY HANDLING · ${RUNS} runs x ${CASES.length} categories ===\n`)
  for(const [label,brief] of CASES){
    for(let i=1;i<=RUNS;i++){
      const r=await page.evaluate((b,k)=>window.__severity(b,k),brief,KEY)
      if(!r.ok){console.log(`  ${label} run ${i}: ERROR ${r.error?.slice(0,50)}`);continue}
      rows.push({label,...r})
      console.log(`  ${label.padEnd(12)} run ${i}: initial ${r.firstFloating}/${r.firstParts} (${Math.round(r.firstSeverity*100)}%) | ` +
        `regens ${r.regenerations}${r.regenAccepted?`(${r.regenAccepted} kept)`:''} | rounds ${r.rounds} | ` +
        `final ${r.finalFloating}/${r.finalParts} (${Math.round(r.severity*100)}%)${r.severeUnresolved?' UNRESOLVED':''}`)
    }
  }
}finally{await browser?.close();vite.kill('SIGTERM')}
const ok=rows
const pct=(a,b)=>b?`${Math.round(a/b*100)}%`:'n/a'
const severeStart=ok.filter(r=>r.firstSeverity>0.30)
console.log('\n'+'='.repeat(74))
console.log(`  generations that started SEVERE (>30%)   : ${severeStart.length}/${ok.length} (${pct(severeStart.length,ok.length)})`)
console.log(`  of those, regeneration triggered          : ${severeStart.filter(r=>r.regenerations>0).length}/${severeStart.length}`)
console.log(`  of those, a regeneration was kept         : ${severeStart.filter(r=>r.regenAccepted>0).length}/${severeStart.length}`)
console.log(`  of those, ended acceptable (<=20%)        : ${severeStart.filter(r=>!r.severeUnresolved).length}/${severeStart.length}`)
console.log(`  ALL: floating clean at end                : ${ok.filter(r=>r.finalFloating===0).length}/${ok.length}`)
console.log(`  ALL: unresolved (>20%) shipped w/ notice  : ${ok.filter(r=>r.severeUnresolved).length}/${ok.length}`)
console.log(`  avg severity  initial ${(ok.reduce((s,r)=>s+r.firstSeverity,0)/(ok.length||1)*100).toFixed(0)}%  ->  final ${(ok.reduce((s,r)=>s+r.severity,0)/(ok.length||1)*100).toFixed(0)}%`)
