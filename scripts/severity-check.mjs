/**
 * Severely-broken fixtures across three design categories, checking the
 * severity plan classifies each correctly.  node scripts/severity-check.mjs
 */
import { buildModel } from '../src/jscadRuntime.js'
import { analyzeAssembly } from '../src/assemblyCheck.js'
import { severityPlan } from '../src/agenticDesign.js'

const build = (body) => buildModel(`const { primitives, transforms, booleans } = require('@jscad/modeling')
const main = () => ${body}
module.exports = { main }`).solids

const FIXTURES = [
  // 1. multi-leg tripod: hub plus 4 leg rods hanging in parallel space + 2 loose feet
  ['tripod, legs never reach hub', `[
    primitives.cylinder({ radius: 30, height: 20 }),
    ...Array.from({length:4},(_,i)=>transforms.translate([200+i*40, 0, -120], primitives.cylinder({radius:8,height:200,segments:16}))),
    transforms.translate([200,0,-260], primitives.cylinder({radius:14,height:12,segments:16})),
    transforms.translate([240,0,-260], primitives.cylinder({radius:14,height:12,segments:16})),
  ]`, 'severe'],

  // 2. complex hinged multi-arm: base with 5 arms scattered off in space
  ['multi-arm hinge, arms adrift', `[
    primitives.cuboid({ size: [120, 120, 12] }),
    ...Array.from({length:5},(_,i)=>transforms.translate([0, 150+i*70, 60], primitives.cuboid({size:[100,20,10]}))),
    transforms.translate([0, 520, 60], primitives.cylinder({radius:5,height:120,segments:16})),
  ]`, 'severe'],

  // 3. telescoping stack where the tubes float clear of each other
  ['telescoping, tubes not nested', `[
    primitives.cylinder({ radius: 20, height: 200, segments: 24 }),
    transforms.translate([0,0,340], primitives.cylinder({radius:16,height:200,segments:24})),
    transforms.translate([0,0,680], primitives.cylinder({radius:12,height:200,segments:24})),
    transforms.translate([0,0,1020], primitives.cylinder({radius:10,height:60,segments:24})),
  ]`, 'severe'],

  // controls
  ['healthy stack (all touching)', `[
    primitives.cuboid({ size: [200, 200, 10] }),
    transforms.translate([0,0,25], primitives.cuboid({size:[60,60,40]})),
    transforms.translate([0,0,60], primitives.cuboid({size:[30,30,30]})),
  ]`, 'clean'],
  ['one minor floater of six', `[
    primitives.cuboid({ size: [200, 200, 10] }),
    transforms.translate([0,0,25], primitives.cuboid({size:[60,60,40]})),
    transforms.translate([60,0,10], primitives.cuboid({size:[20,20,20]})),
    transforms.translate([-60,0,10], primitives.cuboid({size:[20,20,20]})),
    transforms.translate([0,60,10], primitives.cuboid({size:[20,20,20]})),
    transforms.translate([0,0,400], primitives.cuboid({size:[20,20,20]})),
  ]`, 'minor'],
]

let pass = 0
console.log('  fixture                          parts  floating  severity  severe  unacceptable  rounds')
for (const [label, body, expect] of FIXTURES) {
  const solids = build(body)
  const a = analyzeAssembly(solids)
  const plan = severityPlan(a.floating.length / a.parts)
  const got = plan.severe ? 'severe' : plan.unacceptable ? 'unacceptable' : a.floating.length ? 'minor' : 'clean'
  const ok = expect === 'severe' ? plan.severe
    : expect === 'clean' ? (!plan.severe && !plan.unacceptable && a.floating.length === 0)
    : (!plan.severe && !plan.unacceptable)
  if (ok) pass += 1
  console.log(`  ${ok ? 'PASS' : 'FAIL'} ${label.padEnd(30)} ${String(a.parts).padStart(4)} ${String(a.floating.length).padStart(8)} ` +
    `${(plan.severity * 100).toFixed(0).padStart(8)}% ${String(plan.severe).padStart(7)} ${String(plan.unacceptable).padStart(13)} ${String(plan.rounds).padStart(7)}`)
}
console.log(`\n  ${pass}/${FIXTURES.length} severity classifications correct`)
process.exit(pass === FIXTURES.length ? 0 : 1)
