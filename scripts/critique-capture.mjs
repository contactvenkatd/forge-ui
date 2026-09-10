// Captures what a real critique reply actually contains.
import puppeteer from 'puppeteer-core'
import { spawn } from 'child_process'
import { readFileSync, writeFileSync } from 'fs'
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const PORT = 5197
const KEY = readFileSync('.env','utf8').match(/VITE_XAI_API_KEY=(.*)/)[1].trim()
const sleep = (ms) => new Promise(r => setTimeout(r, ms))
const vite = spawn('npx', ['vite','--port',String(PORT),'--strictPort'], { stdio: 'ignore' })
let browser
try {
  for (let i=0;i<60;i++){ try{ const r=await fetch(`http://localhost:${PORT}/scripts/agentic-harness.html`); if(r.ok)break }catch{} await sleep(500) }
  browser = await puppeteer.launch({ executablePath: CHROME, headless:'new',
    args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--no-sandbox'] })
  const page = await browser.newPage()
  page.setDefaultTimeout(300000)
  await page.goto(`http://localhost:${PORT}/scripts/agentic-harness.html`, { waitUntil:'networkidle0' })
  await page.waitForFunction('window.__ready === true')
  const out = await page.evaluate(async (k) => {
    const { runAgenticDesign } = await import('/src/agenticDesign.js')
    const { renderPreviews } = await import('/src/renderPreview.js')
    const { parseDesignResponse } = await import('/src/designParser.js')
    const brief = 'Design a compact wall-mounted folding workbench bracket supporting 100 kg. It must fold flat against the wall and bolt to wall studs.'
    const { iterations } = await runAgenticDesign({ brief, apiKey: k,
      render: (s) => renderPreviews(s, { width: 640, height: 480 }) })
    return iterations.map((it, i) => {
      if (i === 0) return { round: 0, note: 'initial' }
      if (!it.critique) return { round: it.round, note: it.error ?? 'no critique' }
      const p = parseDesignResponse(it.critique)
      return { round: it.round, verdict: it.verdict, hasCode: !!p.code,
               materials: p.materials.length, parts: p.parts.length, applied: !!it.applied }
    })
  }, KEY)
  console.log('what each critique reply actually contained:')
  for (const r of out) console.log('  ', JSON.stringify(r))
  writeFileSync('/tmp/critique-shape.json', JSON.stringify(out))
} finally { await browser?.close(); vite.kill('SIGTERM') }
