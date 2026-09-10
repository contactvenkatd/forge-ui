import { auditParts, auditComponents, weaklyAttached, auditWarning } from '../src/partAudit.js'

let pass = 0, total = 0
const check = (label, ok, detail) => { total++; if (ok) pass++; console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label.padEnd(48)} ${detail}`) }

const parts = (n) => Array.from({ length: n }, (_, i) => ({ index: i, name: `Part ${i + 1}` }))

const good = auditParts({ solids: new Array(19), parts: parts(19), hubSolidCount: 4, unitSolidCount: 5, count: 3 })
check('4 hub + 3x5 accounts for all 19', good.ok && good.matches, `${good.total}/${good.expected}, ${good.unexplained.length} unexplained`)
check('groups split correctly', good.groups.hub.length === 4 && good.groups.legs.length === 3 && good.groups.legs.every((l) => l.length === 5), `hub ${good.groups.hub.length}, legs ${good.groups.legs.map((l) => l.length).join('/')}`)

const orphan = auditParts({ solids: new Array(20), parts: parts(20), hubSolidCount: 4, unitSolidCount: 5, count: 3 })
check('an extra 20th solid is flagged unexplained', !orphan.ok && orphan.unexplained.length === 1, `unexplained: #${orphan.unexplained[0].index + 1}`)

const short = auditParts({ solids: new Array(18), parts: parts(18), hubSolidCount: 4, unitSolidCount: 5, count: 3 })
check('a missing solid is flagged', !short.ok, `${short.total}/${short.expected}, uniform=${short.uniform}`)

const BRIEF = 'Design a camera tripod: a central hub, three legs hinged to the hub, each leg having two telescoping tube sections, a rubber foot on each leg, and a height-adjustable centre column.'
const withColumn = auditComponents(BRIEF, [{ index: 0, name: 'Hub' }, { index: 1, name: 'Centre column' }, { index: 2, name: 'Leg tube' }, { index: 3, name: 'Foot' }, { index: 4, name: 'Hinge pin' }])
check('all briefed components present -> ok', withColumn.ok, `asked ${withColumn.asked.length}, missing none`)

const noColumn = auditComponents(BRIEF, [{ index: 0, name: 'Hub' }, { index: 1, name: 'Clevis 0' }, { index: 2, name: 'Outer tube' }, { index: 3, name: 'Foot' }, { index: 4, name: 'Hinge pin' }])
check('missing centre column detected', noColumn.missing.includes('centre column'), `missing: ${noColumn.missing.join(', ')}`)
check('audit warning reads clearly', /centre column/.test(auditWarning(good, noColumn)), `"${auditWarning(good, noColumn)}"`)

const weak = weaklyAttached({ parts: 4, contactPairs: [[0, 1], [1, 2], [0, 2], [2, 3]] }, parts(4))
check('single-contact part identified', weak.length === 1 && weak[0].index === 3, `${weak.map((w) => `#${w.index + 1}(${w.contacts})`).join(', ')}`)

console.log(`\n  ${pass}/${total} audit checks correct`)
process.exit(pass === total ? 0 : 1)
