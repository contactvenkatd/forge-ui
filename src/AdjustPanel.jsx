import { useState } from 'react'
import { ChevronRight, Move3d, RotateCcw, RotateCw, MoveHorizontal, MoveVertical, MoveDiagonal } from 'lucide-react'

const AXIS_LABEL = { x: 'X', y: 'Y', z: 'Z' }
const SLIDE_ICON = { x: MoveHorizontal, y: MoveDiagonal, z: MoveVertical }

function controlFor(part) {
  if (part.motion === 'rotate') {
    return { Icon: RotateCw, unit: '°', hint: `rotates about ${AXIS_LABEL[part.axis]}`, decimals: 0 }
  }
  return {
    Icon: SLIDE_ICON[part.axis] ?? Move3d,
    unit: 'mm',
    hint: `slides along ${AXIS_LABEL[part.axis]}`,
    decimals: 1,
  }
}

/**
 * Controls for parts the design marked as movable. Purely visual: dragging
 * repositions that mesh in the scene, nothing is regenerated. The control type
 * follows the part's declared motion - a slider in mm for linear travel, an
 * angle slider in degrees for rotation.
 */
export default function AdjustPanel({ parts, offsets, onChange, onReset }) {
  const [open, setOpen] = useState(false)
  const movable = parts.filter((part) => part.motion && part.axis)
  if (movable.length === 0) return null

  const moved = movable.some((part) => Math.abs(offsets?.[part.index]?.value ?? 0) > 0.01)
  const rotary = movable.filter((p) => p.motion === 'rotate').length
  const linear = movable.length - rotary

  return (
    <div className="pointer-events-auto absolute left-4 top-12 z-20 w-72 border border-white/[0.12] bg-black/70 backdrop-blur-[3px]">
      <button
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left transition-colors hover:bg-white/[0.04]"
      >
        <span className="flex items-center gap-2 font-mono text-[10px] font-semibold uppercase tracking-[0.13em] text-zinc-400">
          <Move3d className="h-3.5 w-3.5" /> Adjust parts
          <span className="text-zinc-600">
            {linear > 0 && `${linear} slide`}{linear > 0 && rotary > 0 && ' · '}{rotary > 0 && `${rotary} rotate`}
          </span>
        </span>
        <span className="flex items-center gap-2">
          {moved && <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />}
          <ChevronRight className={`h-3.5 w-3.5 text-zinc-600 transition-transform ${open ? 'rotate-90' : ''}`} />
        </span>
      </button>

      {open && (
        <div className="max-h-[340px] overflow-y-auto border-t border-white/[0.1] px-3 pb-3 pt-2.5">
          {movable.map((part) => {
            const value = offsets?.[part.index]?.value ?? 0
            const { Icon, unit, hint, decimals } = controlFor(part)
            return (
              <div key={part.index} className="mb-3 last:mb-0">
                <div className="flex items-baseline justify-between gap-2">
                  <label htmlFor={`part-${part.index}`} className="flex min-w-0 items-center gap-1.5 text-xs text-zinc-300">
                    <Icon className="h-3 w-3 shrink-0 text-zinc-500" />
                    <span className="truncate">{part.name}</span>
                  </label>
                  <span className="shrink-0 font-mono text-[10px] text-amber-300">
                    {value > 0 ? '+' : ''}{value.toFixed(decimals)}{unit}
                  </span>
                </div>
                <input
                  id={`part-${part.index}`}
                  type="range"
                  min={part.min}
                  max={part.max}
                  step={Math.max((part.max - part.min) / 200, part.motion === 'rotate' ? 0.5 : 0.1)}
                  value={value}
                  onChange={(event) => onChange(part.index, part, Number(event.target.value))}
                  className="mt-1.5 h-1 w-full cursor-pointer accent-amber-400"
                />
                <p className="mt-1 font-mono text-[9px] uppercase tracking-[0.13em] text-zinc-600">
                  {hint} · {part.min}{unit} to {part.max}{unit}
                </p>
              </div>
            )
          })}

          <button
            onClick={onReset}
            disabled={!moved}
            className="mt-1 flex w-full items-center justify-center gap-2 border border-white/[0.12] py-2 font-mono text-[10px] font-semibold uppercase tracking-[0.11em] text-zinc-400 transition-colors hover:border-amber-400/35 hover:text-amber-300 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-white/[0.12] disabled:hover:text-zinc-400"
          >
            <RotateCcw className="h-3.5 w-3.5" /> Reset positions
          </button>
        </div>
      )}
    </div>
  )
}
