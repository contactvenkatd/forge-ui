import { useState } from 'react'
import { ChevronRight } from 'lucide-react'

function Block({ label, value, empty, mono = true }) {
  return (
    <div className="mt-3">
      <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-zinc-600">{label}</p>
      <pre
        className={`mt-1.5 max-h-56 overflow-auto whitespace-pre-wrap break-words border border-white/[0.08] bg-white/[0.015] p-3 text-[11px] leading-5 text-zinc-400 ${
          mono ? 'font-mono' : ''
        }`}
      >
        {value || <span className="text-zinc-600">{empty}</span>}
      </pre>
    </div>
  )
}

function formatTimestamp(iso) {
  if (!iso) return '—'
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

export default function DebugPanel({ debug }) {
  const [open, setOpen] = useState(false)
  const has = Boolean(debug?.timestamp)
  const status = debug?.status
  const statusTone = status == null ? 'text-zinc-600' : status >= 200 && status < 300 ? 'text-emerald-400' : 'text-red-400'

  return (
    <div className="mt-4 border border-white/[0.08]">
      <button
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-white/[0.02]"
      >
        <span className="flex items-center gap-2.5 font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
          <ChevronRight className={`h-3.5 w-3.5 transition-transform ${open ? 'rotate-90' : ''}`} />
          Debug: Raw API response
        </span>
        <span className="flex items-center gap-3 font-mono text-[10px] uppercase tracking-[0.12em]">
          {has ? (
            <>
              <span className={statusTone}>{status ?? 'no response'}</span>
              <span className="text-zinc-600">{formatTimestamp(debug.timestamp)}</span>
            </>
          ) : (
            <span className="text-zinc-700">idle</span>
          )}
        </span>
      </button>

      {open && (
        <div className="border-t border-white/[0.08] px-4 pb-4 pt-3">
          <div className="flex flex-wrap gap-x-6 gap-y-1.5 font-mono text-[10px] uppercase tracking-[0.13em] text-zinc-600">
            <span>Last call <strong className="ml-1.5 font-medium text-zinc-400">{formatTimestamp(debug?.timestamp)}</strong></span>
            <span>HTTP <strong className={`ml-1.5 font-medium ${statusTone}`}>{status ?? '—'}</strong></span>
            <span>Raw length <strong className="ml-1.5 font-medium text-zinc-400">{debug?.raw?.length ?? 0}</strong></span>
            <span>Materials <strong className="ml-1.5 font-medium text-zinc-400">{debug?.materials?.length ?? 0}</strong></span>
          </div>

          {debug?.error && (
            <p className="mt-3 border border-red-500/25 bg-red-500/[0.05] px-3 py-2 font-mono text-[11px] leading-5 text-red-300/90">
              {debug.error}
            </p>
          )}

          <Block
            label="1 · Raw response text (verbatim)"
            value={debug?.raw}
            empty={has ? 'Empty body.' : 'No API call yet — click Generate design.'}
          />
          <Block
            label="2 · Parsed model code"
            value={debug?.code}
            empty={has ? 'No code block was extracted from the response.' : '—'}
          />
          <Block
            label="3 · Parsed materials JSON"
            value={debug?.materials?.length ? JSON.stringify(debug.materials, null, 2) : ''}
            empty={has ? 'No materials array was extracted from the response.' : '—'}
          />

          {debug?.strategy && (
            <div className="mt-4 border-t border-white/[0.08] pt-3">
              <p className="font-mono text-[10px] uppercase tracking-[0.13em] text-zinc-500">
                6 · Generation strategy
                <span className={`ml-2 ${debug.strategy === 'decomposed' ? 'text-sky-400' : 'text-zinc-400'}`}>
                  {debug.strategy}
                </span>
              </p>
              {debug.complexity && (
                <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 font-mono text-[10px] uppercase tracking-[0.12em] text-zinc-600">
                  <span>repeated <strong className="ml-1 font-medium text-zinc-400">{debug.complexity.count || '—'} {debug.complexity.noun || ''}</strong></span>
                  <span>central <strong className="ml-1 font-medium text-zinc-400">{String(debug.complexity.central)}</strong></span>
                  <span>mechanisms <strong className="ml-1 font-medium text-zinc-400">{debug.complexity.families.join(', ') || 'none'}</strong></span>
                </div>
              )}
              {debug.fallbackReason && (
                <p className="mt-2 text-xs leading-5 text-amber-300/90">
                  Decomposition declined, fell back to whole-assembly: {debug.fallbackReason}
                </p>
              )}
              {!debug.complexity?.decompose && debug.complexity?.reasons?.length > 0 && (
                <p className="mt-2 text-xs leading-5 text-zinc-500">
                  Single-shot because: {debug.complexity.reasons.join('; ')}
                </p>
              )}
              {debug.inventory?.all?.length > 0 && (
                <div className="mt-2 border border-white/[0.08] p-2">
                  <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-zinc-500">
                    Component inventory from the brief —{' '}
                    <span className={debug.inventoryCheck?.ok ? 'text-emerald-400' : 'text-red-400'}>
                      {debug.inventoryCheck ? (debug.inventoryCheck.ok ? 'all present' : `${debug.inventoryCheck.missing.length} missing`) : 'not validated'}
                    </span>
                  </p>
                  <ul className="mt-1 space-y-0.5">
                    {debug.inventory.shared.map((c) => {
                      const miss = debug.inventoryCheck?.missingShared?.includes(c)
                      return <li key={c} className={`text-xs ${miss ? 'text-red-300/90' : 'text-zinc-500'}`}>· {c} (shared){miss ? ' — MISSING' : ''}</li>
                    })}
                    {debug.inventory.repeated.map((c) => {
                      const miss = debug.inventoryCheck?.missingRepeated?.includes(c)
                      return <li key={c} className={`text-xs ${miss ? 'text-red-300/90' : 'text-zinc-500'}`}>· {c} (x{debug.inventory.count}){miss ? ' — MISSING' : ''}</li>
                    })}
                  </ul>
                </div>
              )}
              {debug.audit && (
                <div className="mt-2 border border-white/[0.08] p-2">
                  <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-zinc-500">
                    Part accounting —{' '}
                    <span className={debug.audit.ok ? 'text-emerald-400' : 'text-red-400'}>
                      {debug.audit.total} solids, {debug.audit.expected} expected
                      {debug.audit.ok ? ' · all accounted for' : ` · ${debug.audit.unexplained.length} unexplained`}
                    </span>
                  </p>
                  <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.12em] text-zinc-600">
                    hub {debug.audit.hubSolidCount} + {debug.audit.count} x {debug.audit.unitSolidCount} per unit
                  </p>
                  {debug.audit.unexplained?.length > 0 && (
                    <ul className="mt-1">
                      {debug.audit.unexplained.map((u) => (
                        <li key={u.index} className="text-xs text-red-300/90">· #{u.index + 1} {u.name} — not part of the hub or any replica</li>
                      ))}
                    </ul>
                  )}
                  {debug.componentAudit?.missing?.length > 0 && (
                    <p className="mt-1 text-xs leading-5 text-amber-300/90">
                      Brief asked for {debug.componentAudit.missing.join(', ')} but no matching part was built.
                    </p>
                  )}
                  {debug.weak?.length > 0 && (
                    <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.12em] text-zinc-600">
                      single-contact parts: {debug.weak.map((w) => w.name).join(', ')}
                    </p>
                  )}
                </div>
              )}
              {debug.stages?.length > 0 && (
                <ul className="mt-2 space-y-1">
                  {debug.stages.map((st, i) => (
                    <li key={i} className="font-mono text-[10px] uppercase tracking-[0.12em] text-zinc-500">
                      · {st.stage}
                      {st.attempt ? ` attempt ${st.attempt}` : ''}
                      {st.solids !== undefined ? ` — ${st.solids} solids` : ''}
                      {st.connected !== undefined ? ` — ${st.connected ? 'connected' : `${st.floating} floating`}` : ''}
                      {st.deviation !== undefined ? ` — ${(st.deviation * 100).toFixed(1)}% asymmetry` : ''}
                      {st.worst !== undefined ? ` — ${(st.worst * 100).toFixed(1)}% replica overlap` : ''}
                      {st.parts !== undefined && st.stage === 'final' ? ` — ${st.parts} parts` : ''}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {debug?.motion && (
            <div className="mt-4 border-t border-white/[0.08] pt-3">
              <p className="font-mono text-[10px] uppercase tracking-[0.13em] text-zinc-500">5 · Movement coverage</p>
              <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 font-mono text-[10px] uppercase tracking-[0.12em] text-zinc-600">
                <span>terms in brief <strong className="ml-1 font-medium text-zinc-400">{debug.motion.terms.length ? debug.motion.terms.join(', ') : 'none'}</strong></span>
                <span>components named <strong className="ml-1 font-medium text-zinc-400">{debug.motion.stages || '—'}</strong></span>
                <span>expected <strong className="ml-1 font-medium text-zinc-400">{debug.motion.expected}</strong></span>
                <span>tagged <strong className={`ml-1 font-medium ${debug.motionNote ? 'text-amber-400' : 'text-emerald-400'}`}>{debug.motion.tagged}</strong> / {debug.motion.parts}</span>
                <span>slide {debug.motion.byMotion.slide} · rotate {debug.motion.byMotion.rotate}</span>
              </div>
              {debug.motionNote && (
                <p className="mt-2 border border-amber-400/25 bg-amber-400/[0.05] px-3 py-2 text-xs leading-5 text-amber-300/90">
                  {debug.motionNote}
                </p>
              )}
            </div>
          )}

          {debug?.iterations?.length > 1 && (
            <div className="mt-4 border-t border-white/[0.08] pt-3">
              <p className="font-mono text-[10px] uppercase tracking-[0.13em] text-zinc-500">
                4 · Agentic review loop — {debug.iterations.length - 1} round{debug.iterations.length === 2 ? '' : 's'}
              </p>
              {debug.iterations.map((step, i) => (
                <div key={i} className="mt-3 border border-white/[0.08] p-3">
                  <p className="flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[10px] uppercase tracking-[0.12em]">
                    <span className="text-zinc-400">{step.round === 0 ? 'Initial generation' : `Round ${step.round}`}</span>
                    {step.verdict && (
                      <span className={step.verdict === 'OK' ? 'text-emerald-400' : 'text-amber-400/90'}>
                        verdict {step.verdict}
                      </span>
                    )}
                    {step.floating !== null && step.floating !== undefined && (
                      <span className="text-zinc-600">{step.floating} floating{step.parts ? ` / ${step.parts} parts` : ''}</span>
                    )}
                    {step.findings?.hasStructural && (
                      <span className="text-orange-400">structural x{step.findings.structural.length}</span>
                    )}
                    {step.findings?.hasMissing && (
                      <span className="text-red-400">missing x{step.findings.missing.length}</span>
                    )}
                    {step.findings?.hasConnectivity && (
                      <span className="text-sky-400">connectivity x{step.findings.connectivity.length}</span>
                    )}
                    {step.applied ? (
                      <span className="text-emerald-400">
                        applied{step.acceptedFor ? ` (${step.acceptedFor} fix)` : ''}
                      </span>
                    ) : step.gate && !step.gate.accept ? (
                      <span className="text-red-400">rejected by component gate</span>
                    ) : null}
                  </p>
                  {step.error && <p className="mt-2 font-mono text-[11px] leading-5 text-red-300/90">{step.error}</p>}

                  {step.images?.length > 0 && (
                    <div className="mt-2 flex gap-2 overflow-x-auto">
                      {step.images.map((image) => (
                        <figure key={image.name} className="shrink-0">
                          <img src={image.dataUrl} alt={image.name} className="h-28 w-auto border border-white/[0.1]" />
                          <figcaption className="mt-1 font-mono text-[9px] uppercase tracking-[0.13em] text-zinc-600">{image.name}</figcaption>
                        </figure>
                      ))}
                    </div>
                  )}

                  {step.gate && (
                    <p className="mt-2 font-mono text-[10px] uppercase tracking-[0.12em] text-zinc-600">
                      component gate: {step.gate.reason}
                    </p>
                  )}
                  {step.findings?.hasStructural && (
                    <div className="mt-2">
                      <p className="font-mono text-[10px] uppercase tracking-[0.13em] text-orange-400/90">Structural / plausibility</p>
                      <ul className="mt-1 space-y-1">
                        {step.findings.structural.map((line, k) => (
                          <li key={k} className="text-xs leading-5 text-zinc-400">· {line}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {step.findings?.hasConnectivity && (
                    <div className="mt-2">
                      <p className="font-mono text-[10px] uppercase tracking-[0.13em] text-sky-400/90">Connectivity</p>
                      <ul className="mt-1 space-y-1">
                        {step.findings.connectivity.map((line, k) => (
                          <li key={k} className="text-xs leading-5 text-zinc-400">· {line}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {step.critique && <Block label="Grok's full critique" value={step.critique} empty="—" />}
                  {step.code && <Block label={step.round === 0 ? 'Initial code' : 'Corrected code'} value={step.code} empty="—" />}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
