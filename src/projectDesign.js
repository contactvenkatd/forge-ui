import { buildModel, buildWarning } from './jscadRuntime'
import { normaliseMaterials, normalisePartMeta } from './designParser'

const CORRUPT = "This project's data is corrupted and cannot be opened."
const NO_MODEL = 'This project was saved before models were stored, so it has no geometry.'

const empty = (error) => ({ code: '', materials: [], solids: null, error })

/**
 * Rebuilds a saved project's design from its `result` column.
 * Every failure mode returns a message rather than throwing: a malformed row must
 * never take the viewer down with it.
 */
export function designFromProject(project) {
  if (!project || typeof project !== 'object') return empty('No project selected.')

  let payload = project.result
  if (payload === null || payload === undefined || payload === '') return empty(NO_MODEL)

  if (typeof payload === 'string') {
    try {
      payload = JSON.parse(payload)
    } catch {
      return empty(NO_MODEL)
    }
  }

  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return empty(CORRUPT)

  // Re-normalise from the raw array when it is present, so parser improvements
  // retroactively apply to rows saved by older builds.
  let materials = []
  try {
    materials = Array.isArray(payload.materialsRaw) && payload.materialsRaw.length
      ? normaliseMaterials(payload.materialsRaw)
      : normaliseMaterials(payload.materials)
  } catch {
    materials = []
  }

  const parts = normalisePartMeta(payload.parts)
  const code = typeof payload.code === 'string' ? payload.code.trim() : ''
  if (!code) {
    return { code: '', materials, parts, solids: null, error: materials.length ? NO_MODEL : CORRUPT }
  }

  try {
    const built = buildModel(code)
    return { code, materials, parts, solids: built.solids, note: buildWarning(built.report), error: '' }
  } catch (cause) {
    // Keep the materials: the bill of materials is still useful on its own.
    return { code, materials, parts, solids: null, error: `This project's model could not be rebuilt: ${cause.message}` }
  }
}
