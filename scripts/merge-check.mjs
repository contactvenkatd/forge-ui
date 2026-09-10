/**
 * Deterministic tests for correction merging - no API calls.
 *   node scripts/merge-check.mjs
 */
import { evaluateReply, mergeCorrection } from '../src/assemblyCorrection.js'

const code = (n) => {
  const parts = Array.from({ length: n }, (_, i) =>
    `transforms.translate([0, 0, ${i * 10}], primitives.cuboid({ size: [40, 40, 10] }))`).join(',\n  ')
  return ['```js',
    "const { primitives, transforms } = require('@jscad/modeling')",
    `const main = () => [\n  ${parts}\n]`,
    'module.exports = { main }', '```'].join('\n')
}
const materials = (n) => '```json\n' + JSON.stringify(
  Array.from({ length: n }, (_, i) => ({ name: `Item ${i + 1}`, quantity: 1, cost: 10 }))) + '\n```'
const parts = (n, movable = []) => '```json\n' + JSON.stringify(
  Array.from({ length: n }, (_, i) => movable.includes(i)
    ? { index: i, name: `Part ${i + 1}`, axis: 'z', min: 0, max: 50 }
    : { index: i, name: `Part ${i + 1}` })) + '\n```'

const original = evaluateReply([code(4), materials(3), parts(4, [2, 3])].join('\n\n'))

const cases = [
  ['correction omits BOTH arrays',        [code(4)].join('\n\n'),                          { mats: 3, parts: 4, movable: 2 }],
  ['correction omits materials only',     [code(4), parts(4, [2, 3])].join('\n\n'),        { mats: 3, parts: 4, movable: 2 }],
  ['correction omits parts only',         [code(4), materials(5)].join('\n\n'),            { mats: 5, parts: 4, movable: 2 }],
  ['correction restates both',            [code(4), materials(2), parts(4, [1])].join('\n\n'), { mats: 2, parts: 4, movable: 1 }],
  ['correction REMOVES a part, no arrays',[code(3)].join('\n\n'),                          { mats: 3, parts: 3, movable: 0 }],
  ['correction ADDS a part, no arrays',   [code(6)].join('\n\n'),                          { mats: 3, parts: 4, movable: 0 }],
  ['correction removes a part, restates', [code(3), materials(2), parts(3, [2])].join('\n\n'), { mats: 2, parts: 3, movable: 1 }],
  ['correction parts index out of range', [code(3), parts(5, [4])].join('\n\n'),           { mats: 3, parts: 3, movable: 0 }],
]

let pass = 0
console.log(`original: ${original.materials.length} materials, ${original.parts.length} parts, ` +
  `${original.parts.filter((p) => p.axis).length} movable, ${original.solids.length} solids\n`)

for (const [label, reply, want] of cases) {
  const candidate = evaluateReply(reply)
  const merged = mergeCorrection(original, candidate)
  const movable = merged.parts.filter((p) => p.axis).length
  const ok = merged.materials.length === want.mats && merged.parts.length === want.parts && movable === want.movable
  // geometry must always come from the correction, never the original
  const geometryFromCandidate = merged.solids.length === candidate.solids.length && merged.code === candidate.code
  if (ok && geometryFromCandidate) pass += 1
  console.log(`  ${ok && geometryFromCandidate ? 'PASS' : 'FAIL'}  ${label.padEnd(36)} ` +
    `mats ${merged.materials.length}(want ${want.mats})  parts ${merged.parts.length}(want ${want.parts})  ` +
    `movable ${movable}(want ${want.movable})  solids ${merged.solids.length}` +
    (merged.partsStale ? '  [movement dropped: part count changed]' : ''))
  if (!geometryFromCandidate) console.log('        !! geometry did not come from the correction')
}
console.log(`\n${'='.repeat(70)}\n${pass}/${cases.length} merge cases correct`)
process.exit(pass === cases.length ? 0 : 1)
