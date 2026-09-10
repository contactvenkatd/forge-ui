import { buildModel } from '../src/jscadRuntime.js'
import { replicateAroundAxis, aggregateMaterials, checkRotationalSymmetry, checkReplicaCollisions, validateBaseUnit } from '../src/replicate.js'
import { analyzeAssembly } from '../src/assemblyCheck.js'

const build = (body) => buildModel(`const { primitives, transforms, booleans } = require('@jscad/modeling')
const main = () => ${body}
module.exports = { main }`).solids

let pass = 0, total = 0
const check = (label, ok, detail) => { total++; if (ok) pass++; console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label.padEnd(46)} ${detail}`) }

// --- geometry + metadata replication ---------------------------------------
const hub = build('[primitives.cylinder({ radius: 40, height: 24, segments: 32 })]')
// knuckle overlaps the hub rim; tube runs outward FROM the knuckle so the unit
// is genuinely one connected body
const leg = build(`[
  transforms.translate([48, 0, 0], primitives.cuboid({ size: [30, 24, 24] })),
  transforms.translate([100, 0, 0], transforms.rotateY(Math.PI / 2, primitives.cylinder({ radius: 9, height: 120, segments: 20 }))),
]`)
const unitParts = [
  { index: 0, name: 'Hinge knuckle', motion: 'rotate', axis: 'y', axisVector: [0, 1, 0], min: 0, max: 60, pivot: [48, 0, 0] },
  { index: 1, name: 'Leg tube', motion: 'slide', axis: 'z', axisVector: [0, 0, 1], min: 0, max: 90 },
]
const r = replicateAroundAxis({ hubSolids: hub, hubParts: [{ index: 0, name: 'Hub' }], unitSolids: leg, unitParts, count: 3 })

check('solid count = hub + 3 x unit', r.solids.length === 1 + 3 * 2, `${r.solids.length} solids`)
check('parts indices are contiguous', r.parts.every((p, i) => p.index === i), `${r.parts.length} parts`)
const rotates = r.parts.filter((p) => p.motion === 'rotate')
const slides = r.parts.filter((p) => p.motion === 'slide')
check('3 independent hinge controls', rotates.length === 3, `${rotates.length} rotate controls`)
check('3 independent slide controls', slides.length === 3, `${slides.length} slide controls`)
const pivots = new Set(rotates.map((p) => p.pivot.map((n) => n.toFixed(1)).join(',')))
check('each hinge has its OWN pivot', pivots.size === 3, [...pivots].join(' | '))
const axes = new Set(rotates.map((p) => p.axisVector.map((n) => n.toFixed(2)).join(',')))
check('each hinge axis rotated with its copy', axes.size === 3, [...axes].join(' | '))
check('slide axis along Z stays Z', new Set(slides.map((p) => p.axisVector.map((n) => n.toFixed(2)).join(','))).size === 1, 'z axis unchanged by rotation (correct)')
const expectedPivot = [48 * Math.cos(2 * Math.PI / 3), 48 * Math.sin(2 * Math.PI / 3), 0]
const got = rotates[1].pivot
check('replica pivot is mathematically correct',
  Math.hypot(got[0] - expectedPivot[0], got[1] - expectedPivot[1], got[2] - expectedPivot[2]) < 1e-6,
  `[${got.map((n) => n.toFixed(1)).join(', ')}]`)

// --- materials ---------------------------------------------------------------
const hubMats = [{ name: 'Aluminium hub billet', quantity: 1, cost: 40 }, { name: 'M6 bolt', quantity: 3, cost: 1 }]
const legMats = [{ name: 'Leg tube', quantity: 2, cost: 12 }, { name: 'M6 bolt', quantity: 2, cost: 1 }]
const mats = aggregateMaterials(hubMats, legMats, 3)
const byName = Object.fromEntries(mats.map((m) => [m.name, m]))
check('hub materials counted once', byName['Aluminium hub billet'].quantity === 1, `qty ${byName['Aluminium hub billet'].quantity}`)
check('leg materials multiplied by 3', byName['Leg tube'].quantity === 6, `qty ${byName['Leg tube'].quantity}, cost ${byName['Leg tube'].cost}`)
check('shared item summed, not duplicated', mats.filter((m) => m.name === 'M6 bolt').length === 1 && byName['M6 bolt'].quantity === 9, `qty ${byName['M6 bolt'].quantity} (3 hub + 3x2 leg)`)

// --- symmetry + collisions ---------------------------------------------------
const symHub = build('[primitives.cylinder({ radius: 40, height: 24, segments: 64 })]')
const asymHub = build('[booleans.subtract(primitives.cylinder({ radius: 40, height: 24, segments: 64 }), transforms.translate([34, 0, 0], primitives.cuboid({ size: [30, 60, 40] })))]')
check('symmetric hub passes symmetry check', checkRotationalSymmetry(symHub, 3).symmetric, `deviation ${(checkRotationalSymmetry(symHub, 3).deviation * 100).toFixed(1)}%`)
const asym = checkRotationalSymmetry(asymHub, 3)
check('flat-faced hub flagged asymmetric', !asym.symmetric, `deviation ${(asym.deviation * 100).toFixed(1)}%`)

const wideLeg = build('[transforms.translate([30, 0, 0], primitives.cuboid({ size: [120, 120, 20] }))]')
check('overlapping replicas flagged as colliding', checkReplicaCollisions(wideLeg, 3).collides, `overlap ${(checkReplicaCollisions(wideLeg, 3).worst * 100).toFixed(1)}%`)
check('slim replicas do not collide', !checkReplicaCollisions(leg, 3).collides, `overlap ${(checkReplicaCollisions(leg, 3).worst * 100).toFixed(1)}%`)

// --- base unit validation + replication preserves connectivity ---------------
const good = validateBaseUnit(hub, leg)
check('connected base unit validates', good.connected, `${good.floating}/${good.parts} floating`)
const detachedLeg = build('[transforms.translate([300, 0, 0], primitives.cuboid({ size: [30, 24, 24] }))]')
check('detached base unit rejected', !validateBaseUnit(hub, detachedLeg).connected, `${validateBaseUnit(hub, detachedLeg).floating} floating`)
const full = analyzeAssembly(r.solids)
check('replicated assembly stays connected', full.connected, `${full.floating.length}/${full.parts} floating after replication`)

console.log(`\n  ${pass}/${total} replication checks correct`)
process.exit(pass === total ? 0 : 1)
