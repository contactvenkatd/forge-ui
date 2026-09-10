/**
 * Inventory extraction, assignment and validation across DIFFERENT design
 * categories - proving the logic is generic, not tripod-specific.
 *   node scripts/inventory-check.mjs
 */
import { headNoun, inventoryPresent, normaliseInventory, extractInventoryHeuristic, auditInventory, inventoryWarning } from '../src/inventory.js'
import { classifyCritique } from '../src/agenticDesign.js'

let pass = 0, total = 0
const check = (label, ok, detail) => { total++; if (ok) pass++; console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label.padEnd(52)} ${detail}`) }

// Four unrelated categories, each with a shared singular component beyond the hub
const CATEGORIES = [
  {
    name: 'tripod',
    shared: ['central hub', 'height-adjustable centre column'],
    repeated: ['hinge knuckle', 'upper telescoping tube', 'lower telescoping tube', 'rubber foot'],
    built: ['Hub', 'Clevis 0', 'Clevis 1', 'Clevis 2', 'Hinge pin (1)', 'Knuckle (1)', 'Outer tube (1)', 'Inner tube (1)', 'Foot (1)'],
    expectMissing: ['height-adjustable centre column'],
  },
  {
    name: 'wheelbarrow',
    shared: ['tray body', 'single front wheel', 'handle assembly'],
    repeated: ['leg support', 'foot pad'],
    built: ['Tray', 'Leg support (1)', 'Foot pad (1)', 'Handle bar'],
    expectMissing: ['single front wheel'],
  },
  {
    name: 'robotic fixture',
    shared: ['central rotating turntable', 'base plate'],
    repeated: ['gripper arm', 'jaw pad', 'arm pivot'],
    built: ['Base plate', 'Gripper arm (1)', 'Jaw pad (1)', 'Arm pivot (1)'],
    expectMissing: ['central rotating turntable'],
  },
  {
    name: 'ceiling fan',
    shared: ['motor housing', 'mounting canopy'],
    repeated: ['fan blade', 'blade iron'],
    built: ['Motor housing', 'Mounting canopy', 'Fan blade (1)', 'Blade iron (1)'],
    expectMissing: [],
  },
]

for (const c of CATEGORIES) {
  const inv = normaliseInventory({ repeated: { name: 'unit', count: 3, components: c.repeated }, shared: c.shared })
  const parts = c.built.map((n, i) => ({ index: i, name: n }))
  const audit = auditInventory(inv, parts)
  const ok = JSON.stringify(audit.missing.sort()) === JSON.stringify([...c.expectMissing].sort())
  check(`${c.name}: detects exactly the missing component(s)`, ok,
    audit.missing.length ? `missing: ${audit.missing.join(', ')}` : 'nothing missing (correct)')
}

// complete build for each category must validate clean
for (const c of CATEGORIES) {
  const inv = normaliseInventory({ repeated: { name: 'unit', count: 3, components: c.repeated }, shared: c.shared })
  const complete = [...c.shared, ...c.repeated].map((n, i) => ({ index: i, name: n }))
  check(`${c.name}: complete build validates clean`, auditInventory(inv, complete).ok, `${inv.all.length} items all present`)
}

// heuristic fallback derives an inventory with no model call
const BRIEF = 'Design a ceiling fan: a central motor housing, five identical blades each attached by a blade iron, a mounting canopy, and a pull chain switch.'
const h = extractInventoryHeuristic(BRIEF, { repeatedNoun: 'blade', count: 5 })
check('heuristic fallback finds shared components', h.shared.length >= 2, `shared: ${h.shared.map(headNoun).join(', ')}`)
check('heuristic fallback is generic (no hardcoding)', h.shared.some((s) => headNoun(s) === 'housing') && h.shared.some((s) => headNoun(s) === 'canopy'), `head nouns: ${h.shared.map(headNoun).join(', ')}`)

// de-duplication by head noun
const dup = normaliseInventory({ repeated: { components: ['leg tube', 'tube'] }, shared: ['hub', 'central hub'] })
check('duplicate head nouns collapsed', dup.shared.length === 1 && dup.repeated.length === 1, `shared ${dup.shared.length}, repeated ${dup.repeated.length}`)

// the critique now has a MISSING category of its own
const findings = classifyCritique('VERDICT: PROBLEMS\nSTRUCTURAL: none\nMISSING: the centre column is not visible\nCONNECTIVITY: foot floats 3mm\n```js\ncode\n```')
check('critique MISSING section parsed separately', findings.hasMissing && findings.missing.length === 1 && findings.connectivity.length === 1,
  `missing=${findings.missing.length} connectivity=${findings.connectivity.length} structural=${findings.structural.length}`)
check('missing counts as a structural-class finding', findings.hasStructural, 'gates the correction like other structural issues')
check('warning text names the component', /centre column/.test(inventoryWarning(auditInventory(
  normaliseInventory({ shared: ['centre column'], repeated: [] }), [{ index: 0, name: 'Hub' }]))), 'reads clearly')

console.log(`\n  ${pass}/${total} inventory checks correct`)
process.exit(pass === total ? 0 : 1)
