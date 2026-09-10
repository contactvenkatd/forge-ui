// Captured from a live Grok generation for the stacked tray desk organiser brief.
// Used so the part-slider tests are deterministic and need no API call.
export const TRAY_CODE = "const { primitives, booleans, transforms } = require('@jscad/modeling')\nconst { cuboid, cylinder } = primitives\nconst { subtract } = booleans\nconst { translate } = transforms\n\nconst BASE_W = 200\nconst BASE_D = 150\nconst BASE_T = 8\nconst POST_D = 12\nconst POST_H = 110\nconst POST_CLEAR = POST_D + 0.4\nconst TRAY_T = 6\nconst TRAY_W = 200\nconst TRAY_D = 150\nconst POST_X = 70\nconst POST_Y = 0\n\nconst postHole = (x) => translate([x, POST_Y, 0],\n  cylinder({ radius: POST_CLEAR / 2, height: TRAY_T * 3, segments: 24 }))\n\nconst main = () => {\n  // 00 base plate\n  const base = translate([0, 0, BASE_T / 2],\n    cuboid({ size: [BASE_W, BASE_D, BASE_T] }))\n\n  // 01 left spindle post - stands on base top face\n  const postLeft = translate([POST_X, POST_Y, BASE_T + POST_H / 2],\n    cylinder({ radius: POST_D / 2, height: POST_H, segments: 24 }))\n\n  // 02 right spindle post - stands on base top face\n  const postRight = translate([-POST_X, POST_Y, BASE_T + POST_H / 2],\n    cylinder({ radius: POST_D / 2, height: POST_H, segments: 24 }))\n\n  // 03 bottom tray - rests on base top face, holes on posts\n  const trayBottom = subtract(\n    translate([0, 0, BASE_T + TRAY_T / 2],\n      cuboid({ size: [TRAY_W, TRAY_D, TRAY_T] })),\n    postHole(POST_X), postHole(-POST_X))\n\n  // 04 middle tray - rests on bottom tray top face, holes on posts\n  const trayMiddle = subtract(\n    translate([0, 0, BASE_T + TRAY_T + TRAY_T / 2],\n      cuboid({ size: [TRAY_W, TRAY_D, TRAY_T] })),\n    postHole(POST_X), postHole(-POST_X))\n\n  // 05 top tray - rests on middle tray top face, holes on posts\n  const trayTop = subtract(\n    translate([0, 0, BASE_T + 2 * TRAY_T + TRAY_T / 2],\n      cuboid({ size: [TRAY_W, TRAY_D, TRAY_T] })),\n    postHole(POST_X), postHole(-POST_X))\n\n  return [base, postLeft, postRight, trayBottom, trayMiddle, trayTop]\n}\nmodule.exports = { main }"

export const TRAY_PARTS = [
  {
    "index": 0,
    "name": "Base plate"
  },
  {
    "index": 1,
    "name": "Left spindle post"
  },
  {
    "index": 2,
    "name": "Right spindle post"
  },
  {
    "index": 3,
    "name": "Bottom tray",
    "axis": "z",
    "min": 0,
    "max": 80
  },
  {
    "index": 4,
    "name": "Middle tray",
    "axis": "z",
    "min": 0,
    "max": 80
  },
  {
    "index": 5,
    "name": "Top tray",
    "axis": "z",
    "min": 0,
    "max": 80
  }
]

export const TRAY_MATERIALS = [
  {
    "name": "Base plate",
    "detail": "",
    "quantity": 1,
    "cost": 4
  },
  {
    "name": "Spindle post",
    "detail": "",
    "quantity": 2,
    "cost": 3
  },
  {
    "name": "Tray",
    "detail": "",
    "quantity": 3,
    "cost": 3
  }
]
