// A realistic 5-part assembly: base plate, upright bracket, and 3 bolts.
export const ASSEMBLY_FIXTURE = `
const { primitives, transforms, booleans } = require('@jscad/modeling')
const { cuboid, cylinder } = primitives
const { translate, rotateX } = transforms
const { subtract } = booleans

const main = () => [
  // 01 base plate, bored for the bolts
  subtract(
    cuboid({ size: [240, 180, 8] }),
    translate([-90, 0, 0], cylinder({ radius: 4, height: 20, segments: 24 })),
    translate([0, 0, 0], cylinder({ radius: 4, height: 20, segments: 24 })),
    translate([90, 0, 0], cylinder({ radius: 4, height: 20, segments: 24 })),
  ),
  // 02 upright bracket
  translate([0, -80, 44], rotateX(Math.PI / 2, cuboid({ size: [200, 80, 10] }))),
  // 03-05 bolts
  translate([-90, 0, 10], cylinder({ radius: 3.8, height: 24, segments: 16 })),
  translate([0, 0, 10], cylinder({ radius: 3.8, height: 24, segments: 16 })),
  translate([90, 0, 10], cylinder({ radius: 3.8, height: 24, segments: 16 })),
]
module.exports = { main }
`
export const FIXTURE_MATERIALS = [
  { name: '6061 Aluminum Plate', quantity: 1, cost: 84 },
  { name: 'Aluminum Bracket', quantity: 1, cost: 46 },
  { name: 'M8 Steel Bolt', quantity: 3, cost: 6.6 },
]
