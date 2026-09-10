import puppeteer from 'puppeteer-core'
import { spawn } from 'child_process'
import { readFileSync } from 'fs'
const CHROME='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const PORT=5192
const KEY=readFileSync('.env','utf8').match(/VITE_XAI_API_KEY=(.*)/)[1].trim()
const sleep=(ms)=>new Promise(r=>setTimeout(r,ms))

// Three categories, each with a shared singular component beyond the hub itself.
const CASES=[
  ['tripod',      'Design a camera tripod: a central hub, three legs hinged to the hub that swing out to spread, each leg having two telescoping tube sections that slide independently, a rubber foot on each leg, and a height-adjustable centre column.'],
  ['fixture',     'Design a robotic bench fixture: a central rotating turntable on a fixed base, four identical gripper arms hinged to the turntable that each pivot and slide radially, a jaw pad on each arm, and a single control lever mounted on the base.'],
  ['ceiling fan', 'Design a ceiling fan: a central motor housing, five identical blades each hinged to the housing and able to tilt, a blade iron on each blade, and a single mounting canopy above the housing.'],
]
const RUNS=Number(process.argv[2]??3)
const vite=spawn('npx',['vite','--port',String(PORT),'--strictPort'],{stdio:'ignore'})
let browser,page; const rows=[]
const launch=async()=>{
  browser=await puppeteer.launch({executablePath:CHROME,headless:'new',protocolTimeout:2400000,
    args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--no-sandbox','--disable-dev-shm-usage']})
  page=await browser.newPage(); page.setDefaultTimeout(2400000)
  await page.goto(`http://localhost:${PORT}/scripts/agentic-harness.html`,{waitUntil:'networkidle0'})
  await page.waitForFunction('window.__ready === true')
}
const run=async(brief,useInv)=>{
  for(let a=1;a<=2;a++){
    try{ return await page.evaluate((b,k,u)=>window.__inventory(b,k,u),brief,KEY,useInv) }
    catch(e){ if(a===2) return {ok:false,reason:'browser: '+e.message.slice(0,40)}; try{await browser?.close()}catch{} await launch() }
  }
}
try{
  for(let i=0;i<60;i++){try{const r=await fetch(`http://localhost:${PORT}/scripts/agentic-harness.html`);if(r.ok)break}catch{}await sleep(500)}
  await launch()
  for(const mode of [false,true]){
    console.log(`\n=== ${mode?'AFTER (inventory checklist + repair)':'BEFORE (no inventory)'} · ${RUNS} runs x ${CASES.length} categories ===`)
    for(const [label,brief] of CASES){
      for(let i=1;i<=RUNS;i++){
        const r=await run(brief,mode)
        rows.push({mode,label,...r})
        console.log(r.ok
          ? `  ${label.padEnd(12)} run ${i}: ${r.complete?'COMPLETE':'MISSING: '+r.missing.join(', ')} | ${r.inventoryItems} items | ${r.solids} solids | ${r.floating} floating | repairs ${r.repairs} | ${r.apiCalls} calls ${r.seconds}s`
          : `  ${label.padEnd(12)} run ${i}: declined (${r.reason?.slice(0,44)})`)
      }
    }
  }
}finally{await browser?.close();vite.kill('SIGTERM')}

console.log('\n'+'='.repeat(78))
const pct=(a,b)=>b?`${Math.round(a/b*100)}%`:'n/a'
console.log(`  ${'category'.padEnd(13)} ${'BEFORE complete'.padEnd(20)} AFTER complete`)
for(const label of CASES.map(c=>c[0])){
  const b=rows.filter(r=>r.mode===false&&r.label===label&&r.ok)
  const a=rows.filter(r=>r.mode===true&&r.label===label&&r.ok)
  console.log(`  ${label.padEnd(13)} ${`${b.filter(r=>r.complete).length}/${b.length} ${pct(b.filter(r=>r.complete).length,b.length)}`.padEnd(20)} ${a.filter(r=>r.complete).length}/${a.length} ${pct(a.filter(r=>r.complete).length,a.length)}`)
}
const B=rows.filter(r=>r.mode===false&&r.ok), A=rows.filter(r=>r.mode===true&&r.ok)
console.log('  '+'-'.repeat(76))
console.log(`  ${'ALL'.padEnd(13)} ${`${B.filter(r=>r.complete).length}/${B.length} ${pct(B.filter(r=>r.complete).length,B.length)}`.padEnd(20)} ${A.filter(r=>r.complete).length}/${A.length} ${pct(A.filter(r=>r.complete).length,A.length)}`)
console.log(`  missing components total : ${B.reduce((s,r)=>s+r.missing.length,0)} -> ${A.reduce((s,r)=>s+r.missing.length,0)}`)
console.log(`  runs needing a repair    : ${A.filter(r=>r.repairs>0).length}/${A.length}`)
console.log(`  avg calls / seconds      : ${(B.reduce((s,r)=>s+r.apiCalls,0)/(B.length||1)).toFixed(1)}/${(B.reduce((s,r)=>s+r.seconds,0)/(B.length||1)).toFixed(0)}s -> ${(A.reduce((s,r)=>s+r.apiCalls,0)/(A.length||1)).toFixed(1)}/${(A.reduce((s,r)=>s+r.seconds,0)/(A.length||1)).toFixed(0)}s`)
