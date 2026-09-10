import { useEffect, useRef, useState } from 'react'
import { AlertTriangle, Box, Boxes, ChevronRight, CircleDot, Cpu, Crosshair, Download, RotateCw, Settings as SettingsIcon, Sparkles } from 'lucide-react'
import { supabase } from './supabase'
import AuthButton from './AuthButton'
import ProjectHistory from './ProjectHistory'
import AdjustPanel from './AdjustPanel'
import DebugPanel from './DebugPanel'
import SettingsPanel from './SettingsPanel'
import { generateProjectName } from './grok'
import { formatUsd, materialsTotal, parseDesignResponse } from './designParser'
import { buildWarning } from './jscadRuntime'
import { designFromProject } from './projectDesign'
import { analyzeAssembly, assemblyWarning } from './assemblyCheck'
import { runAgenticDesign } from './agenticDesign'
import { renderPreviews } from './renderPreview'
import ModelViewer from './ModelViewer'
import { loadSettings, purgeLegacyXaiKey, saveSettings } from './settings'

const DEFAULT_BRIEF =
  'Design a compact, wall-mounted folding workbench bracket capable of supporting 100 kg. Use standard aluminum plate and off-the-shelf fasteners. Prioritize rigidity and easy assembly.'


// Params Supabase leaves behind on the OAuth callback URL once it has consumed them.
const AUTH_URL_PARAMS = [
  'access_token', 'refresh_token', 'expires_in', 'expires_at', 'provider_token',
  'provider_refresh_token', 'token_type', 'type', 'code',
]
const AUTH_ERROR_PARAMS = ['error', 'error_code', 'error_description']

function readParam(url, name) {
  return url.searchParams.get(name) ?? new URLSearchParams(url.hash.replace(/^#/, '')).get(name)
}

// Strips the named params from both the query string and the hash fragment.
function stripParamsFromUrl(names) {
  const url = new URL(window.location.href)
  const hashParams = new URLSearchParams(url.hash.replace(/^#/, ''))
  let changed = false

  for (const name of names) {
    if (url.searchParams.has(name)) {
      url.searchParams.delete(name)
      changed = true
    }
    if (hashParams.has(name)) {
      hashParams.delete(name)
      changed = true
    }
  }
  if (!changed) return

  const hash = hashParams.toString()
  window.history.replaceState({}, document.title, `${url.pathname}${url.search}${hash ? `#${hash}` : ''}`)
}

const PHASE_TEXT = {
  generating: 'Generating geometry...',
  regenerating: 'Assembly badly broken - regenerating...',
  analysing: 'Analysing assembly complexity...',
  hub: 'Generating shared hub...',
  unit: 'Generating one sub-assembly...',
  validating: 'Validating hub + sub-assembly...',
  'correcting-unit': 'Correcting the sub-assembly...',
  inventory: 'Listing components from the brief...',
  'repairing-components': 'Adding missing components...',
  replicating: 'Replicating sub-assembly...',
  'final-check': 'Final assembly check...',
  rendering: 'Rendering views...',
  reviewing: 'Reviewing the render...',
  correcting: 'Correcting the design...',
}

function LoadingOverlay({ phase }) {
  return (
    <div className="absolute inset-0 z-20 grid place-items-center bg-[#080a0b]/88 backdrop-blur-sm" role="status" aria-live="polite">
      <div className="flex flex-col items-center gap-5">
        <div className="relative grid h-16 w-16 place-items-center">
          <div className="absolute inset-0 rounded-full border border-amber-400/20" />
          <div className="absolute inset-0 animate-spin rounded-full border-2 border-transparent border-t-amber-400 border-r-amber-400/40" />
          <Cpu className="h-6 w-6 text-amber-300" strokeWidth={1.5} />
        </div>
        <div className="text-center">
          <p className="font-mono text-xs font-semibold uppercase tracking-[0.22em] text-amber-300">Generating geometry</p>
          <p className="mt-2 text-sm text-zinc-500">{PHASE_TEXT[phase] ?? PHASE_TEXT.generating}</p>
        </div>
      </div>
    </div>
  )
}

function App() {
  const [generating, setGenerating] = useState(false)
  const [description, setDescription] = useState(DEFAULT_BRIEF)
  const [refineText, setRefineText] = useState('')
  const [design, setDesign] = useState(null)
  const [designError, setDesignError] = useState('')
  const [viewerError, setViewerError] = useState('')
  const [assemblyNote, setAssemblyNote] = useState('')
  const [severeNote, setSevereNote] = useState('')
  const [buildNote, setBuildNote] = useState('')
  // { [solidIndex]: { axis, value } } - purely visual part offsets
  const [offsets, setOffsets] = useState({})
  const [phase, setPhase] = useState('')
  const [history, setHistory] = useState([])
  const [debug, setDebug] = useState(null)
  const [wireframe, setWireframe] = useState(false)
  const viewerRef = useRef(null)
  const [user, setUser] = useState(null)
  const [authReady, setAuthReady] = useState(!supabase)
  const [saveError, setSaveError] = useState('')
  // Bumped after a successful insert so ProjectHistory refetches.
  const [historyRefresh, setHistoryRefresh] = useState(0)
  const [settings, setSettings] = useState(loadSettings)
  const [settingsOpen, setSettingsOpen] = useState(false)

  useEffect(() => { saveSettings(settings) }, [settings])
  useEffect(() => { purgeLegacyXaiKey() }, [])

  // Theme is driven by a class on <body> so index.css can restyle the whole app.
  useEffect(() => {
    document.body.classList.toggle('light', settings.theme === 'light')
    document.body.classList.toggle('dark', settings.theme !== 'light')
  }, [settings.theme])

  // Surface and clear any error the OAuth provider handed back. Runs before the
  // session lands, and deliberately leaves `code`/token params alone so
  // detectSessionInUrl can still consume them.
  useEffect(() => {
    const url = new URL(window.location.href)
    const message = readParam(url, 'error_description') || readParam(url, 'error')
    if (!message) return
    console.log('[auth] callback returned an error:', message)
    setSaveError(decodeURIComponent(message.replace(/\+/g, ' ')))
    stripParamsFromUrl(AUTH_ERROR_PARAMS)
  }, [])

  useEffect(() => {
    if (!supabase) return
    let active = true

    // onAuthStateChange fires SIGNED_IN once detectSessionInUrl has exchanged
    // the callback params, so this is what picks the session up after redirect.
    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      console.log('[auth] event:', event, '| user:', session?.user?.email ?? null)

      setUser(session?.user ?? null)
      setAuthReady(true)

      if (event === 'SIGNED_IN' || event === 'INITIAL_SESSION') {
        stripParamsFromUrl([...AUTH_URL_PARAMS, ...AUTH_ERROR_PARAMS])
      }
      if (event === 'SIGNED_IN') setSaveError('')
    })

    // Covers the reload-with-stored-session case if INITIAL_SESSION is missed.
    supabase.auth.getSession().then(({ data, error }) => {
      if (!active) return
      if (error) console.log('[auth] getSession error:', error.message)
      setUser((current) => current ?? data.session?.user ?? null)
      setAuthReady(true)
    })

    return () => {
      active = false
      listener.subscription.unsubscribe()
    }
  }, [])

  const signIn = async () => {
    if (!supabase) return
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin },
    })
    if (error) {
      console.log('[auth] signInWithOAuth error:', error.message)
      setSaveError(error.message)
    }
  }

  const signOut = async () => {
    if (!supabase) return
    await supabase.auth.signOut()
  }

  // The anon key cannot remove an auth.users row, so the actual deletion has to
  // happen in a SECURITY DEFINER function. Projects are cleared first, since RLS
  // already permits that and it keeps no orphan rows behind if the RPC fails.
  const deleteAccount = async () => {
    if (!supabase || !user) return { error: 'Not signed in.' }

    const { error: rowsError } = await supabase.from('projects').delete().eq('user_id', user.id)
    if (rowsError) {
      console.log('[account] could not delete projects:', rowsError.message)
      return { error: `Could not delete your projects: ${rowsError.message}` }
    }

    const { error } = await supabase.rpc('delete_user_account')
    if (error) {
      console.log('[account] delete_user_account RPC failed:', error.code, error.message)
      if (error.code === 'PGRST202') {
        return { error: 'Your projects were deleted, but the delete_user_account() function does not exist in Supabase yet, so the login itself remains. See the setup SQL.' }
      }
      return { error: error.message }
    }

    await supabase.auth.signOut()
    return {}
  }

  const saveProject = async ({ brief, code, materials, materialsRaw, parts }) => {
    if (!supabase || !user) return
    const name = await generateProjectName(brief)
    const row = {
      user_id: user.id,
      name,
      description: brief,
      timestamp: new Date().toISOString(),
      result: JSON.stringify({ code, materials, materialsRaw, parts, estimatedTotal: materialsTotal(materials) }),
    }

    let { error } = await supabase.from('projects').insert(row)

    // 42703 = column does not exist. Retry without `name` so a save still lands
    // on a database that has not had the ALTER TABLE applied yet.
    if (error?.code === '42703') {
      console.log('[projects] no `name` column yet — saving without it')
      const { name, ...withoutName } = row
      ;({ error } = await supabase.from('projects').insert(withoutName))
      if (!error) {
        setSaveError('Saved, but the projects table has no `name` column yet. Run: ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS name text;')
        setHistoryRefresh((value) => value + 1)
        return
      }
    }

    if (error) {
      console.log('[projects] insert error:', error.message)
      setSaveError(error.message)
      return
    }
    setSaveError('')
    setHistoryRefresh((value) => value + 1)
  }

  // Shared by Generate and Refine; `priorTurns` is what makes Refine build on
  // the previous design rather than starting from scratch.
  const runGeneration = async ({ brief, priorTurns, savedBrief }) => {
    setGenerating(true)
    setDesignError('')
    setViewerError('')

    const requestedAt = new Date().toISOString()
    let reply = ''
    let status = null
    setPhase('generating')

    try {
      // Agentic loop owns the initial generation; onReply surfaces the raw body
      // before parsing, so a parse failure still leaves it in the debug panel.
      // Agentic loop: build it, render it, let the model look at what it made.
      const { chosen, iterations, motion, motionWarning: motionNote, regenerations, severity, severeUnresolved, strategy, complexity, stages, fallbackReason, audit, componentAudit, auditWarning, weak, inventory, inventoryCheck } = await runAgenticDesign({
        brief, history: priorTurns, onPhase: setPhase,
        render: (solids) => renderPreviews(solids, { width: 640, height: 480 }),
        onReply: (content, code) => {
          reply = content
          status = code
          setDebug({ raw: content, code: '', materials: [], status: code, timestamp: requestedAt, error: '', iterations: [] })
        },
      })
      if (!chosen.ok) throw new Error(chosen.error)
      setDebug((current) => ({ ...current, code: chosen.code, materials: chosen.materials, iterations, motion, motionNote, strategy, complexity, stages, fallbackReason, audit, componentAudit, auditWarning, weak, inventory, inventoryCheck }))
      if (auditWarning) console.log('[design] part audit:', auditWarning)
      if (motionNote) console.log('[design]', motionNote)
      console.log('[design] agentic rounds:', iterations.length - 1,
        '| floating', iterations[0].floating, '->', chosen.floating)

      const { code, materials, materialsRaw, parts, solids, buildReport, assembly } = chosen
      const salvage = buildWarning(buildReport)
      setBuildNote(salvage)
      const note = assemblyWarning(assembly)
      if (note) console.log('[design] assembly warning:', note)
      setAssemblyNote(note)
      // A majority-broken result must not be presented as finished with a small
      // amber badge - say plainly that regeneration was tried and fell short.
      setSevereNote(severeUnresolved
        ? `${Math.round(severity * 100)}% of parts are still disconnected after ` +
          `${regenerations} full regeneration attempt${regenerations === 1 ? '' : 's'} and ${iterations.length - 1 - regenerations} correction round${iterations.length - 2 - regenerations === 0 ? '' : 's'}. ` +
          'This design did not come out usable - try rewording the brief or generating again.'
        : '')

      setDesign({ code, materials, parts, solids })
      setOffsets({})
      setHistory([...priorTurns, { role: 'user', content: brief }, { role: 'assistant', content: chosen.reply }])
      saveProject({ brief: savedBrief, code, materials, materialsRaw, parts })
    } catch (error) {
      console.log('[design] generation failed:', error.message)
      setDebug((current) => ({
        raw: reply || error.raw || '',
        code: current?.raw === reply ? current.code : '',
        materials: current?.raw === reply ? current.materials : [],
        status: status ?? error.status ?? null,
        timestamp: requestedAt,
        error: error.message,
        iterations: current?.iterations ?? [],
      }))
      setDesign(null)
      setDesignError(error.message)
    } finally {
      setGenerating(false)
      setPhase('')
    }
  }

  const generate = () => runGeneration({ brief: description, priorTurns: [], savedBrief: description })

  const refine = () => {
    const instruction = refineText.trim()
    if (!instruction) return
    runGeneration({
      brief: `Apply this change to the previous design: ${instruction}`,
      priorTurns: history,
      savedBrief: `${description}\n\nRefinement: ${instruction}`,
    })
  }

  // Loading a history entry rebuilds THAT project's model, so each saved project
  // keeps its own geometry rather than sharing the active viewport.
  const loadProject = (project) => {
    setDescription(project.description ?? '')
    const { code, materials, parts, solids, error } = designFromProject(project)
    setHistory([])
    setViewerError(error && solids === null && code ? error : '')
    setDesignError(!code ? error : '')
    setDesign(code ? { code, materials, parts, solids } : null)
    setOffsets({})
    setAssemblyNote(solids ? assemblyWarning(analyzeAssembly(solids)) : '')
    setWireframe(false)
  }

  const movePart = (index, part, value) => {
    setOffsets((current) => ({
      ...current,
      [index]: { motion: part.motion, axis: part.axis, axisVector: part.axisVector, pivot: part.pivot, value },
    }))
  }
  const resetPositions = () => setOffsets({})

  const downloadStl = () => {
    const blob = viewerRef.current?.exportSTL()
    if (!blob) return
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `forge-model.${(settings.exportFormat || 'stl').toLowerCase()}`
    document.body.appendChild(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(url)
  }

  const materials = design?.materials ?? []
  const estimatedTotal = materialsTotal(materials)

  return (
    <main className="min-h-screen bg-[#080a0b] text-zinc-200">
      <div className="noise pointer-events-none fixed inset-0 opacity-[0.035]" />
      <div className="mx-auto flex min-h-screen max-w-[1680px] flex-col px-4 py-4 sm:px-6 sm:py-6 lg:px-8">
        <header className="flex h-14 shrink-0 items-center justify-between border-b border-white/[0.08]">
          <div className="flex items-center gap-3">
            <div className="grid h-8 w-8 place-items-center border border-amber-400/40 bg-amber-400/[0.08] text-amber-300">
              <Box className="h-[17px] w-[17px]" strokeWidth={1.7} />
            </div>
            <h1 className="text-xl font-semibold tracking-[-0.02em] text-white">Forge<span className="text-amber-400">.</span></h1>
            <span className="hidden border-l border-white/10 pl-3 font-mono text-[10px] uppercase tracking-[0.18em] text-zinc-600 sm:block">Generative Engineering</span>
          </div>
          <div className="flex items-center gap-4">
            <div className="hidden items-center gap-2 font-mono text-[10px] uppercase tracking-[0.14em] text-zinc-500 md:flex">
              <CircleDot className="h-3.5 w-3.5 text-emerald-500" /> System ready
            </div>
            <AuthButton user={user} onSignIn={signIn} onSignOut={signOut} disabled={!supabase || !authReady} />
            <button
              onClick={() => setSettingsOpen(true)}
              aria-label="Open settings"
              aria-haspopup="dialog"
              className="grid h-8 w-8 place-items-center border border-white/[0.12] bg-white/[0.03] text-zinc-500 transition-colors hover:border-amber-400/35 hover:bg-amber-400/[0.05] hover:text-amber-300"
            >
              <SettingsIcon className="h-4 w-4" strokeWidth={1.7} />
            </button>
          </div>
        </header>

        <div className="grid flex-1 gap-4 py-4 lg:grid-cols-[minmax(320px,0.72fr)_minmax(520px,1.28fr)] lg:gap-5">
          <section className="panel flex flex-col p-5 sm:p-7 lg:p-8">
            <div>
              <p className="eyebrow"><span>01</span> Design brief</p>
              <h2 className="mt-5 max-w-md text-3xl font-medium leading-tight tracking-[-0.035em] text-white sm:text-4xl">What do you want to build?</h2>
              <p className="mt-3 max-w-lg text-sm leading-6 text-zinc-500">Describe the component, its function, dimensions, materials, and any manufacturing constraints.</p>
            </div>

            <div className="mt-8 flex flex-1 flex-col">
              <label className="sr-only" htmlFor="design-brief">Design brief</label>
              <textarea id="design-brief" className="field min-h-56 flex-1 resize-none" value={description} onChange={(event) => setDescription(event.target.value)} />
              <div className="mt-3 flex items-center justify-between font-mono text-[10px] uppercase tracking-[0.14em] text-zinc-600">
                <span>Natural language input</span><span>Clear constraints improve output</span>
              </div>
              <button onClick={generate} disabled={generating} className="primary-button mt-5 group">
                <span className="flex items-center gap-2.5"><Sparkles className="h-4 w-4" /> {generating ? 'Generating…' : 'Generate design'}</span>
                <ChevronRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
              </button>

              <DebugPanel debug={debug} />
            </div>

            <ProjectHistory
              user={user}
              refreshKey={historyRefresh}
              error={saveError}
              onSelect={(project) => loadProject(project)}
            />

            <div className="mt-9 border-t border-white/[0.08] pt-7">
              <p className="eyebrow"><span>03</span> Refine</p>
              <label className="mt-4 block text-sm font-medium text-zinc-300" htmlFor="refine">Adjust the current design</label>
              <textarea id="refine" className="field mt-3 min-h-24 resize-none" placeholder="e.g. Reduce weight by 15% and add cable routing..." value={refineText} onChange={(event) => setRefineText(event.target.value)} />
              <button onClick={refine} disabled={generating || !design || !refineText.trim()} className="secondary-button mt-3 disabled:cursor-not-allowed disabled:opacity-45">
                <RotateCw className={`h-3.5 w-3.5 ${generating ? 'animate-spin' : ''}`} /> Update design
              </button>
            </div>
          </section>

          <section className="relative grid min-h-[760px] overflow-hidden border border-white/[0.09] bg-[#0c0e10] lg:min-h-0 lg:grid-rows-[1fr_auto]">
            {generating && <LoadingOverlay phase={phase} />}
            <div className="relative flex min-h-[460px] flex-col overflow-hidden border-b border-white/[0.08]">
              <div className="section-bar">
                <p className="eyebrow"><span>Viewport</span> Isometric</p>
                <div className="flex items-center gap-4">
                  <p className="font-mono text-[10px] tracking-wider text-zinc-600">{design?.solids ? `${design.solids.length} SOLID${design.solids.length === 1 ? '' : 'S'}` : 'NO MODEL LOADED'}</p>
                  {severeNote && (
                    <p title={severeNote} className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.12em] text-red-400">
                      <AlertTriangle className="h-3.5 w-3.5" /> Regeneration failed
                    </p>
                  )}
                  {buildNote && (
                    <p title={buildNote} className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.12em] text-amber-400/90">
                      <AlertTriangle className="h-3.5 w-3.5" /> {buildNote}
                    </p>
                  )}
                  {assemblyNote && (
                    <p title={assemblyNote} className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.12em] text-amber-400/90">
                      <AlertTriangle className="h-3.5 w-3.5" /> Disconnected parts
                    </p>
                  )}
                  {design?.solids && (
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => setWireframe((value) => !value)}
                        aria-pressed={wireframe}
                        title="Toggle wireframe view"
                        className={`secondary-button !py-2 ${wireframe ? '!border-amber-400/55 !bg-amber-400/[0.08] !text-amber-300' : ''}`}
                      >
                        <Boxes className="h-3.5 w-3.5" /> Wireframe
                      </button>
                      <button onClick={() => viewerRef.current?.resetView()} title="Reset to the default isometric view" className="secondary-button !py-2">
                        <Crosshair className="h-3.5 w-3.5" /> Reset view
                      </button>
                      <button onClick={downloadStl} className="secondary-button !py-2"><Download className="h-3.5 w-3.5" /> Export {settings.exportFormat || 'STL'}</button>
                    </div>
                  )}
                </div>
              </div>
              <div className="blueprint-grid relative flex flex-1 items-center justify-center">
                <div className="absolute left-5 top-5 z-10 h-4 w-4 border-l border-t border-zinc-600/50" />
                <div className="absolute right-5 top-5 z-10 h-4 w-4 border-r border-t border-zinc-600/50" />
                <div className="absolute bottom-5 left-5 z-10 h-4 w-4 border-b border-l border-zinc-600/50" />
                <div className="absolute bottom-5 right-5 z-10 h-4 w-4 border-b border-r border-zinc-600/50" />

                {design?.solids ? (
                  <div className="absolute inset-0">
                    {severeNote && (
                      <div className="pointer-events-none absolute inset-x-4 top-4 z-20 border border-red-500/40 bg-red-500/[0.12] px-4 py-2.5 backdrop-blur-[2px]">
                        <p className="text-xs leading-5 text-red-200">{severeNote}</p>
                      </div>
                    )}
                    <ModelViewer
                      ref={viewerRef}
                      offsets={offsets}
                      solids={design.solids}
                      theme={settings.theme}
                      materials={materials}
                      defaultMaterial={settings.material}
                      units={settings.units}
                      wireframe={wireframe}
                    />
                    <AdjustPanel
                      parts={design.parts ?? []}
                      offsets={offsets}
                      onChange={movePart}
                      onReset={resetPositions}
                    />
                  </div>
                ) : designError || viewerError ? (
                  <div className="max-w-md px-8 text-center">
                    <div className="mx-auto grid h-14 w-14 place-items-center rounded-full border border-red-500/30 bg-red-500/[0.06]">
                      <AlertTriangle className="h-6 w-6 text-red-400/90" strokeWidth={1.25} />
                    </div>
                    <p className="mt-5 text-sm font-medium text-red-300/90">{designError ? 'Generation failed' : 'Model could not be built'}</p>
                    <p className="mt-2 text-sm leading-6 text-zinc-500">{designError || viewerError}</p>
                    <button onClick={generate} disabled={generating} className="secondary-button mt-5"><RotateCw className="h-3.5 w-3.5" /> Try again</button>
                  </div>
                ) : (
                  <div className="text-center">
                    <div className="mx-auto grid h-14 w-14 place-items-center rounded-full border border-white/10 bg-white/[0.025]">
                      <Box className="h-6 w-6 text-zinc-600" strokeWidth={1.25} />
                    </div>
                    <p className="mt-5 text-sm font-medium text-zinc-400">3D preview will appear here</p>
                    <p className="mt-2 font-mono text-[10px] uppercase tracking-[0.18em] text-zinc-700">Awaiting design generation</p>
                  </div>
                )}

                {!design?.solids && (
                  <div className="absolute bottom-6 left-1/2 flex -translate-x-1/2 gap-1">
                    <span className="h-1 w-8 bg-amber-400"/><span className="h-1 w-2 bg-zinc-700"/><span className="h-1 w-2 bg-zinc-700"/>
                  </div>
                )}
              </div>
            </div>

            <div>
              <div className="section-bar">
                <p className="eyebrow"><span>Bill of materials</span> {materials.length} line item{materials.length === 1 ? '' : 's'}</p>
                <p className="font-mono text-xs text-zinc-500">EST. TOTAL <strong className="ml-2 text-zinc-200">{formatUsd(estimatedTotal)}</strong></p>
              </div>
              {materials.length === 0 ? (
                <p className="px-6 py-8 text-center text-sm text-zinc-600">No materials yet — generate a design to populate the bill of materials.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[560px] text-left">
                    <thead><tr className="border-b border-white/[0.08] font-mono text-[10px] uppercase tracking-[0.16em] text-zinc-600"><th className="px-6 py-3 font-medium">Item</th><th className="px-6 py-3 text-center font-medium">Quantity</th><th className="px-6 py-3 text-right font-medium">Estimated cost</th></tr></thead>
                    <tbody>{materials.map((part, index) => <tr key={`${part.name}-${index}`} className="border-b border-white/[0.055] last:border-0 hover:bg-white/[0.02]"><td className="px-6 py-4"><div className="flex items-center gap-4"><span className="font-mono text-[10px] text-zinc-700">{String(index + 1).padStart(2, '0')}</span><div><p className="text-sm font-medium text-zinc-300">{part.name}</p>{part.detail && <p className="mt-1 text-xs text-zinc-600">{part.detail}</p>}</div></div></td><td className="px-6 py-4 text-center font-mono text-sm text-zinc-400">{part.quantity}</td><td className="px-6 py-4 text-right font-mono text-sm text-zinc-300">{formatUsd(part.cost)}</td></tr>)}</tbody>
                  </table>
                </div>
              )}
            </div>
          </section>
        </div>
        <footer className="flex h-7 items-end justify-between font-mono text-[9px] uppercase tracking-[0.17em] text-zinc-700"><span>Forge workspace v0.1</span><span>{settings.units === 'imperial' ? 'Imperial' : 'Metric'} units · USD</span></footer>
      </div>

      <SettingsPanel
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        settings={settings}
        onChange={setSettings}
        user={user}
        onSignOut={() => { setSettingsOpen(false); signOut() }}
        onDeleteAccount={deleteAccount}
      />
    </main>
  )
}

export default App
