import * as modelingNamespace from '@jscad/modeling'
import {
  beginReport, buildGuardedShim, endReport, isGeometry, isPlaceholder, missingHelper,
} from './jscadGuards.js'

// @jscad/modeling is CommonJS. Node ESM and Vite's pre-bundler disagree about
// whether the real object lands on the namespace or on `.default`, so unwrap.
const unwrap = (namespace, probe) => (namespace?.[probe] ? namespace : namespace?.default ?? namespace)
const jscadModeling = unwrap(modelingNamespace, 'primitives')

// Generated code very often destructures helpers straight off the module root -
// `const { translate } = require('@jscad/modeling')` - but in JSCAD v2 they live
// in sub-namespaces, so that yields undefined and "translate is not a function".
// This flattens the sub-namespaces onto a copy of the root. Real root exports
// always win, so nothing is shadowed; order settles collisions between groups.
const FLATTENED_GROUPS = [
  'primitives', 'booleans', 'transforms', 'extrusions', 'expansions',
  'hulls', 'measurements', 'modifiers', 'colors', 'text', 'geometries', 'maths', 'utils', 'curves',
]

function buildModelingShim(modeling) {
  const shim = { ...modeling }
  for (const group of FLATTENED_GROUPS) {
    const namespace = modeling[group]
    if (!namespace || typeof namespace !== 'object') continue
    for (const [name, value] of Object.entries(namespace)) {
      if (!(name in shim)) shim[name] = value
    }
  }
  return shim
}

const modelingShim = buildModelingShim(jscadModeling)

// Every helper the generated code can reach - namespaces included - wrapped so
// bad arguments degrade into a warning rather than an exception.
const guardedShim = buildGuardedShim(jscadModeling, FLATTENED_GROUPS)

// Helper names injected into the generated code's scope, so a model that calls
// union(...) without destructuring it still runs. The code body is wrapped in an
// inner function, so its own `const { union } = booleans` shadows these rather
// than colliding with them.
const RESERVED = new Set(['require', 'module', 'exports', 'main', 'arguments', 'eval', 'this'])

// Reserved words cannot be parameter names, and bundler interop adds some (Vite
// attaches `default` to the namespace). Rather than maintain a keyword list,
// ask the engine whether each name is actually usable as a parameter.
const isUsableParameterName = (name) => {
  if (!/^[A-Za-z_$][\w$]*$/.test(name) || RESERVED.has(name)) return false
  try {
    // eslint-disable-next-line no-new-func
    new Function(name, 'return 0')
    return true
  } catch {
    return false
  }
}

const INJECTED_NAMES = Object.keys(modelingShim).filter(isUsableParameterName)
const INJECTED_VALUES = INJECTED_NAMES.map((name) => modelingShim[name])

// The generated code is written against JSCAD's CommonJS shape, so give it a
// `require` that only ever resolves the modeling library, plus module/exports.
function shimRequire(name) {
  const normalised = String(name).replace(/\\/g, '/').toLowerCase()
  if (normalised === 'jscad' || normalised.startsWith('@jscad/modeling')) {
    // A deep path such as '@jscad/modeling/src/operations/transforms' resolves to
    // that namespace when it exists, and to the flattened root otherwise.
    const segments = normalised.split('/').filter(Boolean)
    const last = segments[segments.length - 1]
    if (last && guardedShim[last] && typeof guardedShim[last] === 'object') return guardedShim[last]
    return guardedShim
  }
  throw new Error(`the generated model tried to require "${name}", which is not available`)
}

const TRANSFORM_HINTS = {
  translate: 'translate([x, y, z], geometry)',
  translateX: 'translateX(offset, geometry)',
  translateY: 'translateY(offset, geometry)',
  translateZ: 'translateZ(offset, geometry)',
  rotate: 'rotate([x, y, z], geometry)',
  rotateX: 'rotateX(radians, geometry)',
  rotateY: 'rotateY(radians, geometry)',
  rotateZ: 'rotateZ(radians, geometry)',
  scale: 'scale([x, y, z], geometry)',
  mirror: 'mirror({ normal: [x, y, z] }, geometry)',
  center: 'center({ axes: [true, true, true] }, geometry)',
  align: 'align({ modes: [...] }, geometry)',
  union: 'union(a, b)',
  subtract: 'subtract(a, b)',
  intersect: 'intersect(a, b)',
  colorize: 'colorize([r, g, b], geometry)',
  extrudeLinear: 'extrudeLinear({ height }, geometry)',
  hull: 'hull(a, b)',
}

/** Finds the first line of the generated source that mentions `needle`. */
function locateInCode(code, needle) {
  const lines = String(code).split('\n')
  const pattern = new RegExp(`\\b${needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`)
  for (let i = 0; i < lines.length; i += 1) {
    if (pattern.test(lines[i])) return { line: i + 1, text: lines[i].trim() }
  }
  return null
}

/**
 * Turns a raw execution failure into something actionable: which line, which
 * call, and the correct JSCAD v2 form - rather than a bare "not a function".
 */
export function describeExecutionError(error, code) {
  const message = error?.message ?? String(error)

  // "solid.translate is not a function" - method chaining, which JSCAD v2 lacks.
  const chained = message.match(/([A-Za-z_$][\w$]*)\.([A-Za-z_$][\w$]*) is not a function/)
  if (chained) {
    const [, receiver, method] = chained
    const where = locateInCode(code, `${receiver}.${method}`) ?? locateInCode(code, method)
    const correct = TRANSFORM_HINTS[method] ?? `${method}(..., geometry)`
    return (
      `JSCAD v2 has no method chaining, so ${receiver}.${method}(...) does not exist. ` +
      `Use ${correct} instead` +
      (where ? `. Line ${where.line}: ${where.text}` : '.')
    )
  }

  // "translate is not a function" - destructured from the wrong namespace.
  const bare = message.match(/^([A-Za-z_$][\w$]*) is not a function/)
  if (bare) {
    const [, name] = bare
    const where = locateInCode(code, name)
    const group = FLATTENED_GROUPS.find((g) => jscadModeling[g] && name in jscadModeling[g])
    const correct = TRANSFORM_HINTS[name]
    return (
      `"${name}" is not a function here` +
      (group ? `. In JSCAD v2 it lives in ${group}: const { ${group} } = require('@jscad/modeling')` : '') +
      (correct ? `, called as ${correct}` : '') +
      (where ? `. Line ${where.line}: ${where.text}` : '.')
    )
  }

  // "union is not defined" - never imported at all.
  const undef = message.match(/^([A-Za-z_$][\w$]*) is not defined/)
  if (undef) {
    const [, name] = undef
    const where = locateInCode(code, name)
    const group = FLATTENED_GROUPS.find((g) => jscadModeling[g] && name in jscadModeling[g])
    return (
      `"${name}" was used but never imported` +
      (group ? `. It lives in ${group}: const { ${name} } = require('@jscad/modeling').${group}` : '') +
      (where ? `. Line ${where.line}: ${where.text}` : '.')
    )
  }

  return message
}

/**
 * Executes generated JSCAD source.
 * Returns every solid that could be built plus a report of what was clamped or
 * skipped. Only throws when nothing at all could be produced.
 */
export function buildModel(code) {
  if (!code || !code.trim()) throw new Error('No model code was returned.')

  const report = beginReport()
  try {
    const module = { exports: {} }

    // `with` over a Proxy means every identifier in the generated code resolves
    // here: known helpers get their guarded version, real globals (Math, Number)
    // pass through, and anything else becomes a no-op that records a warning -
    // so one bad reference skips a step instead of killing the build.
    const scopeTarget = { ...guardedShim, require: shimRequire, module, exports: module.exports }
    const missingCache = new Map()
    const scope = new Proxy(scopeTarget, {
      has: () => true,
      get(target, property) {
        if (property === Symbol.unscopables) return undefined
        if (property in target) return target[property]
        if (typeof property === 'string' && property in globalThis) return globalThis[property]
        const name = String(property)
        if (!missingCache.has(name)) missingCache.set(name, missingHelper(name))
        return missingCache.get(name)
      },
    })

    let factory
    try {
      factory = new Function('__scope', `with (__scope) {\n${code}\n;return typeof main !== 'undefined' ? main : (module.exports && (module.exports.main || module.exports));\n}`)
    } catch (error) {
      throw new Error(`The generated code is not valid JavaScript: ${error.message}`)
    }

    let entry
    try {
      entry = factory(scope)
    } catch (error) {
      throw new Error(`The generated code failed to load: ${describeExecutionError(error, code)}`)
    }

    let output
    try {
      output = typeof entry === 'function' ? entry() : entry
    } catch (error) {
      throw new Error(`The model failed to build: ${describeExecutionError(error, code)}`)
    }

    const flattened = (Array.isArray(output) ? output : [output]).flat(Infinity)
    const totalParts = flattened.length
    const solids = flattened.filter((value) => isGeometry(value) && !isPlaceholder(value))
    const failedParts = Math.max(totalParts - solids.length, 0)

    if (solids.length === 0) {
      const reason = report.warnings[0] ?? 'the code did not return any geometry'
      throw new Error(`No part of the model could be built - ${reason}`)
    }

    return {
      solids,
      report: { ...endReport(), totalParts, failedParts, builtParts: solids.length },
    }
  } finally {
    endReport()
  }
}

/** Back-compatible: solids only. */
export function runJscad(code) {
  return buildModel(code).solids
}

/** One-line summary of anything that was skipped or clamped, or ''. */
export function buildWarning(report) {
  if (!report) return ''
  const bits = []
  if (report.failedParts > 0) {
    bits.push(`${report.failedParts} of ${report.totalParts} parts could not be built`)
  }
  if (report.skipped > 0) bits.push(`${report.skipped} operation${report.skipped === 1 ? '' : 's'} skipped`)
  if (report.clamped > 0) bits.push(`${report.clamped} dimension${report.clamped === 1 ? '' : 's'} corrected`)
  return bits.join(' · ')
}

export function measureModelSize(solids) {
  const min = [Infinity, Infinity, Infinity]
  const max = [-Infinity, -Infinity, -Infinity]
  for (const solid of solids) {
    const [lo, hi] = jscadModeling.measurements.measureBoundingBox(solid)
    for (let axis = 0; axis < 3; axis += 1) {
      min[axis] = Math.min(min[axis], lo[axis])
      max[axis] = Math.max(max[axis], hi[axis])
    }
  }
  if (!Number.isFinite(min[0])) return null
  return { min, max, size: [max[0] - min[0], max[1] - min[1], max[2] - min[2]] }
}

export function formatDimensions(size, units = 'metric') {
  if (!size) return ''
  if (units === 'imperial') {
    const inches = size.map((n) => (n / 25.4).toFixed(2).replace(/\.?0+$/, ''))
    return `${inches[0]}" × ${inches[1]}" × ${inches[2]}"`
  }
  const mm = size.map((n) => (n >= 10 ? Math.round(n) : Math.round(n * 10) / 10))
  return `${mm[0]}mm × ${mm[1]}mm × ${mm[2]}mm`
}
