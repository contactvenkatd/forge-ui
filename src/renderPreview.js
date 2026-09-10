import * as THREE from 'three'
import { geometriesFromSolids, boundsOfGeometries } from './jscadToThree'

// Distinct hues so the critique can refer to a specific part by colour.
export const PART_COLORS = [
  ['crimson red', 0xd94f4f], ['orange', 0xe08a3c], ['yellow', 0xd9c23c], ['lime green', 0x7fbf4f],
  ['green', 0x4faf6a], ['teal', 0x3fb3a8], ['sky blue', 0x4f9fd9], ['indigo', 0x5f6fd0],
  ['purple', 0x9a5fd0], ['magenta', 0xd05fa8], ['brown', 0x9a6b4f], ['slate grey', 0x8a94a0],
]

const VIEWS = [
  { name: 'isometric', dir: [1, -1, 0.75], up: [0, 0, 1] },
  { name: 'top-down', dir: [0, 0, 1], up: [0, 1, 0] },
  { name: 'front elevation', dir: [0, -1, 0], up: [0, 0, 1] },
]

/**
 * Renders the model offscreen from several angles and returns PNG data URLs.
 * Each part gets its own colour, and the legend is returned alongside so the
 * critique message can name parts the model can actually see.
 * Browser-only: needs a real WebGL context.
 */
export function renderPreviews(solids, { width = 640, height = 480, views = VIEWS } = {}) {
  const entries = geometriesFromSolids(solids)
  if (entries.length === 0) return { images: [], legend: [] }

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true })
  renderer.setPixelRatio(1)
  renderer.setSize(width, height, false)

  const scene = new THREE.Scene()
  scene.background = new THREE.Color(0xf2f2f0)
  scene.add(new THREE.AmbientLight(0xffffff, 1.1))
  const key = new THREE.DirectionalLight(0xffffff, 2.2)
  key.position.set(1, -1.4, 2.2)
  const fill = new THREE.DirectionalLight(0xffffff, 0.7)
  fill.position.set(-1.4, 1, -0.4)
  scene.add(key, fill)

  const legend = []
  for (const { index, geometry } of entries) {
    const [label, hex] = PART_COLORS[index % PART_COLORS.length]
    legend.push({ index, label })
    scene.add(new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({
      color: hex, roughness: 0.55, metalness: 0.1, side: THREE.DoubleSide,
    })))
    scene.add(new THREE.LineSegments(
      new THREE.EdgesGeometry(geometry, 35),
      new THREE.LineBasicMaterial({ color: 0x222222, transparent: true, opacity: 0.5 }),
    ))
  }

  const bounds = boundsOfGeometries(entries)
  const { center, radius } = bounds ?? { center: new THREE.Vector3(), radius: 50 }

  // Ground grid at the model's underside, so "floating" is visible, not inferred.
  const grid = new THREE.GridHelper(radius * 8, 32, 0xaaaaaa, 0xcccccc)
  grid.rotation.x = Math.PI / 2
  grid.position.set(center.x, center.y, bounds ? bounds.box.min.z : 0)
  scene.add(grid)

  const camera = new THREE.PerspectiveCamera(40, width / height, 0.1, 100000)
  const distance = (radius / Math.sin((camera.fov * Math.PI) / 360)) * 1.3

  const images = []
  for (const view of views) {
    const dir = new THREE.Vector3(...view.dir).normalize()
    camera.up.set(...view.up)
    camera.position.copy(center).addScaledVector(dir, distance)
    camera.lookAt(center)
    camera.updateProjectionMatrix()
    renderer.render(scene, camera)
    images.push({ name: view.name, dataUrl: canvas.toDataURL('image/png') })
  }

  scene.traverse((o) => { o.geometry?.dispose?.(); o.material?.dispose?.() })
  renderer.dispose()
  return { images, legend }
}
