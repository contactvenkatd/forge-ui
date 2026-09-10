import * as modelingNamespace from '@jscad/modeling'
import { analyzeAssembly } from './assemblyCheck.js'

const unwrap = (ns, probe) => (ns?.[probe] ? ns : ns?.default ?? ns)
const modeling = unwrap(modelingNamespace, 'primitives')

const rotZ = (angle, [x, y, z]) => [
  x * Math.cos(angle) - y * Math.sin(angle),
  x * Math.sin(angle) + y * Math.cos(angle),
  z,
]

/**
 * Replicates a validated sub-assembly N times about the Z axis.
 * Geometry, movement metadata and materials are all transformed together, so a
 * replica's hinge turns about ITS OWN pivot and axis rather than the original's.
 */
export function replicateAroundAxis({ hubSolids, hubParts = [], unitSolids, unitParts = [], count }) {
  const solids = [...hubSolids]
  const parts = hubParts.map((p, i) => ({ ...p, index: i }))

  for (let copy = 0; copy < count; copy += 1) {
    const angle = (copy * 2 * Math.PI) / count
    for (let i = 0; i < unitSolids.length; i += 1) {
      const solid = copy === 0 ? unitSolids[i] : modeling.transforms.rotateZ(angle, unitSolids[i])
      const index = solids.length
      solids.push(solid)

      const meta = unitParts.find((p) => p.index === i)
      const name = meta?.name ?? `Part ${i + 1}`
      const entry = { index, name: count > 1 ? `${name} (${copy + 1})` : name }

      if (meta?.motion && meta.axisVector) {
        entry.motion = meta.motion
        entry.min = meta.min
        entry.max = meta.max
        // Rotate the travel direction with the copy, or every replica would move
        // along the first instance's axis.
        entry.axisVector = rotZ(angle, meta.axisVector)
        entry.axis = meta.axis
        if (meta.motion === 'rotate') {
          // And its pivot, or all three hinges would swing about one point.
          entry.pivot = rotZ(angle, meta.pivot ?? [0, 0, 0])
        }
      }
      parts.push(entry)
    }
  }
  return { solids, parts }
}

/**
 * Hub materials counted once, sub-assembly materials multiplied by the replica
 * count, then merged by name so a shared item is summed rather than duplicated.
 */
export function aggregateMaterials(hubMaterials = [], unitMaterials = [], count) {
  const merged = new Map()
  const add = (entry, multiplier) => {
    const name = String(entry?.name ?? '').trim() || 'Unnamed item'
    const key = name.toLowerCase()
    const quantity = (Number(entry?.quantity) || 1) * multiplier
    const cost = (Number(entry?.cost) || 0) * multiplier
    const existing = merged.get(key)
    if (existing) {
      existing.quantity += quantity
      existing.cost += cost
    } else {
      merged.set(key, { name, detail: entry?.detail ?? '', quantity, cost })
    }
  }
  for (const entry of hubMaterials) add(entry, 1)
  for (const entry of unitMaterials) add(entry, count)
  return [...merged.values()]
}

/**
 * Is the hub rotationally symmetric at the replication angle? If it is not (a
 * flat mounting face on one side, say), a replica may land on a different hub
 * feature and not engage the same way.
 */
export function checkRotationalSymmetry(hubSolids, count, tolerance = 0.02) {
  if (!hubSolids.length || count < 2) return { symmetric: true, deviation: 0 }
  try {
    const union = hubSolids.length === 1 ? hubSolids[0] : modeling.booleans.union(...hubSolids)
    const rotated = modeling.transforms.rotateZ((2 * Math.PI) / count, union)
    const volume = modeling.measurements.measureVolume(union)
    if (volume <= 0) return { symmetric: true, deviation: 0 }
    // Volume the rotated copy does NOT share with the original.
    const difference = modeling.measurements.measureVolume(modeling.booleans.subtract(rotated, union))
    const deviation = difference / volume
    return { symmetric: deviation <= tolerance, deviation }
  } catch (error) {
    // A boolean failure is not evidence of asymmetry; say so rather than guess.
    return { symmetric: true, deviation: 0, unknown: true, error: error.message }
  }
}

/** Do any two replicas overlap each other? Rotational seams can collide. */
export function checkReplicaCollisions(unitSolids, count) {
  if (count < 2 || !unitSolids.length) return { collides: false, worst: 0 }
  try {
    const one = unitSolids.length === 1 ? unitSolids[0] : modeling.booleans.union(...unitSolids)
    const next = modeling.transforms.rotateZ((2 * Math.PI) / count, one)
    const shared = modeling.measurements.measureVolume(modeling.booleans.intersect(one, next))
    const volume = modeling.measurements.measureVolume(one)
    const worst = volume > 0 ? shared / volume : 0
    return { collides: worst > 0.02, worst }
  } catch (error) {
    return { collides: false, worst: 0, unknown: true, error: error.message }
  }
}

/** Connectivity of the hub plus ONE unit - the cheap pass/fail before replicating. */
export function validateBaseUnit(hubSolids, unitSolids) {
  const combined = [...hubSolids, ...unitSolids]
  const report = analyzeAssembly(combined)
  return {
    connected: report.connected,
    floating: report.floating.length,
    parts: report.parts,
    report,
    combined,
  }
}
