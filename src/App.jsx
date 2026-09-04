import { useEffect, useRef, useState } from 'react'
import { Box, ChevronRight, CircleDot, Cpu, RotateCw, Sparkles } from 'lucide-react'

const parts = [
  { item: '6061 Aluminum Plate', detail: '240 × 180 × 8 mm', quantity: 2, cost: '$84.00' },
  { item: 'M6 Socket Head Bolts', detail: 'Black oxide · 30 mm', quantity: 12, cost: '$16.80' },
  { item: 'Linear Bearing Rail', detail: 'Hardened steel · 400 mm', quantity: 2, cost: '$126.00' },
]

function LoadingOverlay() {
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
          <p className="mt-2 text-sm text-zinc-500">Analyzing design constraints...</p>
        </div>
      </div>
    </div>
  )
}

function App() {
  const [loading, setLoading] = useState(false)
  const timer = useRef(null)

  useEffect(() => () => clearTimeout(timer.current), [])

  const generate = () => {
    clearTimeout(timer.current)
    setLoading(true)
    timer.current = setTimeout(() => setLoading(false), 2000)
  }

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
          <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.14em] text-zinc-500">
            <CircleDot className="h-3.5 w-3.5 text-emerald-500" /> System ready
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
              <textarea id="design-brief" className="field min-h-56 flex-1 resize-none" defaultValue="Design a compact, wall-mounted folding workbench bracket capable of supporting 100 kg. Use standard aluminum plate and off-the-shelf fasteners. Prioritize rigidity and easy assembly." />
              <div className="mt-3 flex items-center justify-between font-mono text-[10px] uppercase tracking-[0.14em] text-zinc-600">
                <span>Natural language input</span><span>Clear constraints improve output</span>
              </div>
              <button onClick={generate} disabled={loading} className="primary-button mt-5 group">
                <span className="flex items-center gap-2.5"><Sparkles className="h-4 w-4" /> Generate design</span>
                <ChevronRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
              </button>
            </div>

            <div className="mt-9 border-t border-white/[0.08] pt-7">
              <p className="eyebrow"><span>02</span> Refine</p>
              <label className="mt-4 block text-sm font-medium text-zinc-300" htmlFor="refine">Adjust the current design</label>
              <textarea id="refine" className="field mt-3 min-h-24 resize-none" placeholder="e.g. Reduce weight by 15% and add cable routing..." />
              <button className="secondary-button mt-3"><RotateCw className="h-3.5 w-3.5" /> Update design</button>
            </div>
          </section>

          <section className="relative grid min-h-[760px] overflow-hidden border border-white/[0.09] bg-[#0c0e10] lg:min-h-0 lg:grid-rows-[1fr_auto]">
            {loading && <LoadingOverlay />}
            <div className="relative flex min-h-[460px] flex-col overflow-hidden border-b border-white/[0.08]">
              <div className="section-bar"><p className="eyebrow"><span>Viewport</span> Isometric</p><p className="font-mono text-[10px] tracking-wider text-zinc-600">NO MODEL LOADED</p></div>
              <div className="blueprint-grid relative flex flex-1 items-center justify-center">
                <div className="absolute left-5 top-5 h-4 w-4 border-l border-t border-zinc-600/50" />
                <div className="absolute right-5 top-5 h-4 w-4 border-r border-t border-zinc-600/50" />
                <div className="absolute bottom-5 left-5 h-4 w-4 border-b border-l border-zinc-600/50" />
                <div className="absolute bottom-5 right-5 h-4 w-4 border-b border-r border-zinc-600/50" />
                <div className="text-center">
                  <div className="mx-auto grid h-14 w-14 place-items-center rounded-full border border-white/10 bg-white/[0.025]">
                    <Box className="h-6 w-6 text-zinc-600" strokeWidth={1.25} />
                  </div>
                  <p className="mt-5 text-sm font-medium text-zinc-400">3D preview will appear here</p>
                  <p className="mt-2 font-mono text-[10px] uppercase tracking-[0.18em] text-zinc-700">Awaiting design generation</p>
                </div>
                <div className="absolute bottom-6 left-1/2 flex -translate-x-1/2 gap-1">
                  <span className="h-1 w-8 bg-amber-400"/><span className="h-1 w-2 bg-zinc-700"/><span className="h-1 w-2 bg-zinc-700"/>
                </div>
              </div>
            </div>

            <div>
              <div className="section-bar"><p className="eyebrow"><span>Bill of materials</span> 3 line items</p><p className="font-mono text-xs text-zinc-500">EST. TOTAL <strong className="ml-2 text-zinc-200">$226.80</strong></p></div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[560px] text-left">
                  <thead><tr className="border-b border-white/[0.08] font-mono text-[10px] uppercase tracking-[0.16em] text-zinc-600"><th className="px-6 py-3 font-medium">Item</th><th className="px-6 py-3 text-center font-medium">Quantity</th><th className="px-6 py-3 text-right font-medium">Estimated cost</th></tr></thead>
                  <tbody>{parts.map((part, index) => <tr key={part.item} className="border-b border-white/[0.055] last:border-0 hover:bg-white/[0.02]"><td className="px-6 py-4"><div className="flex items-center gap-4"><span className="font-mono text-[10px] text-zinc-700">0{index + 1}</span><div><p className="text-sm font-medium text-zinc-300">{part.item}</p><p className="mt-1 text-xs text-zinc-600">{part.detail}</p></div></div></td><td className="px-6 py-4 text-center font-mono text-sm text-zinc-400">{part.quantity}</td><td className="px-6 py-4 text-right font-mono text-sm text-zinc-300">{part.cost}</td></tr>)}</tbody>
                </table>
              </div>
            </div>
          </section>
        </div>
        <footer className="flex h-7 items-end justify-between font-mono text-[9px] uppercase tracking-[0.17em] text-zinc-700"><span>Forge workspace v0.1</span><span>Metric units · USD</span></footer>
      </div>
    </main>
  )
}

export default App
