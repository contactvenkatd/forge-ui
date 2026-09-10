import { buildModel } from '../src/jscadRuntime.js'
import { judgeStructuralCorrection, claimedComponentCount } from '../src/structuralGate.js'

// legs evenly spaced around the full circle, so N legs really are N clusters
const build = (n) => buildModel(`const { primitives, transforms } = require('@jscad/modeling')
const main = () => [primitives.cylinder({radius:30,height:20}),
  ...Array.from({length:${n}},(_,i)=>transforms.rotateZ(i*2*Math.PI/${Math.max(n, 1)},
    transforms.translate([90,0,-40], primitives.cuboid({size:[140,20,20]}))))]
module.exports = { main }`).solids

const CASES = [
  ['2 legs -> 3 legs (fixes it)',        build(2), build(3), ['only two legs; a real tripod needs three'], true],
  ['2 legs -> 4 legs (overshoots away)', build(2), build(4), ['only two legs; a real tripod needs three'], false],
  ['4 legs -> 3 legs (corrects down)',   build(4), build(3), ['four arms instead of three legs'],          true],
  ['3 legs -> 6 legs (damages)',         build(3), build(6), ['legs are vertical instead of spread'],      false],
  ['3 legs -> 3 legs (no count change)', build(3), build(3), ['legs are vertical instead of spread'],      true],
  ['2 -> 0 with no claim (collapse)',    build(2), build(0), ['spindle too short'],                        false],
  ['2 -> 2 with no claim',               build(2), build(2), ['spindle too short'],                        true],
]

let pass = 0
for (const [label, before, after, lines, want] of CASES) {
  const brief = 'Design a camera tripod: a central hub, three legs hinged to the hub.'
  const g = judgeStructuralCorrection({ beforeSolids: before, afterSolids: after, structuralLines: lines, brief })
  const ok = g.accept === want
  if (ok) pass += 1
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label.padEnd(36)} accept=${String(g.accept).padEnd(5)} want=${String(want).padEnd(5)} ${g.reason}`)
}
console.log(`\n${pass}/${CASES.length} gate cases correct`)
process.exit(pass === CASES.length ? 0 : 1)
