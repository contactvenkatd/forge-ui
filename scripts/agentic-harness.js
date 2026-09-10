import { runAgenticDesign } from '../src/agenticDesign.js'
import { renderPreviews } from '../src/renderPreview.js'
import { evaluateReply } from '../src/assemblyCorrection.js'
import { requestDesign } from '../src/grok.js'

window.__singleShot = async (brief, apiKey) => {
  const { content } = await requestDesign({ brief, apiKey })
  const r = evaluateReply(content)
  return r.ok ? { ok: true, floating: r.floating, parts: r.assembly.parts } : { ok: false, error: r.error }
}

window.__agentic = async (brief, apiKey) => {
  const phases = []
  const { chosen, iterations } = await runAgenticDesign({
    brief, apiKey,
    render: (solids) => renderPreviews(solids, { width: 640, height: 480 }),
    onPhase: (p) => phases.push(p),
  })
  if (!chosen.ok) return { ok: false, error: chosen.error }
  return {
    ok: true,
    // what actually reaches the UI after the loop finishes
    finalMaterials: chosen.materials?.length ?? 0,
    finalParts: chosen.parts?.length ?? 0,
    finalMovable: (chosen.parts ?? []).filter((p) => p.axis).length,
    finalSolids: chosen.solids.length,
    correctionApplied: iterations.some((i) => i.round > 0 && i.applied),
    carried: iterations.filter((i) => i.carriedMaterials || i.carriedParts).length,
    metadataRepaired: Boolean(iterations[0]?.metadataRepaired),
    first: { floating: iterations[0].floating, parts: iterations[0].parts },
    final: { floating: chosen.floating, parts: chosen.assembly.parts },
    rounds: iterations.length - 1,
    verdicts: iterations.slice(1).map((i) => i.verdict ?? (i.error ? 'ERR' : '?')),
    imageBytes: iterations.find((i) => i.images?.length)?.images?.[0]?.dataUrl?.length ?? 0,
    phases: [...new Set(phases)],
  }
}
// Full pipeline on one brief, reporting multi-mechanism specifics.
window.__tripod = async (brief, apiKey) => {
  const { runAgenticDesign } = await import('/src/agenticDesign.js')
  const { renderPreviews } = await import('/src/renderPreview.js')
  const { analyzeAssembly } = await import('/src/assemblyCheck.js')
  const { checkMotionCoverage } = await import('/src/motionCheck.js')

  const { chosen, iterations } = await runAgenticDesign({
    brief, apiKey, render: (s) => renderPreviews(s, { width: 640, height: 480 }),
  })
  if (!chosen.ok) return { ok: false, error: chosen.error }

  const firstSolids = iterations[0].parts
  const a = analyzeAssembly(chosen.solids)
  const m = checkMotionCoverage(brief, chosen.parts ?? [])

  // Structural hub detection: the part in contact with the most others.
  const degree = new Map()
  for (const [i, j] of a.contactPairs ?? []) {
    degree.set(i, (degree.get(i) ?? 0) + 1)
    degree.set(j, (degree.get(j) ?? 0) + 1)
  }
  let hub = -1, hubDegree = 0
  for (const [idx, d] of degree) if (d > hubDegree) { hubDegree = d; hub = idx }
  const hubNeighbours = (a.contactPairs ?? []).filter(([i, j]) => i === hub || j === hub).map(([i, j]) => (i === hub ? j : i))

  return {
    ok: true,
    solids: chosen.solids.length,
    parts: (chosen.parts ?? []).length,
    materials: (chosen.materials ?? []).length,
    rotate: m.byMotion.rotate,
    slide: m.byMotion.slide,
    tagged: m.tagged,
    firstFloating: iterations[0].floating,
    floating: chosen.floating,
    rounds: iterations.length - 1,
    corrected: iterations.some((i) => i.round > 0 && i.applied),
    hub, hubDegree, hubNeighbours: hubNeighbours.length,
    contactPairs: (a.contactPairs ?? []).length,
    pivots: (chosen.parts ?? []).filter((p) => p.motion === 'rotate' && p.pivot)
      .map((p) => p.pivot.map((n) => Math.round(n)).join(',')),
  }
}

// Generic structural-plausibility run, reporting both critique categories.
window.__structural = async (brief, apiKey) => {
  const { runAgenticDesign } = await import('/src/agenticDesign.js')
  const { renderPreviews } = await import('/src/renderPreview.js')
  const { extractObjectType } = await import('/src/objectType.js')
  const { chosen, iterations } = await runAgenticDesign({
    brief, apiKey, render: (s) => renderPreviews(s, { width: 640, height: 480 }),
  })
  if (!chosen.ok) return { ok: false, error: chosen.error }
  const rounds = iterations.filter((i) => i.round > 0)
  return {
    ok: true,
    objectType: extractObjectType(brief),
    firstCode: iterations[0].code,
    finalCode: chosen.code,
    firstFloating: iterations[0].floating,
    floating: chosen.floating,
    rounds: rounds.length,
    corrected: rounds.some((r) => r.applied),
    structural: rounds.flatMap((r) => r.findings?.structural ?? []),
    connectivity: rounds.flatMap((r) => r.findings?.connectivity ?? []),
    verdicts: rounds.map((r) => r.verdict ?? 'ERR'),
    parts: (chosen.parts ?? []).length,
  }
}

window.__severity = async (brief, apiKey) => {
  const { runAgenticDesign, severityOf } = await import('/src/agenticDesign.js')
  const { renderPreviews } = await import('/src/renderPreview.js')
  const r = await runAgenticDesign({
    brief, apiKey, render: (s) => renderPreviews(s, { width: 640, height: 480 }),
  })
  if (!r.chosen.ok) return { ok: false, error: r.chosen.error }
  const gen = r.iterations.filter((i) => i.regeneration)
  return {
    ok: true,
    firstFloating: r.iterations[0].floating,
    firstParts: r.iterations[0].parts,
    firstSeverity: r.iterations[0].severity,
    regenerations: r.regenerations,
    regenAccepted: gen.filter((g) => g.applied).length,
    regenSeverities: gen.map((g) => g.severity),
    rounds: r.iterations.filter((i) => i.round > 0).length,
    finalFloating: r.chosen.floating,
    finalParts: r.chosen.assembly.parts,
    severity: r.severity,
    severeUnresolved: r.severeUnresolved,
  }
}

window.__strategy = async (brief, apiKey) => {
  const { runAgenticDesign } = await import('/src/agenticDesign.js')
  const { renderPreviews } = await import('/src/renderPreview.js')
  const t0 = performance.now()
  let calls = 0
  const origFetch = window.fetch
  window.fetch = (...a) => { if (String(a[0]).includes('api.x.ai')) calls += 1; return origFetch(...a) }
  try {
    const r = await runAgenticDesign({
      brief, apiKey, render: (s) => renderPreviews(s, { width: 640, height: 480 }),
    })
    if (!r.chosen.ok) return { ok: false, error: r.chosen.error, strategy: r.strategy }
    return {
      ok: true,
      strategy: r.strategy,
      fallbackReason: r.fallbackReason ?? '',
      solids: r.chosen.solids.length,
      parts: (r.chosen.parts ?? []).length,
      materials: (r.chosen.materials ?? []).length,
      rotate: r.motion?.byMotion?.rotate ?? 0,
      slide: r.motion?.byMotion?.slide ?? 0,
      floating: r.chosen.floating,
      totalParts: r.chosen.assembly.parts,
      severity: r.severity,
      severeUnresolved: r.severeUnresolved,
      components: r.components?.groups ?? 0,
      apiCalls: calls,
      seconds: Math.round((performance.now() - t0) / 1000),
      stages: (r.stages ?? []).map((s) => s.stage),
      audit: r.audit ? { total: r.audit.total, expected: r.audit.expected, ok: r.audit.ok,
        unexplained: r.audit.unexplained.length, hub: r.audit.hubSolidCount, unit: r.audit.unitSolidCount, count: r.audit.count } : null,
      missingComponents: r.componentAudit?.missing ?? [],
      weak: (r.weak ?? []).map((w) => w.name),
    }
  } finally { window.fetch = origFetch }
}

// Decomposition only, with the inventory feature switchable for A/B.
window.__inventory = async (brief, apiKey, useInventory) => {
  const { runDecomposedDesign } = await import('/src/decomposedDesign.js')
  const { auditInventory, extractInventoryHeuristic } = await import('/src/inventory.js')
  const { analyseComplexity } = await import('/src/complexity.js')
  const t0 = performance.now()
  let calls = 0
  const of = window.fetch
  window.fetch = (...a) => { if (String(a[0]).includes('api.x.ai')) calls += 1; return of(...a) }
  try {
    const r = await runDecomposedDesign({ brief, apiKey, useInventory })
    if (!r.ok) return { ok: false, reason: r.reason, apiCalls: calls, seconds: Math.round((performance.now()-t0)/1000) }
    // Both arms are scored against the SAME yardstick - an inventory read from
    // the brief - so the comparison measures the checklist, not the scoring.
    const { requestInventory } = await import('/src/grok.js')
    const { normaliseInventory } = await import('/src/inventory.js')
    const { readFences } = await import('/src/designParser.js')
    const c = analyseComplexity(brief)
    let yardstick = r.inventory
    if (!yardstick?.all?.length) {
      try {
        const { content } = await requestInventory({ brief, repeatedNoun: c.noun, count: c.count, apiKey })
        const f = readFences(content).find((x) => x.lang === 'json') ?? readFences(content)[0]
        yardstick = normaliseInventory(JSON.parse(f ? f.body : content), { repeatedNoun: c.noun, count: c.count })
      } catch { yardstick = extractInventoryHeuristic(brief, { repeatedNoun: c.noun, count: c.count }) }
    }
    const scored = auditInventory(yardstick, r.chosen.parts)
    return {
      ok: true,
      solids: r.chosen.solids.length,
      floating: r.chosen.floating,
      inventoryItems: yardstick.all.length,
      missing: scored.missing,
      complete: scored.ok,
      repairs: (r.stages ?? []).filter((s) => s.stage === 'component-repair').length,
      apiCalls: calls,
      seconds: Math.round((performance.now()-t0)/1000),
    }
  } finally { window.fetch = of }
}

window.__ready = true
