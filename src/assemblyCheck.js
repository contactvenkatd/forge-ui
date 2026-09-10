import * as modelingNamespace from '@jscad/modeling'

const unwrap = (namespace, probe) => (namespace?.[probe] ? namespace : namespace?.default ?? namespace)
const modeling = unwrap(modelingNamespace, 'primitives')

// Ceiling on the precise pass, so a sphere-heavy model cannot stall the app.
const OP_BUDGET_PER_PAIR = 400_000
const OP_BUDGET_TOTAL = 6_000_000

/** Separation between two axis-aligned boxes; 0 when they touch or overlap. */
function boxGap(a, b) {
  let sum = 0
  for (let axis = 0; axis < 3; axis += 1) {
    const gap = Math.max(a[0][axis] - b[1][axis], b[0][axis] - a[1][axis], 0)
    sum += gap * gap
  }
  return Math.sqrt(sum)
}

/** Fan-triangulates a solid's polygons, keeping each triangle's own AABB. */
function trianglesOf(solid) {
  const { geom3 } = modeling.geometries
  const triangles = []
  for (const polygon of geom3.toPolygons(solid)) {
    const v = polygon.vertices
    if (!v || v.length < 3) continue
    for (let i = 1; i < v.length - 1; i += 1) {
      const tri = [v[0], v[i], v[i + 1]]
      const lo = [Infinity, Infinity, Infinity]
      const hi = [-Infinity, -Infinity, -Infinity]
      for (const p of tri) {
        for (let a = 0; a < 3; a += 1) {
          if (p[a] < lo[a]) lo[a] = p[a]
          if (p[a] > hi[a]) hi[a] = p[a]
        }
      }
      triangles.push({ tri, lo, hi })
    }
  }
  return triangles
}

function verticesOf(solid) {
  const { geom3 } = modeling.geometries
  const seen = new Set()
  const points = []
  for (const polygon of geom3.toPolygons(solid)) {
    for (const p of polygon.vertices ?? []) {
      const key = `${p[0].toFixed(3)},${p[1].toFixed(3)},${p[2].toFixed(3)}`
      if (seen.has(key)) continue
      seen.add(key)
      points.push(p)
    }
  }
  return points
}

/** Squared distance from a point to a triangle (Ericson, Real-Time Collision Detection). */
function pointTriangleDistSq(p, a, b, c) {
  const abx = b[0] - a[0], aby = b[1] - a[1], abz = b[2] - a[2]
  const acx = c[0] - a[0], acy = c[1] - a[1], acz = c[2] - a[2]
  const apx = p[0] - a[0], apy = p[1] - a[1], apz = p[2] - a[2]
  const d1 = abx * apx + aby * apy + abz * apz
  const d2 = acx * apx + acy * apy + acz * apz
  if (d1 <= 0 && d2 <= 0) return apx * apx + apy * apy + apz * apz

  const bpx = p[0] - b[0], bpy = p[1] - b[1], bpz = p[2] - b[2]
  const d3 = abx * bpx + aby * bpy + abz * bpz
  const d4 = acx * bpx + acy * bpy + acz * bpz
  if (d3 >= 0 && d4 <= d3) return bpx * bpx + bpy * bpy + bpz * bpz

  const vc = d1 * d4 - d3 * d2
  if (vc <= 0 && d1 >= 0 && d3 <= 0) {
    const v = d1 / (d1 - d3)
    const x = apx - v * abx, y = apy - v * aby, z = apz - v * abz
    return x * x + y * y + z * z
  }

  const cpx = p[0] - c[0], cpy = p[1] - c[1], cpz = p[2] - c[2]
  const d5 = abx * cpx + aby * cpy + abz * cpz
  const d6 = acx * cpx + acy * cpy + acz * cpz
  if (d6 >= 0 && d5 <= d6) return cpx * cpx + cpy * cpy + cpz * cpz

  const vb = d5 * d2 - d1 * d6
  if (vb <= 0 && d2 >= 0 && d6 <= 0) {
    const w = d2 / (d2 - d6)
    const x = apx - w * acx, y = apy - w * acy, z = apz - w * acz
    return x * x + y * y + z * z
  }

  const va = d3 * d6 - d5 * d4
  if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) {
    const w = (d4 - d3) / ((d4 - d3) + (d5 - d6))
    const x = p[0] - (b[0] + w * (c[0] - b[0]))
    const y = p[1] - (b[1] + w * (c[1] - b[1]))
    const z = p[2] - (b[2] + w * (c[2] - b[2]))
    return x * x + y * y + z * z
  }

  const denom = 1 / (va + vb + vc)
  const v = vb * denom, w = vc * denom
  const x = apx - (v * abx + w * acx)
  const y = apy - (v * aby + w * acy)
  const z = apz - (v * abz + w * acz)
  return x * x + y * y + z * z
}

/** True when any vertex of `points` lies within `tol` of any triangle. */
function pointsNearSurface(points, triangles, tol, budget) {
  const tolSq = tol * tol
  for (const p of points) {
    for (const t of triangles) {
      // per-triangle AABB reject before the expensive test
      if (
        p[0] < t.lo[0] - tol || p[0] > t.hi[0] + tol ||
        p[1] < t.lo[1] - tol || p[1] > t.hi[1] + tol ||
        p[2] < t.lo[2] - tol || p[2] > t.hi[2] + tol
      ) continue
      budget.ops += 1
      budget.pairOps += 1
      if (budget.pairOps > OP_BUDGET_PER_PAIR || budget.ops > OP_BUDGET_TOTAL) {
        budget.exhausted = true
        return false
      }
      if (pointTriangleDistSq(p, t.tri[0], t.tri[1], t.tri[2]) <= tolSq) return true
    }
  }
  return false
}

/**
 * True when two solids share volume. Catches interpenetration - a pin inside a
 * knuckle bore, or a boss pressed into a plate - which the surface test cannot
 * see, because neither part has vertices near the other's surface.
 */
function solidsOverlap(a, b) {
  try {
    const intersection = modeling.booleans.intersect(a, b)
    return modeling.measurements.measureVolume(intersection) > 1e-6
  } catch {
    // Degenerate boolean: fall through to the surface test rather than guess.
    return false
  }
}

/**
 * Reports whether a set of solids forms one connected assembly.
 *
 * Two parts count as touching when they share volume OR their surfaces come
 * within tolerance. Overlapping bounding boxes are NOT enough - a bar can hover
 * inside the bounding box of a U-shaped bracket without ever contacting it.
 */
export function analyzeAssembly(solids = []) {
  const { geom3 } = modeling.geometries
  const parts = solids.filter((s) => geom3.isA(s))
  if (parts.length === 0) return { parts: 0, connected: true, components: 0, floating: [], tolerance: 0 }
  if (parts.length === 1) return { parts: 1, connected: true, components: 1, floating: [], tolerance: 0 }

  const boxes = parts.map((s) => modeling.measurements.measureBoundingBox(s))
  const overall = boxes.reduce(
    (acc, [lo, hi]) => [
      [Math.min(acc[0][0], lo[0]), Math.min(acc[0][1], lo[1]), Math.min(acc[0][2], lo[2])],
      [Math.max(acc[1][0], hi[0]), Math.max(acc[1][1], hi[1]), Math.max(acc[1][2], hi[2])],
    ],
    [[Infinity, Infinity, Infinity], [-Infinity, -Infinity, -Infinity]],
  )
  const diagonal = Math.hypot(
    overall[1][0] - overall[0][0], overall[1][1] - overall[0][1], overall[1][2] - overall[0][2],
  )
  const tolerance = Math.max(0.5, diagonal * 0.004)

  const triangles = parts.map(trianglesOf)
  const vertices = parts.map(verticesOf)
  const budget = { ops: 0, pairOps: 0, exhausted: false }

  const parent = parts.map((_, i) => i)
  const find = (i) => (parent[i] === i ? i : (parent[i] = find(parent[i])))
  const join = (i, j) => { const a = find(i), b = find(j); if (a !== b) parent[a] = b }

  const gaps = new Map()
  const contactPairs = []
  let contacts = 0
  let approximatePairs = 0
  for (let i = 0; i < parts.length; i += 1) {
    for (let j = i + 1; j < parts.length; j += 1) {
      const boxDistance = boxGap(boxes[i], boxes[j])
      gaps.set(`${i}-${j}`, boxDistance)
      // Each pair gets its own allowance, so one dense pair cannot leave every
      // later pair falling back to the loose bounding-box answer.
      budget.pairOps = 0
      budget.exhausted = false
      // Cheap reject: boxes too far apart means the surfaces cannot be close.
      if (boxDistance > tolerance) continue
      // Shared volume first (decisive, and handles fully embedded parts), then
      // surface proximity for parts that meet face-to-face without overlapping.
      const touching =
        solidsOverlap(parts[i], parts[j]) ||
        pointsNearSurface(vertices[i], triangles[j], tolerance, budget) ||
        pointsNearSurface(vertices[j], triangles[i], tolerance, budget)
      if (touching || budget.exhausted) { join(i, j); contacts += 1; contactPairs.push([i, j]) }
      if (budget.exhausted) approximatePairs += 1
    }
  }

  const groups = new Map()
  parts.forEach((_, i) => {
    const root = find(i)
    if (!groups.has(root)) groups.set(root, [])
    groups.get(root).push(i)
  })
  const components = [...groups.values()].sort((a, b) => b.length - a.length)
  const main = components[0] ?? []
  const floating = components.slice(1).flat()

  const distances = floating.map((index) => ({
    part: index,
    distance: Math.min(...main.map((j) => gaps.get(index < j ? `${index}-${j}` : `${j}-${index}`) ?? Infinity)),
  }))

  return {
    parts: parts.length,
    connected: components.length === 1,
    components: components.length,
    floating,
    distances,
    contacts,
    tolerance,
    boxes,
    contactPairs,
    // number of pairs whose precise test was cut short and fell back to boxes
    approximatePairs,
    approximate: approximatePairs > 0,
  }
}

/** One-line human summary, or '' when the assembly is sound. */
export function assemblyWarning(report) {
  if (!report || report.connected || report.parts < 2) return ''
  const worst = [...(report.distances ?? [])].sort((a, b) => b.distance - a.distance)[0]
  const list = report.floating.map((i) => `#${i + 1}`).join(', ')
  return (
    `${report.floating.length} of ${report.parts} parts are not connected to the assembly ` +
    `(${list}${worst && Number.isFinite(worst.distance) ? `, up to ${Math.round(worst.distance)}mm away` : ''}).`
  )
}

const fmtBox = (box) =>
  `x[${box[0][0].toFixed(1)}, ${box[1][0].toFixed(1)}] ` +
  `y[${box[0][1].toFixed(1)}, ${box[1][1].toFixed(1)}] ` +
  `z[${box[0][2].toFixed(1)}, ${box[1][2].toFixed(1)}]`

/**
 * Builds the correction message sent back to the model.
 * Deliberately quantitative: exact gaps and exact bounding boxes measured from
 * the geometry its own code produced, so it can compute the right coordinate
 * rather than guess at what "disconnected" means.
 */
export function describeDisconnection(report, parts = []) {
  if (!report || report.connected || !report.boxes) return ''
  const nameOf = (index) => parts.find((p) => p.index === index)?.name ?? `Part ${index + 1}`
  const boxes = report.boxes

  const connected = []
  for (let i = 0; i < boxes.length; i += 1) if (!report.floating.includes(i)) connected.push(i)

  const lines = [
    'The model you produced does not assemble. Measured from the geometry your own code generated:',
    '',
  ]

  for (const { part, distance } of report.distances ?? []) {
    // nearest connected part, so the fix has a concrete target
    let nearest = connected[0]
    let best = Infinity
    for (const j of connected) {
      const gap = boxGap(boxes[part], boxes[j])
      if (gap < best) { best = gap; nearest = j }
    }
    lines.push(`- "${nameOf(part)}" (index ${part}) floats free, ${distance.toFixed(1)}mm from the assembly.`)
    lines.push(`    its bounding box:      ${fmtBox(boxes[part])}`)
    if (nearest !== undefined) {
      lines.push(`    nearest part "${nameOf(nearest)}" (index ${nearest}): ${fmtBox(boxes[nearest])}`)
      lines.push(`    gap between them:      ${best.toFixed(1)}mm`)
    }
    lines.push('')
  }

  if (connected.length) {
    const spanLo = [0, 1, 2].map((a) => Math.min(...connected.map((i) => boxes[i][0][a])))
    const spanHi = [0, 1, 2].map((a) => Math.max(...connected.map((i) => boxes[i][1][a])))
    lines.push(`The connected body occupies x[${spanLo[0].toFixed(1)}, ${spanHi[0].toFixed(1)}] ` +
      `y[${spanLo[1].toFixed(1)}, ${spanHi[1].toFixed(1)}] z[${spanLo[2].toFixed(1)}, ${spanHi[2].toFixed(1)}].`)
    lines.push('')
  }

  lines.push(
    'Re-read section 2 of your instructions, especially 2.1: JSCAD primitives are centred on the origin,',
    'so a part of length L spans -L/2..+L/2 and its far face is at +L/2, not at L. A gap of roughly half a',
    "part's length is the signature of that mistake.",
    '',
    'Return the COMPLETE corrected code block, then the materials array, then the parts array, in the same',
    'format as before. Change only what is needed to close the gaps listed above - keep every other part,',
    'dimension and feature identical. Each listed part must end up sharing a face or overlapping volume with',
    'the part it engages.',
  )
  return lines.join('\n')
}
