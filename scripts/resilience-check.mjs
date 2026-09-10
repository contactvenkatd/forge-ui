/**
 * Confirms bad AI-generated geometry still renders something.
 *   node scripts/resilience-check.mjs
 */
import { buildModel, buildWarning } from '../src/jscadRuntime.js'

const wrap = (body) => `const { primitives, booleans, transforms } = require('@jscad/modeling')
const { cuboid, cylinder, sphere, roundedCuboid } = primitives
const { union, subtract, intersect } = booleans
const { translate, rotateX, scale } = transforms
const main = () => ${body}
module.exports = { main }`

const CASES = [
  ['1. roundRadius larger than the shape', 'RENDERS', wrap(`[
    roundedCuboid({ size: [40, 40, 10], roundRadius: 50 }),
    translate([60, 0, 0], roundedCuboid({ size: [30, 30, 30], roundRadius: 14.999 })),
  ]`)],

  ['1b. negative / NaN roundRadius', 'RENDERS', wrap(`[
    roundedCuboid({ size: [40, 40, 10], roundRadius: -5 }),
    translate([60, 0, 0], roundedCuboid({ size: [40, 40, 10], roundRadius: 0 / 0 })),
  ]`)],

  ['2. boolean with null / undefined args', 'RENDERS', wrap(`[
    subtract(cuboid({ size: [50, 50, 10] }), null, undefined),
    translate([70, 0, 0], union(cuboid({ size: [20, 20, 20] }), null)),
    translate([140, 0, 0], intersect(undefined, null)),
  ]`)],

  ['2b. boolean given a plain object', 'RENDERS', wrap(`[
    subtract(cuboid({ size: [40, 40, 8] }), { notA: 'geometry' }, 42, 'text'),
  ]`)],

  ['3. zero and negative dimensions', 'RENDERS', wrap(`[
    cuboid({ size: [0, 20, 10] }),
    translate([40, 0, 0], cylinder({ radius: -5, height: 0 })),
    translate([80, 0, 0], sphere({ radius: 0 })),
    translate([120, 0, 0], cuboid({ size: [30, 30, 30] })),
  ]`)],

  ['4. missing helper function', 'RENDERS', wrap(`[
    chamferEverything(cuboid({ size: [40, 40, 10] })),
    translate([60, 0, 0], filletEdges(cylinder({ radius: 10, height: 20 }), 3)),
    translate([120, 0, 0], cuboid({ size: [20, 20, 20] })),
  ]`)],

  ['5. one part of five fails', 'RENDERS', wrap(`[
    cuboid({ size: [100, 60, 8] }),
    translate([0, 0, 20], cuboid({ size: [30, 30, 30] })),
    roundedCuboid({ size: [20, 20, 20], roundRadius: 999 }),
    translate([60, 0, 20], cylinder({ radius: 8, height: 30 })),
    subtract(null, null),
  ]`)],

  ['5b. every part fails', 'HARD FAIL', wrap(`[
    subtract(null, null),
    union(undefined),
    intersect(null, undefined),
  ]`)],

  ['6. syntax error', 'HARD FAIL', `const main = () => { return [ cuboid({ size: [1,2,3] })`],

  ['6b. main returns nothing', 'HARD FAIL', wrap('undefined')],

  ['7. mixed disaster, still salvageable', 'RENDERS', wrap(`[
    subtract(cuboid({ size: [120, 80, 10] }), translate([40, 0, 0], cylinder({ radius: -3, height: 40 }))),
    bevelAll(translate([0, 0, 25], roundedCuboid({ size: [40, 40, 40], roundRadius: 500 }))),
    translate([0, 0, 60], scale([0, 1, 1], cuboid({ size: [20, 20, 20] }))),
    union(null, undefined),
    translate([70, 0, 25], sphere({ radius: 12, segments: 1 })),
  ]`)],
]

let pass = 0
for (const [label, expected, code] of CASES) {
  try {
    const { solids, report } = buildModel(code)
    const got = 'RENDERS'
    const ok = got === expected
    if (ok) pass += 1
    console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label.padEnd(38)} ${solids.length} solid(s) built`)
    const warning = buildWarning(report)
    if (warning) console.log(`        notice: ${warning}`)
    for (const w of report.warnings.slice(0, 3)) console.log(`        - ${w}`)
  } catch (error) {
    const ok = expected === 'HARD FAIL'
    if (ok) pass += 1
    console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label.padEnd(38)} hard failure`)
    console.log(`        "${error.message.slice(0, 96)}"`)
  }
}
console.log(`\n${'='.repeat(62)}\n${pass}/${CASES.length} cases behaved as expected`)
process.exit(pass === CASES.length ? 0 : 1)
