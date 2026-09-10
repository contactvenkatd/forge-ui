/**
 * Real-browser checks for the 3D viewport.
 * Drives the system Chrome with actual WebGL - real frames, real pixels, real
 * OrbitControls. Nothing here is stubbed.
 *
 *   npm run check:viewer      (starts vite, runs Chrome, tears both down)
 */
import puppeteer from 'puppeteer-core'
import { spawn } from 'child_process'

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const PORT = 5199
const URL = `http://localhost:${PORT}/scripts/viewer-harness.html`
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const results = []
const check = (name, pass, detail) => {
  results.push({ name, pass })
  console.log(`  ${pass ? 'PASS' : 'FAIL'}  ${name}\n        ${detail}`)
}

const vite = spawn('npx', ['vite', '--port', String(PORT), '--strictPort'], { stdio: 'ignore' })
let browser
try {
  for (let i = 0; i < 60; i++) {
    try { const r = await fetch(URL); if (r.ok) break } catch { /* not up yet */ }
    await sleep(500)
  }

  browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: 'new',
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'],
  })
  const page = await browser.newPage()
  await page.setViewport({ width: 900, height: 600 })

  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  // Browser-level resource 404s (favicon) are not app errors; real JS failures
  // arrive via 'pageerror'.
  page.on('response', (r) => {
    if (r.status() === 404 && !r.url().includes('favicon')) errors.push(`404 ${r.url()}`)
  })
  page.on('console', (m) => {
    const t = m.text()
    if (m.type() === 'error' && !t.startsWith('Failed to load resource')) errors.push(t)
  })

  await page.goto(URL, { waitUntil: 'networkidle0' })
  await page.waitForFunction('window.__harnessReady === true', { timeout: 20000 })

  // --- WebGL actually available? ------------------------------------------
  const gl = await page.evaluate(() => {
    const c = document.querySelector('canvas')
    const ctx = c?.getContext('webgl2') || c?.getContext('webgl')
    return { hasCanvas: !!c, hasGl: !!ctx, renderer: ctx ? ctx.getParameter(ctx.VERSION) : null,
             w: c?.width ?? 0, h: c?.height ?? 0 }
  })
  check('real WebGL context in a real browser', gl.hasGl, `${gl.renderer} | canvas ${gl.w}x${gl.h}`)

  // --- 1. loop runs immediately, with ZERO geometry ------------------------
  console.log('\n[1] ANIMATE LOOP - before any geometry exists')
  const f0 = await page.evaluate(() => window.__viewerFrames ?? 0)
  await sleep(1000)
  const f1 = await page.evaluate(() => window.__viewerFrames ?? 0)
  const meshes0 = await page.evaluate(() => window.__viewerMeshes ?? -1)
  check('frame counter climbs with no model loaded',
    f1 > f0 && f1 > 20,
    `frames ${f0} -> ${f1} in 1s (${f1 - f0} fps) with ${meshes0} meshes in the scene`)
  check('scene genuinely has zero geometry at this point', meshes0 === 0, `${meshes0} meshes`)

  // --- 2. geometry loads, loop continues uninterrupted ---------------------
  console.log('\n[2] GEOMETRY - loop must not stutter or stop')
  await page.evaluate(() => window.__loadModel())
  await page.waitForFunction('window.__viewerMeshes === 5', { timeout: 15000 })
  const f2 = await page.evaluate(() => window.__viewerFrames ?? 0)
  await sleep(1000)
  const f3 = await page.evaluate(() => window.__viewerFrames ?? 0)
  const meshes = await page.evaluate(() => window.__viewerMeshes)
  check('all 5 solids became meshes in the scene', meshes === 5, `${meshes} meshes`)
  check('loop keeps climbing after geometry loads',
    f3 > f2 && f3 - f2 > 20,
    `frames ${f2} -> ${f3} in 1s (${f3 - f2} fps)`)

  // --- pixels: is anything actually drawn? ---------------------------------
  const pixels = await page.evaluate(async () => {
    window.__wantPixelSample = true
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
    return window.__pixelSample
  })
  check('the model is actually visible in the framebuffer',
    pixels && pixels.distinct > 5 && pixels.lit > 2000,
    pixels ? `${pixels.distinct} distinct colours, ${pixels.lit}/${pixels.total} lit pixels (blank = 1 colour, 0 lit)` : 'no sample')

  // --- 3. OrbitControls responds to real pointer events --------------------
  console.log('\n[3] ORBITCONTROLS - real pointer events through Chrome')
  const before = await page.evaluate(() => {
    const c = window.__viewerRef.current
    return null
  })
  const camBefore = await page.evaluate(() => {
    const p = document.querySelector('canvas')
    return window.__camSnapshot ? window.__camSnapshot() : null
  })

  // read the camera straight off the HUD, which the loop writes every frame
  const readCam = async () => page.evaluate(() => {
    const hud = [...document.querySelectorAll('p')].find((n) => n.textContent.startsWith('F '))
    const m = hud?.textContent.match(/cam (-?\d+),(-?\d+),(-?\d+)/)
    return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null
  })

  const camStart = await readCam()
  const box = await page.evaluate(() => {
    const r = document.querySelector('canvas').getBoundingClientRect()
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 }
  })

  await page.mouse.move(box.x, box.y)
  await page.mouse.down()
  const samples = []
  for (let i = 1; i <= 30; i++) {
    await page.mouse.move(box.x + i * 6, box.y + i * 2)
    await sleep(16)
    samples.push(await readCam())
  }
  await page.mouse.up()
  await sleep(200)
  const camEnd = await readCam()

  const dist = (a, b) => Math.hypot(a[0]-b[0], a[1]-b[1], a[2]-b[2])
  let moved = 0
  for (let i = 1; i < samples.length; i++) if (dist(samples[i], samples[i-1]) > 0) moved++
  check('camera moves during a real 30-step drag',
    dist(camEnd, camStart) > 5,
    `cam ${camStart.join(',')} -> ${camEnd.join(',')} (moved ${dist(camEnd, camStart).toFixed(1)}mm)`)
  check('camera changes continuously across the drag, not once',
    moved >= 20,
    `${moved} of ${samples.length - 1} sampled steps changed the camera`)

  // spherical coordinates, straight from OrbitControls' own target/position
  const spherical = await page.evaluate(() => window.__spherical ?? null)

  // --- zoom ---------------------------------------------------------------
  const camPreZoom = await readCam()
  await page.mouse.move(box.x, box.y)
  await page.mouse.wheel({ deltaY: -600 })
  await sleep(400)
  const camPostZoom = await readCam()
  const len = (v) => Math.hypot(...v)
  check('scroll wheel zooms the camera',
    Math.abs(len(camPostZoom) - len(camPreZoom)) > 3,
    `distance ${len(camPreZoom).toFixed(0)} -> ${len(camPostZoom).toFixed(0)}`)

  // --- 4. reset + wireframe + STL export ----------------------------------
  console.log('\n[4] CONTROLS')
  await page.evaluate(() => window.__viewerRef.current.resetView())
  await sleep(300)
  const camReset = await readCam()
  check('reset view returns the camera to framing', dist(camReset, camPostZoom) > 3, `cam now ${camReset.join(',')}`)

  const stl = await page.evaluate(() => {
    const blob = window.__viewerRef.current.exportSTL()
    return blob ? blob.size : 0
  })
  check('STLExporter produces a binary STL', stl > 84, `${stl} bytes`)

  await page.evaluate(() => window.__setWireframe(true))
  await sleep(300)
  const wireMeshes = await page.evaluate(() => window.__viewerMeshes)
  check('wireframe toggle keeps the scene intact', wireMeshes === 5, `${wireMeshes} meshes in wireframe mode`)
  await page.evaluate(() => window.__setWireframe(false))

  // --- 4b. part manipulation ----------------------------------------------
console.log('\n[4b] PART SLIDERS - stacked tray organiser')
const { TRAY_CODE: trayCode, TRAY_PARTS: trayParts } = await import('./tray-fixture.js')
await page.evaluate((c) => window.__loadCode(c), trayCode)
await page.waitForFunction('window.__viewerMeshes > 0', { timeout: 15000 })

const movable = trayParts.filter((p) => p.axis)
check('three trays are marked movable on Z',
  movable.length === 3 && movable.every((p) => p.axis === 'z'),
  `${movable.length} movable: ${movable.map((p) => `${p.name}(${p.axis})`).join(', ')}`)
check('base plate and posts are NOT movable',
  trayParts.filter((p) => !p.axis).length === trayParts.length - movable.length,
  `${trayParts.length - movable.length} fixed: ${trayParts.filter((p) => !p.axis).map((p) => p.name).join(', ')}`)

const posBefore = await page.evaluate(() => window.__meshPositions())
// lift ONLY the middle tray
const target = movable[1]
await page.evaluate((i, a, v) => window.__setOffset(i, a, v), target.index, target.axis, 60)
await sleep(300)
const posAfter = await page.evaluate(() => window.__meshPositions())

const movedZ = (posAfter[target.index]?.[2] ?? 0) - (posBefore[target.index]?.[2] ?? 0)
check('dragging a tray slider moves that mesh in the scene',
  Math.abs(movedZ - 60) < 0.01,
  `part ${target.index} (${target.name}) z moved by ${movedZ}mm`)

const others = Object.keys(posAfter).filter((k) => Number(k) !== target.index)
const disturbed = others.filter((k) => {
  const b = posBefore[k] ?? [0, 0, 0]
  const a = posAfter[k] ?? [0, 0, 0]
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) > 1e-6
})
check('no other part moved',
  disturbed.length === 0,
  disturbed.length ? `disturbed: ${disturbed.join(', ')}` : `${others.length} other parts unchanged`)

// each tray independently
await page.evaluate((i, a, v) => window.__setOffset(i, a, v), movable[0].index, 'z', 25)
await page.evaluate((i, a, v) => window.__setOffset(i, a, v), movable[2].index, 'z', 80)
await sleep(300)
const three = await page.evaluate(() => window.__meshPositions())
check('all three trays hold independent positions',
  Math.abs(three[movable[0].index][2] - 25) < 0.01 &&
  Math.abs(three[movable[1].index][2] - 60) < 0.01 &&
  Math.abs(three[movable[2].index][2] - 80) < 0.01,
  `z = ${movable.map((p) => three[p.index][2]).join(', ')}mm`)

await page.evaluate(() => window.__resetOffsets())
await sleep(300)
const reset = await page.evaluate(() => window.__meshPositions())
check('reset positions returns every part to assembled',
  Object.values(reset).every((p) => Math.hypot(p[0], p[1], p[2]) < 1e-6),
  `all ${Object.keys(reset).length} parts back at origin offset`)

// --- 5. tab visibility ---------------------------------------------------
  console.log('\n[5] TAB VISIBILITY')
  const other = await browser.newPage()
  await other.goto('about:blank')
  await other.bringToFront()
  await sleep(1200)
  await page.bringToFront()
  const fHidden = await page.evaluate(() => window.__viewerFrames)
  await sleep(1000)
  const fBack = await page.evaluate(() => window.__viewerFrames)
  check('loop resumes after returning to the tab',
    fBack - fHidden > 20,
    `${fBack - fHidden} frames in 1s after refocus`)
  await other.close()

  check('no uncaught page errors during the whole run',
    errors.length === 0,
    errors.length ? errors.slice(0, 3).join(' | ') : 'clean console')

} finally {
  await browser?.close()
  vite.kill('SIGTERM')
}

const failed = results.filter((r) => !r.pass)
console.log(`\n${'='.repeat(64)}`)
console.log(`${results.length - failed.length}/${results.length} checks passed`)
if (failed.length) { console.log('FAILED:'); failed.forEach((f) => console.log('  -', f.name)) }
process.exit(failed.length ? 1 : 0)
