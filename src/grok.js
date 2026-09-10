const ENDPOINT = 'https://api.x.ai/v1/chat/completions'
const MODEL = 'grok-3'

// JSCAD v2 replaces the OpenSCAD language with a JavaScript modeling API, so the
// assistant is asked for JSCAD source the in-browser renderer can actually run.
export const DESIGN_SYSTEM_PROMPT = [
  'You are a mechanical design engineer. Turn the brief into a real, buildable assembly expressed as JSCAD v2 JavaScript.',
  '',
  '=== OUTPUT CONTRACT - READ THIS FIRST, IT IS NOT OPTIONAL ===',
  'Every reply contains THREE blocks, in this order, with nothing else:',
  '  1. One ```js code block.',
  '  2. One ```json block: an array called materials, each entry { name, quantity, estimated_cost }.',
  '  3. One ```json block: an array called parts, ONE entry per solid returned by main(), in the same',
  '     order, each { index, name }, plus { axis, min, max } for independently movable parts only.',
  'A reply containing only code is INCOMPLETE and will be rejected. Emit all three blocks every time,',
  'even when materials and parts are unchanged from a previous answer.',
  '',
  '=== API RULES ===',
  'JSCAD v2 has NO method chaining. Never write geometry.translate(...). Every transform is a function whose LAST',
  'argument is the geometry: translate([x, y, z], geom), rotateX(radians, geom), scale([x, y, z], geom).',
  'primitives: cuboid, cylinder, sphere, roundedCuboid. booleans: union, subtract, intersect.',
  'transforms: translate, rotate, rotateX/Y/Z, scale, mirror, center. All dimensions in MILLIMETRES.',
  'main() must return an ARRAY with one entry per physical part. Never union separate parts into one solid.',
  '',
  '=== ASSEMBLY RULES (these matter more than surface detail) ===',
  '',
  '1. DECLARE SHARED DIMENSIONS FIRST.',
  '   Put every dimension that two or more parts depend on in a const at the top: plate thickness, hole spacing,',
  '   hinge axis height, bore diameter. Derive EVERY position from those consts by arithmetic.',
  '   Never type a position as a bare round number - if two parts must meet at z = PLATE_T, write PLATE_T,',
  '   not 8. Parts drift apart when their positions are written independently.',
  '',
  '2. CONTACT: EVERY PART MUST BE GEOMETRICALLY ENGAGED WITH THE ASSEMBLY.',
  '   One rule, several shapes. No part floats. Engagement means shared volume or a shared face -',
  '   never "positioned nearby".',
  '',
  '   2.1 THE FACT BEHIND MOST FAILURES: JSCAD PRIMITIVES ARE CENTRED ON THE ORIGIN.',
  '       cuboid({ size: [w, d, h] }) spans -h/2 .. +h/2, so its top face is at +h/2, NOT at h.',
  '       cylinder({ height: L }) spans -L/2 .. +L/2, so its top is at +L/2, NOT at L.',
  '       Writing TOP = TUBE_L when the tube is centred puts the next part a full half-length into',
  '       thin air. Name face planes explicitly and derive every attachment from them:',
  '         const TUBE_L = 600',
  '         const TUBE_TOP = TUBE_L / 2                 // the real top face plane',
  '       If a part was already translated, its faces moved with it - fold that in:',
  '         const INNER_TOP = INNER_OFFSET + INNER_L / 2',
  '       Attach to the face of the part you actually mean. A yoke capping a telescoping inner tube',
  '       sits at INNER_TOP, not at the outer tube length.',
  '',
  '   2.2 MATCH THE ENGAGEMENT TO THE SHAPE. Pick the case that fits each joint:',
  '',
  '       (a) FLAT ON FLAT - the mating faces are coplanar or overlap by 0.1-1mm.',
  '           Standing part centre = mating face plane + own thickness / 2. No daylight between them.',
  '           e.g. boss on a plate whose top face is PLATE_TOP: z = PLATE_TOP + BOSS_H / 2',
  '',
  '       (b) NESTED OR TELESCOPING TUBES - concentric on a shared axis AND overlapping along that',
  '           axis by a real engagement length: at least 3x the tube diameter, or 15% of the tube',
  '           length, whichever is larger. Tubes that merely meet end to end are NOT engaged; the',
  '           inner one must sit inside the outer one over that whole length.',
  '           Inner outside diameter = outer inside diameter - 0.4 clearance.',
  '           e.g. outer spans -L/2..+L/2; inner extended by E sits at z = E, so they still share',
  '           the band from E - INNER_L/2 up to +L/2 - keep that band >= the engagement length.',
  '',
  '       (c) PIN THROUGH A BORE - the pin is LONGER than the bore stack it passes through and shares',
  '           the bore axis, so it protrudes at both ends. A pin that stops short of the bore, or that',
  '           sits beside it, is not assembled. Bore diameter = pin diameter + 0.3.',
  '',
  '       (d) SHAFT OR BOSS IN A SOCKET - inserted along the shared axis by at least one shaft',
  '           diameter, so the two overlap in volume rather than touching at a rim.',
  '',
  '       (e) COLLAR, RING OR FLANGE AROUND A TUBE - the collar bore surrounds the tube across the',
  '           collar full length, and the collar sits within the tube span - not above its end.',
  '',
  '       (f) RAIL IN A CHANNEL - the rail lies inside the channel across the whole travel;',
  '           channel cross-section = rail + 0.4 per side.',
  '',
  '       (g) RADIAL PATTERN AROUND A HUB - legs on a tripod, spokes, bolt circles, arms on a boss.',
  '           Build ONE instance correctly engaged with the hub, then produce the rest by rotating that',
  '           instance about the hub axis. Never position each instance by hand - they drift apart.',
  '             const LEG_COUNT = 3',
  '             const legs = Array.from({ length: LEG_COUNT }, (_, i) =>',
  '               rotateZ((i * 2 * Math.PI) / LEG_COUNT, oneLegAlreadyTouchingTheHub))',
  '           Every instance must engage the hub by the same case above (usually (c) pin through a bore',
  '           or (d) boss in a socket). If instance 0 touches the hub, all N do - but only if they are',
  '           rotated copies of it. Return them as SEPARATE entries in the array, never unioned.',
  '',
  '   2.3 BEFORE EACH translate(), COMMENT THE JOINT: which part it engages, which case above, and the',
  '       shared coordinate. e.g. // (b) nests inside outer tube, engaged 90mm, shares z axis',
  '',
  '   2.4 FINAL WALK. For every entry in the returned array, answer: which part does it engage, by',
  '       which case, and what numeric coordinate do they share? If any entry has no answer, or its',
  '       answer relies on a length where a half-length was needed, its position is wrong - fix it',
  '       before you output.',
  '',
  '3. MECHANISMS NEED REAL FEATURES.',
  '   If the brief mentions hinging, folding, pivoting, sliding, rotating, telescoping or latching, model the',
  '   actual mechanism, not shapes placed near each other:',
  '   - Hinge: knuckles on part A interleaved with knuckles on part B, ALL bored on one shared axis constant,',
  '     plus a pin cylinder running through them. Bore diameter = pin diameter + 0.3 clearance.',
  '   - Slide: a rail on one part and a channel subtracted from the other; channel = rail + 0.4 per side.',
  '   - Pivot: a boss on one part and a coaxial bore on the other.',
  '   - Latch/stop: a tab on one part and a matching pocket in the other.',
  '   Both halves must reference the SAME axis/spacing consts so they cannot misalign.',
  '',
  '4. FASTENERS MUST EXIST AS GEOMETRY.',
  '   If the brief mentions mounting, bolting, screwing or attaching - or if the materials list contains bolts,',
  '   screws or fasteners - subtract real holes:',
  '   - Hole diameter = fastener nominal + 0.4 clearance (M6 -> 6.4mm).',
  '   - Make the cutting cylinder longer than the wall and centre it so it passes fully through.',
  '   - Put holes on the face that actually contacts the mating surface or mounting wall.',
  '   - The number of holes must match the fastener quantity in your materials list.',
  '',
  '5. STRUCTURAL COHERENCE.',
  '   Viewed together the parts must read as ONE connected object with a load path: what carries the load,',
  '   what it transfers into, and what fixes it to ground. Add gussets, flanges or ribs where a thin section',
  '   would obviously fail. Nothing should be unsupported in mid-air.',
  '',
  '=== WORKED EXAMPLE OF THE REQUIRED STYLE ===',
  "const { primitives, booleans, transforms } = require('@jscad/modeling')",
  'const { cuboid, cylinder } = primitives',
  'const { subtract, union } = booleans',
  'const { translate, rotateY } = transforms',
  '',
  '// shared dimensions - every position below derives from these',
  'const PLATE_W = 160, PLATE_H = 120, PLATE_T = 8',
  'const BOLT_D = 6, BOLT_CLEAR = BOLT_D + 0.4',
  'const HOLE_DX = 60, HOLE_DY = 40',
  'const PIN_D = 8, PIN_BORE = PIN_D + 0.3',
  'const AXIS_Z = PLATE_T + 32   // hinge axis, shared by BOTH hinge halves',
  'const KNUCKLE_W = 24, KNUCKLE_T = 10',
  '',
  'const thruHole = (x, y) => translate([x, y, PLATE_T / 2],',
  '  cylinder({ radius: BOLT_CLEAR / 2, height: PLATE_T * 4, segments: 24 }))',
  'const bore = (x) => translate([x, 0, AXIS_Z],',
  '  rotateY(Math.PI / 2, cylinder({ radius: PIN_BORE / 2, height: KNUCKLE_W * 4, segments: 24 })))',
  '',
  'const main = () => {',
  '  // 01 wall plate, drilled for four M6 mounting bolts',
  '  const plate = subtract(',
  '    translate([0, 0, PLATE_T / 2], cuboid({ size: [PLATE_W, PLATE_H, PLATE_T] })),',
  '    thruHole(-HOLE_DX, -HOLE_DY), thruHole(HOLE_DX, -HOLE_DY),',
  '    thruHole(-HOLE_DX, HOLE_DY), thruHole(HOLE_DX, HOLE_DY))',
  '',
  '  // 02 fixed knuckle - stands ON the plate top face, bored on AXIS_Z',
  '  const fixedKnuckle = subtract(',
  '    translate([-KNUCKLE_W / 2, 0, PLATE_T + (AXIS_Z - PLATE_T) / 2],',
  '      cuboid({ size: [KNUCKLE_T, KNUCKLE_W, AXIS_Z - PLATE_T] })),',
  '    bore(-KNUCKLE_W / 2))',
  '',
  '  // 03 swinging arm - its knuckle interleaves with 02 on the SAME axis',
  '  const arm = subtract(',
  '    union(',
  '      translate([KNUCKLE_W / 2, 0, AXIS_Z], cuboid({ size: [KNUCKLE_T, KNUCKLE_W, KNUCKLE_W] })),',
  '      translate([KNUCKLE_W / 2 + 60, 0, AXIS_Z], cuboid({ size: [120, KNUCKLE_W, 10] }))),',
  '    bore(KNUCKLE_W / 2))',
  '',
  '  // 04 hinge pin - passes through both knuckles along AXIS_Z',
  '  const pin = translate([0, 0, AXIS_Z],',
  '    rotateY(Math.PI / 2, cylinder({ radius: PIN_D / 2, height: KNUCKLE_W * 2.5, segments: 24 })))',
  '',
  '  return [plate, fixedKnuckle, arm, pin]',
  '}',
  'module.exports = { main }',
  '',
  '=== OUTPUT ===',
  'Before writing code, silently plan: which part is the ground/mount, what each other part attaches to, and at',
  'what surface. Then output, in this order and nothing else:',
  '',
  '1. The JavaScript code block.',
  '2. A JSON array called materials, each entry with name, quantity and estimated cost in USD.',
  '3. A JSON array called parts, with ONE entry per solid returned by main(), in the same order, each with',
  '   an "index" (0-based, matching the position in the returned array) and a "name".',
  '',
  'MOVABLE PARTS - TAG EVERY PART THAT MOVES, NOT JUST THE OBVIOUS ONE.',
  'Read the brief for any word implying relative motion: slide, telescope, extend, retract, fold, hinge,',
  'swing, rotate, pivot, swivel, tilt, stack, lift off, adjust, drawer, collapse, nest. If ANY appear, the',
  'design has moving parts and they must be tagged. Go through the returned array one entry at a time and',
  'ask: can this part change position relative to the part below it in the assembly? If yes, tag it.',
  '',
  'Two motion types. Give each movable part exactly one:',
  '',
  '  "motion": "slide"  - straight-line travel.',
  '     "axis": "x"|"y"|"z", "min"/"max" in MILLIMETRES relative to the assembled position (0 = as built).',
  '     Use for telescoping tubes, drawers, rails, carriages, stacking trays lifting off posts.',
  '',
  '  "motion": "rotate" - angular travel.',
  '     "axis": "x"|"y"|"z" (the axis it turns about), "min"/"max" in DEGREES relative to assembled (0 = as built),',
  '     and "pivot": [x, y, z] - the point it turns about, which MUST be the actual hinge/pivot axis',
  '     coordinate you already defined as a const. Without a correct pivot the part swings through',
  '     the rest of the assembly.',
  '     Use for folding arms, hinged legs and lids, pivoting brackets, swivels, latches.',
  '',
  'THREE RULES THAT ARE ROUTINELY MISSED:',
  '  1. CARRIED PARTS INHERIT MOTION. If a part is fastened to a moving part, it travels with it and gets',
  '     the SAME motion, axis and range. A yoke on top of a telescoping inner tube slides with that tube.',
  '     A handle on a drawer front slides with the drawer. A pin through a folding hinge rotates with the arm.',
  '     Tagging the tube but not the yoke it carries is wrong.',
  '  2. EVERY STAGE OF A MULTI-STAGE MECHANISM IS SEPARATE. Three nested tubes give TWO sliding stages',
  '     (middle in outer, inner in middle) - tag both, with the inner one having the larger range because',
  '     it can travel after the middle has already extended. Four trays stacked on posts give three or four',
  '     independently liftable trays. Do not tag only one and call it done.',
  '  3. ONLY GENUINELY GROUNDED PARTS ARE FIXED. A base, wall plate, housing, chassis, welded gusset, or a',
  '     post rigidly rooted in the base gets NO motion keys at all. Everything else is a candidate.',
  '',
  '  4. ONE ASSEMBLY CAN MIX MOTION TYPES. A tripod has legs that ROTATE about hinges, tube sections',
  '     inside those legs that SLIDE, a centre column that SLIDES, and a hub and feet that are FIXED -',
  '     all at once. Decide the motion for each part from how THAT part moves, never apply one motion',
  '     type to the whole design.',
  '  5. REPEATED MECHANISMS ARE TAGGED INDIVIDUALLY. Three identical legs are three separate solids and',
  '     need three separate rotation entries, each with its own pivot on its own hinge axis. Six tube',
  '     sections across three legs need six slide entries. Tagging leg 1 and leaving legs 2 and 3 fixed',
  '     is wrong even though they are geometrically identical.',
  '',
  'If the brief describes motion and you tag nothing, or tag only one part in a multi-stage mechanism,',
  'or tag only the first instance of a repeated mechanism, the answer is incomplete.',
  '',
  'Example - three-tray organiser on fixed posts (every tray lifts off):',
  '[{"index":0,"name":"Base plate"},',
  ' {"index":1,"name":"Spindle post left"},',
  ' {"index":2,"name":"Spindle post right"},',
  ' {"index":3,"name":"Lower tray","motion":"slide","axis":"z","min":0,"max":90},',
  ' {"index":4,"name":"Middle tray","motion":"slide","axis":"z","min":0,"max":120},',
  ' {"index":5,"name":"Upper tray","motion":"slide","axis":"z","min":0,"max":150}]',
  '',
  'Example - telescoping leg (note the yoke inherits the inner tube motion):',
  '[{"index":0,"name":"Outer tube"},',
  ' {"index":1,"name":"Middle tube","motion":"slide","axis":"z","min":0,"max":180},',
  ' {"index":2,"name":"Inner tube","motion":"slide","axis":"z","min":0,"max":340},',
  ' {"index":3,"name":"Foot"},',
  ' {"index":4,"name":"Top yoke","motion":"slide","axis":"z","min":0,"max":340}]',
  '',
  'Example - folding bracket hinged at z = 44 about the Y axis:',
  '[{"index":0,"name":"Wall plate"},',
  ' {"index":1,"name":"Fixed knuckle"},',
  ' {"index":2,"name":"Folding arm","motion":"rotate","axis":"y","min":0,"max":90,"pivot":[0,0,44]},',
  ' {"index":3,"name":"Hinge pin","motion":"rotate","axis":"y","min":0,"max":90,"pivot":[0,0,44]}]',
  '',
  'No explanation before or after.',
  '=== REMINDER: THE THREE BLOCKS ===',
  'Output the ```js code block, then the ```json materials array, then the ```json parts array.',
  'All three, every time. A reply with only code is incomplete.',
].join('\n')

async function chat(messages, apiKey, model = MODEL) {
  const response = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model, messages }),
  })
  const status = response.status

  if (!response.ok) {
    const detail = await response.text().catch(() => '')
    let message = `${status} ${response.statusText}`
    try {
      const parsed = JSON.parse(detail)
      if (parsed.error) message = typeof parsed.error === 'string' ? parsed.error : parsed.error.message
    } catch {
      if (detail) message = detail.slice(0, 300)
    }
    throw apiError(message, status, detail)
  }

  const body = await response.text()
  let data
  try {
    data = JSON.parse(body)
  } catch {
    throw apiError('Grok returned a response that was not JSON.', status, body)
  }

  const content = data?.choices?.[0]?.message?.content
  if (!content) throw apiError('Grok returned no content.', status, body)
  return { content, status }
}

/**
 * Generates a model. `history` carries prior turns so Refine can build on the
 * previous design instead of starting over.
 */
/**
 * One corrective turn: the model sees its own reply plus measured defect data,
 * and returns a full replacement.
 */
export async function requestCorrection({ brief, history = [], reply, feedback, apiKey = import.meta.env?.VITE_XAI_API_KEY }) {
  if (!apiKey) throw apiError('No xAI API key.', null)
  return chat([
    { role: 'system', content: DESIGN_SYSTEM_PROMPT },
    ...history,
    { role: 'user', content: brief },
    { role: 'assistant', content: reply },
    { role: 'user', content: feedback },
  ], apiKey)
}

// grok-3 is an alias that the API serves with grok-4.3, which accepts images,
// so the same model handles both generation and visual critique.
export const VISION_MODEL = 'grok-4.3'

/**
 * Visual critique turn: the model sees renders of the geometry its own code
 * produced, plus the measured connectivity report, and either confirms the build
 * or returns corrected code.
 */
export async function requestCritique({ brief, reply, images, feedback, apiKey = import.meta.env?.VITE_XAI_API_KEY }) {
  if (!apiKey) throw apiError('No xAI API key.', null)
  const content = [{ type: 'text', text: feedback }]
  for (const image of images) {
    content.push({ type: 'image_url', image_url: { url: image.dataUrl, detail: 'high' } })
  }
  return chat([
    { role: 'system', content: DESIGN_SYSTEM_PROMPT },
    { role: 'user', content: brief },
    { role: 'assistant', content: reply },
    { role: 'user', content },
  ], apiKey, VISION_MODEL)
}

/**
 * Repair call: asks ONLY for the materials and parts arrays for code that was
 * already produced. Cheap, and it means a reply that omitted them does not cost
 * the user a populated bill of materials or their part sliders.
 */
export async function requestMetadata({ brief, reply, solidCount, apiKey = import.meta.env?.VITE_XAI_API_KEY }) {
  if (!apiKey) throw apiError('No xAI API key.', null)
  const ask = [
    'Your previous reply contained the code block but omitted the materials and parts arrays.',
    `The code returns ${solidCount} solids from main().`,
    '',
    'Reply with EXACTLY two ```json blocks and no other text:',
    '  1. materials - an array of { name, quantity, estimated_cost } for the parts and fasteners this design needs.',
    `  2. parts - exactly ${solidCount} entries, one per returned solid in order, each { index, name }.`,
    '     For EVERY part that can move relative to the assembly, also add either',
    '       { "motion":"slide", "axis":"x|y|z", "min":mm, "max":mm } or',
    '       { "motion":"rotate", "axis":"x|y|z", "min":deg, "max":deg, "pivot":[x,y,z] }.',
    '     Include parts carried by a moving part - they inherit its motion, axis and range.',
    '     Tag every stage of a multi-stage mechanism separately. Only genuinely grounded parts',
    '     (base, housing, wall plate, welded joints) get no motion keys.',
    'Do not restate the code.',
  ].join('\n')
  return chat([
    { role: 'system', content: DESIGN_SYSTEM_PROMPT },
    { role: 'user', content: brief },
    { role: 'assistant', content: reply },
    { role: 'user', content: ask },
  ], apiKey)
}

/**
 * Cheap first pass: list every distinct physical component the brief names, and
 * assign each to the repeated sub-assembly or to the shared/singular structure.
 * The model does the reading; nothing about specific component types is encoded
 * here, so this works for any brief.
 */
export async function requestInventory({ brief, repeatedNoun, count, apiKey = import.meta.env?.VITE_XAI_API_KEY }) {
  if (!apiKey) throw apiError('No xAI API key.', null)
  const ask = [
    'Read this design brief and list every distinct physical component or feature it names.',
    '',
    `BRIEF: ${brief}`,
    '',
    `The design has ${count} repeated "${repeatedNoun}" sub-assemblies arranged around a shared central structure.`,
    'Split the components into two groups:',
    `  "repeated" - components that belong to EACH ${repeatedNoun} (they will be built once and copied ${count}x)`,
    '  "shared"   - singular components that exist ONCE for the whole design: the central structure itself,',
    '               plus any other one-off part such as a column, platform, motor housing, wheel, cap,',
    '               turntable, handle or mounting feature the brief mentions.',
    '',
    'Every component named in the brief must appear in exactly one group. Do not invent components that',
    'are not in the brief, and do not omit any that are.',
    '',
    'Reply with ONE ```json block and no other text:',
    '{ "repeated": { "name": "<the repeated element>", "count": <n>, "components": ["...", "..."] },',
    '  "shared": ["...", "..."] }',
  ].join('\n')
  return chat([{ role: 'user', content: ask }], apiKey)
}

export async function requestDesign({ brief, history = [], apiKey = import.meta.env?.VITE_XAI_API_KEY }) {
  if (!apiKey) throw apiError('No xAI API key. Set VITE_XAI_API_KEY in your .env and restart the dev server.', null)
  return chat([{ role: 'system', content: DESIGN_SYSTEM_PROMPT }, ...history, { role: 'user', content: brief }], apiKey)
}

const PROMPT =
  'Give this engineering project a short 4-6 word title. Reply with only the title, no punctuation, no explanation: '

export const fallbackName = (description) => (description || '').trim().slice(0, 40)

// Models sometimes wrap the title in quotes or add a trailing period despite the prompt.
function tidy(title) {
  return title
    .replace(/^["'`\s]+|["'`\s.]+$/g, '')
    .replace(/\s+/g, ' ')
    .slice(0, 80)
}

export async function generateProjectName(description, apiKey = import.meta.env?.VITE_XAI_API_KEY) {
  const fallback = fallbackName(description)
  if (!apiKey) {
    console.log('[grok] no API key set, using fallback name')
    return fallback
  }

  try {
    const response = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'grok-3',
        messages: [{ role: 'user', content: PROMPT + description }],
      }),
    })

    if (!response.ok) {
      const detail = await response.text().catch(() => '')
      throw new Error(`${response.status} ${detail.slice(0, 200)}`)
    }

    const data = await response.json()
    const title = tidy(data?.choices?.[0]?.message?.content ?? '')
    if (!title) throw new Error('empty title in response')

    console.log('[grok] generated title:', title)
    return title
  } catch (error) {
    console.log('[grok] title generation failed, using fallback:', error.message)
    return fallback
  }
}
