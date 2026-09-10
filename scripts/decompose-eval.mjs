import puppeteer from 'puppeteer-core'
import { spawn } from 'child_process'
import { readFileSync } from 'fs'
const CHROME='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const PORT=5193
const KEY=readFileSync('.env','utf8').match(/VITE_XAI_API_KEY=(.*)/)[1].trim()
const sleep=(ms)=>new Promise(r=>setTimeout(r,ms))

const TRIPOD='Design a camera tripod: a central hub, three legs hinged to the hub that swing out to spread, each leg having two telescoping tube sections that slide independently, a rubber foot on each leg, and a height-adjustable centre column.'
const SIMPLE=[
  ['hinge bracket','Design a compact wall-mounted folding workbench bracket supporting 100 kg with a hinge.'],
  ['telescoping tube','Design a telescoping tripod leg with three nested tube sections that slide out and lock, plus a foot and a top mounting yoke.'],
]
const RUNS=Number(process.argv[2]??5)
const vite=spawn('npx',['vite','--port',String(PORT),'--strictPort'],{stdio:'ignore'})
let browser; let page; const tri=[]; const simple=[]

const launch = async () => {
  browser = await puppeteer.launch({executablePath:CHROME,headless:'new',protocolTimeout:2400000,
    args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--no-sandbox','--disable-dev-shm-usage']})
  page = await browser.newPage(); page.setDefaultTimeout(2400000)
  await page.goto(`http://localhost:${PORT}/scripts/agentic-harness.html`,{waitUntil:'networkidle0'})
  await page.waitForFunction('window.__ready === true')
}
// A long run can take the browser down; restart it rather than losing the eval.
const runOne = async (brief) => {
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try { return await page.evaluate((b,k)=>window.__strategy(b,k), brief, KEY) }
    catch (e) {
      if (attempt === 2) return { ok:false, error:'browser: '+e.message.slice(0,50) }
      try { await browser?.close() } catch {}
      await launch()
    }
  }
}

try{
  for(let i=0;i<60;i++){try{const r=await fetch(`http://localhost:${PORT}/scripts/agentic-harness.html`);if(r.ok)break}catch{}await sleep(500)}
  await launch()

  console.log(`\n=== TRIPOD via decomposition · ${RUNS} runs ===`)
  for(let i=1;i<=RUNS;i++){
    const r=await runOne(TRIPOD)
    tri.push(r)
    console.log(r.ok
      ? `  run ${i}: ${r.strategy.padEnd(11)} | ${r.floating}/${r.totalParts} floating | ` +
        (r.audit ? `audit ${r.audit.total}/${r.audit.expected} ${r.audit.ok?'ALL ACCOUNTED':`${r.audit.unexplained} UNEXPLAINED`} (${r.audit.hub}+${r.audit.count}x${r.audit.unit})` : 'audit n/a') +
        `${r.missingComponents?.length?` | MISSING: ${r.missingComponents.join(',')}`:''} | rot ${r.rotate} slide ${r.slide} | ${r.apiCalls} calls ${r.seconds}s${r.fallbackReason?` | fell back`:''}`
      : `  run ${i}: ERROR ${r.error?.slice(0,60)}`)
  }

  console.log(`\n=== SIMPLE BRIEFS must still use the fallback path ===`)
  for(const [label,brief] of SIMPLE){
    for(let i=1;i<=2;i++){
      const r=await runOne(brief)
      simple.push({label,...r})
      console.log(r.ok
        ? `  ${label.padEnd(17)} run ${i}: ${r.strategy.padEnd(11)} | ${r.floating}/${r.totalParts} floating | rot ${r.rotate} slide ${r.slide} | mats ${r.materials} | ${r.apiCalls} calls ${r.seconds}s`
        : `  ${label} run ${i}: ERROR ${r.error?.slice(0,50)}`)
    }
  }
}finally{await browser?.close();vite.kill('SIGTERM')}

const ok=tri.filter(r=>r.ok)
const avg=(a,k)=>a.length?(a.reduce((s,r)=>s+r[k],0)/a.length).toFixed(1):'n/a'
console.log('\n'+'='.repeat(74))
console.log('  TRIPOD')
console.log(`    used decomposition        : ${ok.filter(r=>r.strategy==='decomposed').length}/${ok.length}`)
console.log(`    clean (0 floating)        : ${ok.filter(r=>r.floating===0).length}/${ok.length}`)
console.log(`    unresolved (>20% floating): ${ok.filter(r=>r.severeUnresolved).length}/${ok.length}`)
console.log(`    avg floating fraction     : ${(ok.reduce((s,r)=>s+r.severity,0)/(ok.length||1)*100).toFixed(0)}%`)
console.log(`    avg components (want 3)   : ${avg(ok,'components')}`)
console.log(`    avg rotate / slide ctrls  : ${avg(ok,'rotate')} / ${avg(ok,'slide')}`)
console.log(`    materials populated       : ${ok.filter(r=>r.materials>0).length}/${ok.length}`)
console.log(`    avg API calls / seconds   : ${avg(ok,'apiCalls')} / ${avg(ok,'seconds')}s`)
const dec=ok.filter(r=>r.audit)
console.log(`    part accounting complete  : ${dec.filter(r=>r.audit.ok).length}/${dec.length} decomposed runs`)
console.log(`    unexplained solids total  : ${dec.reduce((s,r)=>s+r.audit.unexplained,0)}`)
console.log(`    runs missing a component  : ${ok.filter(r=>r.missingComponents?.length).length}/${ok.length}`)
const sok=simple.filter(r=>r.ok)
console.log('  SIMPLE BRIEFS')
console.log(`    routed to single-shot     : ${sok.filter(r=>r.strategy==='single-shot').length}/${sok.length}`)
console.log(`    clean (0 floating)        : ${sok.filter(r=>r.floating===0).length}/${sok.length}`)
console.log(`    materials populated       : ${sok.filter(r=>r.materials>0).length}/${sok.length}`)
console.log(`    avg API calls / seconds   : ${avg(sok,'apiCalls')} / ${avg(sok,'seconds')}s`)
