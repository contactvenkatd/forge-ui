import * as modelingNamespace from '@jscad/modeling'

const unwrap = (namespace, probe) => (namespace?.[probe] ? namespace : namespace?.default ?? namespace)
const modeling = unwrap(modelingNamespace, 'primitives')

export const MIN_DIMENSION = 0.1
const FAILED = Symbol('forge.failedGeometry')
const MAX_WARNINGS = 60

// ---------------------------------------------------------------------------
// Build report: collected while the generated code runs.
// ---------------------------------------------------------------------------
let report = null

export function beginReport() {
  report = { warnings: [], clamped: 0, skipped: 0 }
  return report
}
export function endReport() {
  const finished = report
  report = null
  return finished ?? { warnings: [], clamped: 0, skipped: 0 }
}
function note(kind, message) {
  if (!report) return
  if (kind === 'clamp') report.clamped += 1
  if (kind === 'skip') report.skipped += 1
  if (report.warnings.length < MAX_WARNINGS && !report.warnings.includes(message)) {
    report.warnings.push(message)
  }
}

// ---------------------------------------------------------------------------
// A placeholder returned instead of throwing. It is a real (tiny) solid, so it
// can flow through later operations without producing null-dereference errors,
// and it is tagged so top-level parts made only of placeholders are dropped.
// ---------------------------------------------------------------------------
function placeholder() {
  try {
    const solid = modeling.primitives.cuboid({ size: [0.01, 0.01, 0.01] })
    Object.defineProperty(solid, FAILED, { value: true, enumerable: false })
    return solid
  } catch {
    return null
  }
}
export const isPlaceholder = (value) => Boolean(value && value[FAILED])

export const isGeometry = (value) =>
  Boolean(value) && typeof value === 'object' &&
  (Array.isArray(value.polygons) || Array.isArray(value.sides) || Array.isArray(value.points))

// ---------------------------------------------------------------------------
// Dimension sanitising
// ---------------------------------------------------------------------------
const finite = (value) => typeof value === 'number' && Number.isFinite(value)

function clampScalar(name, key, value) {
  if (!finite(value)) {
    note('clamp', `${name}: ${key} was not a number, using ${MIN_DIMENSION}mm`)
    return MIN_DIMENSION
  }
  if (value < MIN_DIMENSION) {
    note('clamp', `${name}: ${key} was ${value}, clamped to ${MIN_DIMENSION}mm`)
    return MIN_DIMENSION
  }
  return value
}

function clampVector(name, key, value) {
  if (!Array.isArray(value)) return clampScalar(name, key, value)
  return value.map((component, i) => clampScalar(name, `${key}[${i}]`, component))
}

/** Largest rounding radius a shape can take before its faces collapse. */
function maxRoundRadius(options) {
  const candidates = []
  if (Array.isArray(options.size)) candidates.push(Math.min(...options.size.map(Math.abs)) / 2)
  if (finite(options.height)) candidates.push(Math.abs(options.height) / 2)
  if (finite(options.radius)) candidates.push(Math.abs(options.radius))
  if (Array.isArray(options.radius)) candidates.push(Math.min(...options.radius.map(Math.abs)))
  return candidates.length ? Math.min(...candidates) : Infinity
}

const SIZE_KEYS = ['size', 'radius', 'height', 'width', 'length', 'depth', 'outerRadius', 'innerRadius']
const ROUND_KEYS = ['roundRadius', 'cornerRadius', 'fillet', 'chamfer']

export function sanitizeOptions(name, options) {
  if (!options || typeof options !== 'object' || Array.isArray(options)) return options
  const safe = { ...options }

  for (const key of SIZE_KEYS) {
    if (safe[key] !== undefined) safe[key] = clampVector(name, key, safe[key])
  }

  if (safe.segments !== undefined) {
    const segments = Math.floor(Number(safe.segments))
    safe.segments = Number.isFinite(segments) && segments >= 3 ? segments : 32
    if (safe.segments !== options.segments) note('clamp', `${name}: segments adjusted to ${safe.segments}`)
  }

  // Rounding must stay strictly inside the shape or the boolean core throws.
  for (const key of ROUND_KEYS) {
    if (safe[key] === undefined) continue
    const limit = maxRoundRadius(safe) * 0.9
    const value = Number(safe[key])
    if (!finite(value) || value <= 0) {
      note('clamp', `${name}: ${key} was ${safe[key]}, removed`)
      delete safe[key]
    } else if (value > limit) {
      note('clamp', `${name}: ${key} ${value}mm exceeds the shape, clamped to ${limit.toFixed(2)}mm`)
      safe[key] = limit
    }
  }
  return safe
}

// ---------------------------------------------------------------------------
// Wrappers
// ---------------------------------------------------------------------------
function wrapPrimitive(name, fn) {
  return (options, ...rest) => {
    try {
      return fn(sanitizeOptions(name, options), ...rest)
    } catch (error) {
      note('skip', `${name}() could not be built (${error.message}), placeholder used`)
      return placeholder()
    }
  }
}

function wrapBoolean(name, fn) {
  return (...args) => {
    const flat = args.flat(Infinity)
    const valid = flat.filter((v) => isGeometry(v) && !isPlaceholder(v))
    const dropped = flat.length - valid.length
    if (dropped > 0) note('skip', `${name}(): skipped ${dropped} invalid argument${dropped === 1 ? '' : 's'}`)

    if (valid.length === 0) {
      note('skip', `${name}(): no valid geometry, operation skipped`)
      return placeholder()
    }
    // One operand left: the operation is meaningless, so pass it straight through
    // rather than losing the part.
    if (valid.length === 1) return valid[0]

    try {
      return fn(...valid)
    } catch (error) {
      note('skip', `${name}() failed (${error.message}), keeping the first operand`)
      return valid[0]
    }
  }
}

function wrapTransform(name, fn) {
  return (...args) => {
    const geometry = args.filter(isGeometry).pop()
    if (!geometry) {
      note('skip', `${name}(): no geometry to transform, skipped`)
      return placeholder()
    }
    const safe = args.map((arg) => (Array.isArray(arg) ? arg.map((n) => (finite(n) ? n : 0)) : arg))
    try {
      return fn(...safe)
    } catch (error) {
      note('skip', `${name}() failed (${error.message}), geometry left untransformed`)
      return geometry
    }
  }
}

function wrapGeneric(name, fn) {
  return (...args) => {
    try {
      const options = args[0]
      const safe = options && typeof options === 'object' && !Array.isArray(options) && !isGeometry(options)
        ? [sanitizeOptions(name, options), ...args.slice(1)]
        : args
      return fn(...safe)
    } catch (error) {
      note('skip', `${name}() failed (${error.message}), skipped`)
      return args.find(isGeometry) ?? placeholder()
    }
  }
}

const BOOLEAN_NAMES = new Set(['union', 'subtract', 'intersect', 'scission'])
const TRANSFORM_NAMES = new Set([
  'translate', 'translateX', 'translateY', 'translateZ', 'rotate', 'rotateX', 'rotateY', 'rotateZ',
  'scale', 'scaleX', 'scaleY', 'scaleZ', 'mirror', 'mirrorX', 'mirrorY', 'mirrorZ', 'center',
  'centerX', 'centerY', 'centerZ', 'align', 'transform',
])
// Namespaces that answer questions rather than produce geometry: a failure there
// must not turn into a placeholder solid.
const QUERY_GROUPS = new Set(['measurements', 'maths', 'geometries', 'utils', 'curves'])

function wrapQuery(name, fn) {
  return (...args) => {
    try {
      return fn(...args)
    } catch (error) {
      note('skip', `${name}() could not be evaluated (${error.message})`)
      return undefined
    }
  }
}

function guardFunction(group, name, fn, primitiveNames) {
  if (QUERY_GROUPS.has(group)) return wrapQuery(name, fn)
  if (BOOLEAN_NAMES.has(name)) return wrapBoolean(name, fn)
  if (TRANSFORM_NAMES.has(name)) return wrapTransform(name, fn)
  if (primitiveNames.has(name) || group === 'primitives') return wrapPrimitive(name, fn)
  return wrapGeneric(name, fn)
}

/**
 * Produces a fully guarded copy of the modeling library: every namespace object
 * is rebuilt with guarded members, then the geometry-producing namespaces are
 * flattened onto the root so root-level destructuring also gets guarded versions.
 */
export function buildGuardedShim(modeling, flattenGroups) {
  const primitiveNames = new Set(Object.keys(modeling.primitives ?? {}))
  const guarded = {}

  for (const [group, namespace] of Object.entries(modeling)) {
    if (!namespace || typeof namespace !== 'object' || Array.isArray(namespace)) {
      guarded[group] = typeof namespace === 'function'
        ? guardFunction('', group, namespace, primitiveNames)
        : namespace
      continue
    }
    guarded[group] = Object.fromEntries(
      Object.entries(namespace).map(([name, value]) => [
        name,
        typeof value === 'function' ? guardFunction(group, name, value, primitiveNames) : value,
      ]),
    )
  }

  for (const group of flattenGroups) {
    const namespace = guarded[group]
    if (!namespace || typeof namespace !== 'object') continue
    for (const [name, value] of Object.entries(namespace)) {
      if (!(name in guarded)) guarded[name] = value
    }
  }
  return guarded
}

/** Stand-in for a helper the generated code referenced but that does not exist. */
export function missingHelper(name) {
  return (...args) => {
    note('skip', `"${name}" is not a JSCAD function; that step was skipped`)
    return args.find(isGeometry) ?? placeholder()
  }
}
