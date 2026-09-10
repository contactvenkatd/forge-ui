import * as THREE from 'three'
import * as modelingNamespace from '@jscad/modeling'

const unwrap = (namespace, probe) => (namespace?.[probe] ? namespace : namespace?.default ?? namespace)
const modeling = unwrap(modelingNamespace, 'primitives')

// Newell's method: correct for any planar polygon, unlike a single cross product.
function polygonNormal(vertices) {
  const n = [0, 0, 0]
  for (let i = 0; i < vertices.length; i += 1) {
    const c = vertices[i]
    const d = vertices[(i + 1) % vertices.length]
    n[0] += (c[1] - d[1]) * (c[2] + d[2])
    n[1] += (c[2] - d[2]) * (c[0] + d[0])
    n[2] += (c[0] - d[0]) * (c[1] + d[1])
  }
  const length = Math.hypot(n[0], n[1], n[2]) || 1
  return [n[0] / length, n[1] / length, n[2] / length]
}

const QUANT = 1e4
const vertexKey = (p, n) =>
  `${Math.round(p[0] * QUANT)},${Math.round(p[1] * QUANT)},${Math.round(p[2] * QUANT)}|` +
  `${Math.round(n[0] * 100)},${Math.round(n[1] * 100)},${Math.round(n[2] * 100)}`

/**
 * Converts one JSCAD geom3 into an indexed THREE.BufferGeometry.
 * Vertices are shared only when position AND normal match, which keeps machined
 * faces flat-shaded while still de-duplicating within each planar face.
 */
export function geometryFromSolid(solid) {
  const { geom3 } = modeling.geometries
  if (!geom3.isA(solid)) return null

  const positions = []
  const normals = []
  const indices = []
  const lookup = new Map()

  const pushVertex = (p, n) => {
    const key = vertexKey(p, n)
    const existing = lookup.get(key)
    if (existing !== undefined) return existing
    const index = positions.length / 3
    positions.push(p[0], p[1], p[2])
    normals.push(n[0], n[1], n[2])
    lookup.set(key, index)
    return index
  }

  for (const polygon of geom3.toPolygons(solid)) {
    const vertices = polygon.vertices
    if (!vertices || vertices.length < 3) continue
    const normal = polygonNormal(vertices)
    // Fan-triangulate: JSCAD polygons are planar and convex.
    const first = pushVertex(vertices[0], normal)
    for (let i = 1; i < vertices.length - 1; i += 1) {
      indices.push(first, pushVertex(vertices[i], normal), pushVertex(vertices[i + 1], normal))
    }
  }

  if (indices.length === 0) return null

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3))
  geometry.setIndex(indices)
  geometry.computeBoundingSphere()
  geometry.computeBoundingBox()
  return geometry
}

/**
 * Converts solids, keeping each result's ORIGINAL index. Alignment matters: the
 * part metadata that drives the sliders refers to solids by position, and a
 * solid that fails to convert must not shift everything after it.
 */
export function geometriesFromSolids(solids = []) {
  return solids
    .map((solid, index) => ({ index, geometry: geometryFromSolid(solid) }))
    .filter((entry) => entry.geometry)
}

/** Combined bounding box of every converted geometry, in millimetres. */
export function boundsOfGeometries(entries) {
  const box = new THREE.Box3()
  let any = false
  for (const { geometry } of entries) {
    if (!geometry.boundingBox) geometry.computeBoundingBox()
    box.union(geometry.boundingBox)
    any = true
  }
  if (!any) return null
  const size = new THREE.Vector3()
  const center = new THREE.Vector3()
  box.getSize(size)
  box.getCenter(center)
  return { box, size, center, radius: Math.max(size.length() / 2, 1) }
}
