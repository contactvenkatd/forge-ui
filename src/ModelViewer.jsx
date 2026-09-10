import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { STLExporter } from 'three/examples/jsm/exporters/STLExporter.js'
import { geometriesFromSolids, boundsOfGeometries } from './jscadToThree'
import { materialLabel, resolveMaterialColor } from './materialColors'
import { formatDimensions } from './jscadRuntime'

const THEME = {
  dark: { background: 0x080a0b, grid: 0x2a2f33, subGrid: 0x181c1f, edge: 0x0a0d0f },
  light: { background: 0xf4f4f2, grid: 0xc8c8c4, subGrid: 0xe2e2de, edge: 0x1a1d20 },
}

const toThreeColor = (rgba) => new THREE.Color(rgba[0], rgba[1], rgba[2])

// Rougher for machined stock, glossier for plastics and finished metals.
const ROUGHNESS = {
  aluminum: 0.42, aluminium: 0.42, stainless: 0.3, titanium: 0.45, steel: 0.38,
  brass: 0.32, bronze: 0.4, copper: 0.34, iron: 0.6,
  wood: 0.85, plywood: 0.88, oak: 0.85,
  plastic: 0.55, abs: 0.55, pla: 0.55, nylon: 0.7,
  'carbon fiber': 0.5, rubber: 0.95, glass: 0.1,
}

const ModelViewer = forwardRef(function ModelViewer(
  { solids, theme = 'dark', materials = [], defaultMaterial = '', units = 'metric', wireframe = false, offsets = null },
  ref,
) {
  const canvasRef = useRef(null)
  const hudRef = useRef(null)
  const engineRef = useRef(null)
  const [error, setError] = useState('')

  const material = useMemo(() => materialLabel(materials, defaultMaterial), [materials, defaultMaterial])
  const [dimensions, setDimensions] = useState('')

  // ---------------------------------------------------------------------------
  // Engine: renderer -> scene -> camera -> animate(). Created once on mount and
  // started immediately, with no geometry - the loop must be running before any
  // model exists, so a geometry problem can never look like a dead loop.
  // ---------------------------------------------------------------------------
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    let renderer
    try {
      renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false })
    } catch (cause) {
      setError(`Could not start WebGL: ${cause.message}`)
      return
    }

    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
    renderer.shadowMap.enabled = false

    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100000)
    camera.up.set(0, 0, 1) // Z-up, matching CAD convention
    camera.position.set(200, -200, 160)

    const controls = new OrbitControls(camera, canvas)
    controls.enableDamping = true
    controls.dampingFactor = 0.12
    controls.rotateSpeed = 0.9
    controls.zoomSpeed = 0.9
    controls.screenSpacePanning = true

    // Lighting: ambient fill plus a key directional, so faces read distinctly.
    const ambient = new THREE.AmbientLight(0xffffff, 1.15)
    const key = new THREE.DirectionalLight(0xfff6ec, 2.4)
    key.position.set(1, -1.4, 2.2)
    const rim = new THREE.DirectionalLight(0x88aaff, 0.5)
    rim.position.set(-1.4, 1, -0.6)
    scene.add(ambient, key, rim)

    const modelGroup = new THREE.Group()
    const edgeGroup = new THREE.Group()
    scene.add(modelGroup, edgeGroup)

    const grid = new THREE.GridHelper(1000, 40)
    grid.rotation.x = Math.PI / 2 // GridHelper is XZ by default; we are Z-up
    scene.add(grid)

    const engine = {
      renderer, scene, camera, controls, modelGroup, edgeGroup, grid,
      frames: 0, disposed: false, rafId: 0, hasModel: false,
    }
    engineRef.current = engine

    const resize = () => {
      const parent = canvas.parentElement
      const width = Math.max(parent?.clientWidth || 1, 1)
      const height = Math.max(parent?.clientHeight || 1, 1)
      renderer.setSize(width, height, false)
      camera.aspect = width / height
      camera.updateProjectionMatrix()
    }
    resize()

    // The whole loop. rAF first, then controls, then render - every frame,
    // unconditionally. There is no branch that can skip a render.
    const animate = () => {
      engine.rafId = requestAnimationFrame(animate)
      controls.update()
      renderer.render(scene, camera)
      engine.frames += 1
      if (hudRef.current) {
        const p = camera.position
        hudRef.current.textContent =
          `F ${engine.frames} · meshes ${modelGroup.children.length} · ` +
          `cam ${Math.round(p.x)},${Math.round(p.y)},${Math.round(p.z)}`
      }
      // Exposed for the automated browser test.
      window.__viewerFrames = engine.frames
      window.__viewerMeshes = modelGroup.children.length
      window.__modelGroup = modelGroup

      // Dev-only: sample the live back buffer immediately after the draw. Reading
      // the canvas from outside the loop is unreliable because Three.js does not
      // set preserveDrawingBuffer, so the buffer is already cleared by then.
      if (import.meta.env.DEV && window.__wantPixelSample) {
        window.__wantPixelSample = false
        const gl = renderer.getContext()
        const w = renderer.domElement.width
        const h = renderer.domElement.height
        const buf = new Uint8Array(w * h * 4)
        gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, buf)
        const seen = new Set()
        let lit = 0
        for (let i = 0; i < buf.length; i += 4) {
          seen.add(`${buf[i] >> 3},${buf[i + 1] >> 3},${buf[i + 2] >> 3}`)
          if (buf[i] > 60 || buf[i + 1] > 60 || buf[i + 2] > 60) lit += 1
        }
        window.__pixelSample = { distinct: seen.size, lit, total: buf.length / 4 }
      }
    }
    animate()

    const observer = new ResizeObserver(resize)
    if (canvas.parentElement) observer.observe(canvas.parentElement)
    window.addEventListener('resize', resize)

    // Standard Three.js pattern: rAF pauses in a background tab and resumes on
    // return. Restarting is safe because cancel-then-schedule is idempotent.
    const onVisibility = () => {
      if (document.hidden || engine.disposed) return
      resize()
      cancelAnimationFrame(engine.rafId)
      animate()
    }
    document.addEventListener('visibilitychange', onVisibility)

    const onContextLost = (event) => {
      event.preventDefault()
      console.warn('[viewer] webglcontextlost')
      cancelAnimationFrame(engine.rafId)
    }
    const onContextRestored = () => {
      console.warn('[viewer] webglcontextrestored')
      cancelAnimationFrame(engine.rafId)
      animate()
    }
    canvas.addEventListener('webglcontextlost', onContextLost)
    canvas.addEventListener('webglcontextrestored', onContextRestored)

    return () => {
      engine.disposed = true
      cancelAnimationFrame(engine.rafId)
      observer.disconnect()
      window.removeEventListener('resize', resize)
      document.removeEventListener('visibilitychange', onVisibility)
      canvas.removeEventListener('webglcontextlost', onContextLost)
      canvas.removeEventListener('webglcontextrestored', onContextRestored)
      controls.dispose()
      modelGroup.traverse((o) => { o.geometry?.dispose?.(); o.material?.dispose?.() })
      edgeGroup.traverse((o) => { o.geometry?.dispose?.(); o.material?.dispose?.() })
      renderer.dispose()
      engineRef.current = null
    }
  }, [])

  // --- geometry ---------------------------------------------------------------
  useEffect(() => {
    const engine = engineRef.current
    if (!engine) return

    const { modelGroup, edgeGroup } = engine
    const clear = (group) => {
      for (let i = group.children.length - 1; i >= 0; i -= 1) {
        const child = group.children[i]
        child.geometry?.dispose?.()
        child.material?.dispose?.()
        group.remove(child)
      }
    }
    clear(modelGroup)
    clear(edgeGroup)
    engine.hasModel = false
    setDimensions('')

    if (!solids?.length) return

    let geometries
    try {
      geometries = geometriesFromSolids(solids)
    } catch (cause) {
      setError(`Could not convert the model: ${cause.message}`)
      return
    }
    if (!geometries.length) return

    const palette = THEME[theme === 'light' ? 'light' : 'dark']
    const colour = toThreeColor(resolveMaterialColor(materials, defaultMaterial))
    const roughness = ROUGHNESS[materialLabel(materials, defaultMaterial)] ?? 0.45

    for (const { index, geometry } of geometries) {
      const mesh = new THREE.Mesh(
        geometry,
        new THREE.MeshStandardMaterial({
          color: colour,
          roughness,
          metalness: roughness < 0.5 ? 0.75 : 0.15,
          side: THREE.DoubleSide,
          flatShading: false, // normals are already per-face from the converter
          wireframe,
        }),
      )
      // Tagged with the source solid index so the part sliders can find it.
      mesh.userData.partIndex = index
      modelGroup.add(mesh)

      const outline = new THREE.LineSegments(
        new THREE.EdgesGeometry(geometry, 35),
        new THREE.LineBasicMaterial({ color: palette.edge, transparent: true, opacity: 0.55 }),
      )
      outline.userData.partIndex = index
      edgeGroup.add(outline)
    }

    edgeGroup.visible = !wireframe
    engine.hasModel = true

    const bounds = boundsOfGeometries(geometries)
    if (bounds) {
      engine.bounds = bounds
      setDimensions(formatDimensions([bounds.size.x, bounds.size.y, bounds.size.z], units))
      frameCamera(engine)
      const gridSize = Math.max(bounds.radius * 6, 100)
      engine.grid.scale.setScalar(gridSize / 1000)
    }
    setError('')
  }, [solids, theme, materials, defaultMaterial, units, wireframe])

  // Live part positions. Each entry is { axis, value }; a mesh with no entry
  // stays exactly where the generated code placed it.
  useEffect(() => {
    const engine = engineRef.current
    if (!engine) return
    const AXIS_VECTORS = { x: [1, 0, 0], y: [0, 1, 0], z: [0, 0, 1] }
    const pivotVec = new THREE.Vector3()
    const axisVec = new THREE.Vector3()
    const quat = new THREE.Quaternion()
    const rotated = new THREE.Vector3()

    const apply = (object) => {
      const index = object.userData?.partIndex
      const move = index === undefined ? null : offsets?.[index]
      object.position.set(0, 0, 0)
      object.quaternion.identity()
      if (!move || !Number.isFinite(move.value)) return

      // Axis may be an arbitrary direction: replicating a sub-assembly rotates
      // its hinge axis off the cardinal directions.
      const raw = move.axisVector ?? AXIS_VECTORS[move.axis]
      if (!raw) return
      axisVec.fromArray(raw)
      if (axisVec.lengthSq() < 1e-12) return
      axisVec.normalize()

      if (move.motion === 'rotate') {
        quat.setFromAxisAngle(axisVec, THREE.MathUtils.degToRad(move.value))
        object.quaternion.copy(quat)
        // Geometry is in world coordinates, so turn it about the real pivot:
        // position = pivot - R * pivot.
        pivotVec.fromArray(move.pivot ?? [0, 0, 0])
        rotated.copy(pivotVec).applyQuaternion(quat)
        object.position.copy(pivotVec).sub(rotated)
      } else {
        object.position.copy(axisVec).multiplyScalar(move.value)
      }
    }
    engine.modelGroup.children.forEach(apply)
    engine.edgeGroup.children.forEach(apply)
  }, [offsets, solids])

  // theme + wireframe without rebuilding geometry
  useEffect(() => {
    const engine = engineRef.current
    if (!engine) return
    const palette = THEME[theme === 'light' ? 'light' : 'dark']
    engine.scene.background = new THREE.Color(palette.background)
    engine.grid.material.opacity = 0.16
    engine.grid.material.transparent = true
    engine.grid.material.color = new THREE.Color(palette.grid)
    engine.modelGroup.children.forEach((mesh) => { mesh.material.wireframe = wireframe })
    engine.edgeGroup.visible = !wireframe
  }, [theme, wireframe])

  useImperativeHandle(ref, () => ({
    resetView: () => { const e = engineRef.current; if (e) frameCamera(e) },
    exportSTL: () => {
      const engine = engineRef.current
      if (!engine || engine.modelGroup.children.length === 0) return null
      const data = new STLExporter().parse(engine.modelGroup, { binary: true })
      return new Blob([data], { type: 'model/stl' })
    },
  }), [])

  return (
    <div className="relative h-full w-full">
      <canvas ref={canvasRef} className="block h-full w-full cursor-grab active:cursor-grabbing" />

      {error ? (
        <p className="absolute inset-x-6 top-1/2 -translate-y-1/2 text-center text-sm leading-6 text-red-300/90">{error}</p>
      ) : (
        <>
          {dimensions && (
            <div className="pointer-events-none absolute bottom-4 left-14 border border-white/[0.08] bg-black/25 px-3 py-2 backdrop-blur-[2px]">
              <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-zinc-400">{dimensions}</p>
              <p className="mt-1 font-mono text-[9px] uppercase tracking-[0.16em] text-zinc-600">
                {wireframe ? 'Wireframe' : material}
              </p>
            </div>
          )}
          <p
            ref={hudRef}
            className="pointer-events-none absolute left-1/2 top-3 -translate-x-1/2 font-mono text-[10px] uppercase tracking-[0.14em] text-zinc-600"
          >
            F 0
          </p>
          <p className="pointer-events-none absolute bottom-4 left-1/2 -translate-x-1/2 font-mono text-[10px] uppercase tracking-[0.16em] text-zinc-600">
            Drag to orbit · scroll to zoom
          </p>
        </>
      )}
    </div>
  )
})

/** Frames the model: target its centre, back off to fit the bounding sphere. */
function frameCamera(engine) {
  const bounds = engine.bounds
  if (!bounds) return
  const { center, radius } = bounds
  const fov = (engine.camera.fov * Math.PI) / 180
  const distance = (radius / Math.sin(fov / 2)) * 1.25

  engine.controls.target.copy(center)
  engine.camera.position.set(
    center.x + distance * 0.6,
    center.y - distance * 0.62,
    center.z + distance * 0.5,
  )
  engine.camera.near = Math.max(distance / 1000, 0.1)
  engine.camera.far = distance * 100
  engine.camera.updateProjectionMatrix()
  engine.controls.update()
}

export default ModelViewer
