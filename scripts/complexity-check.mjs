/** Routing decisions, including ambiguous phrasing. node scripts/complexity-check.mjs */
import { analyseComplexity } from '../src/complexity.js'

const CASES = [
  [true,  'tripod (the failing case)', 'Design a camera tripod: a central hub, three legs hinged to the hub that swing out to spread, each leg having two telescoping tube sections that slide independently, a rubber foot on each leg, and a height-adjustable centre column.'],
  [true,  'four-arm chassis',          'Design a four-arm articulated frame: a central chassis with four arms, each arm hinged at the chassis and telescoping outward.'],
  [true,  'five-spoke jig',            'Design a five-spoke rotary jig: a central hub, five spokes each pivoting on its own pin and sliding radially.'],
  [false, 'three mounting HOLES',      'Design a wall plate with three mounting holes and a folding arm that hinges and slides.'],
  [false, 'six bolts',                 'Design a bolted pipe flange coupling joining two 50mm aluminium tubes, using six M8 bolts.'],
  [false, 'single hinge bracket',      'Design a compact wall-mounted folding workbench bracket supporting 100 kg with a hinge.'],
  [false, 'single telescoping tube',   'Design a telescoping tripod leg with three nested tube sections that slide out and lock, plus a foot and a top mounting yoke.'],
  [false, 'stacked trays (no hub)',    'Design a stacked tray desk organizer: three trays that stack vertically on spindle posts.'],
  [false, 'NON-UNIFORM legs',          'Design a camera tripod with a central hub and three legs of different heights for an uneven surface, each hinged and telescoping.'],
  [false, 'two front, one rear',       'Design a stand with a central hub, two front legs and one longer rear leg, each hinged and sliding.'],
  [false, 'no mechanism named',        'Design a hub with three legs.'],
  [false, 'only 2 repeats',            'Design a gripper: a central body with two jaws that pivot and slide.'],
  [false, 'drawer unit (no radial)',   'Design a cabinet frame with three drawers that slide out on rails and a hinged door.'],
  [false, 'three ribs (not assembly)', 'Design a bracket with a central body, three stiffening ribs, a hinge and a sliding arm.'],
]

let pass = 0
for (const [want, label, brief] of CASES) {
  const r = analyseComplexity(brief)
  const ok = r.decompose === want
  if (ok) pass += 1
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label.padEnd(26)} -> ${r.strategy.padEnd(12)}` +
    ` count=${String(r.count).padEnd(2)} central=${String(r.central).padEnd(5)} fams=${r.families.length}${r.nonUniform ? ' NON-UNIFORM' : ''}`)
}
console.log(`\n  ${pass}/${CASES.length} routing decisions correct`)
process.exit(pass === CASES.length ? 0 : 1)
