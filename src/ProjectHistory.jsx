import { useCallback, useEffect, useState } from 'react'
import { Clock, History, Lock, RotateCw } from 'lucide-react'
import { fallbackName } from './grok'
import { supabase } from './supabase'

function formatStamp(value) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

export default function ProjectHistory({ user, refreshKey = 0, error: externalError = '', onSelect }) {
  const [projects, setProjects] = useState([])
  const [loading, setLoading] = useState(false)
  const [fetchError, setFetchError] = useState('')

  const fetchProjects = useCallback(async (userId, isStale) => {
    setLoading(true)
    const { data, error } = await supabase
      .from('projects')
      .select('*')
      .eq('user_id', userId)
      .order('timestamp', { ascending: false })

    if (isStale()) return

    if (error) console.log('[projects] fetch error:', error.message)
    else console.log('[projects] loaded', data?.length ?? 0, 'project(s)')

    setFetchError(error ? error.message : '')
    setProjects(error ? [] : data ?? [])
    setLoading(false)
  }, [])

  // Refetches whenever the signed-in user changes — including the moment the
  // OAuth redirect resolves — and whenever App bumps refreshKey after a save.
  useEffect(() => {
    if (!supabase || !user) {
      setProjects([])
      setFetchError('')
      setLoading(false)
      return
    }

    let cancelled = false
    fetchProjects(user.id, () => cancelled)
    return () => { cancelled = true }
  }, [user, refreshKey, fetchProjects])

  const error = fetchError || externalError

  return (
    <div className="mt-9 border-t border-white/[0.08] pt-7">
      <div className="flex items-center justify-between gap-3">
        <p className="eyebrow"><span>02</span> Project history</p>
        {user && (
          <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-zinc-600">
            {loading ? 'Loading' : `${projects.length} saved`}
          </span>
        )}
      </div>

      {!user ? (
        <div className="mt-4 flex items-start gap-3 border border-white/[0.08] bg-white/[0.015] px-4 py-4">
          <Lock className="mt-0.5 h-4 w-4 shrink-0 text-zinc-600" strokeWidth={1.6} />
          <p className="text-sm leading-6 text-zinc-500">Sign in to save your projects.</p>
        </div>
      ) : error ? (
        <p className="mt-4 border border-red-500/25 bg-red-500/[0.05] px-4 py-4 text-sm leading-6 text-red-300/90">{error}</p>
      ) : loading && projects.length === 0 ? (
        <p className="mt-4 flex items-center gap-2.5 px-1 font-mono text-[10px] uppercase tracking-[0.14em] text-zinc-600">
          <RotateCw className="h-3.5 w-3.5 animate-spin" /> Loading history
        </p>
      ) : projects.length === 0 ? (
        <div className="mt-4 flex items-start gap-3 border border-white/[0.08] bg-white/[0.015] px-4 py-4">
          <History className="mt-0.5 h-4 w-4 shrink-0 text-zinc-600" strokeWidth={1.6} />
          <p className="text-sm leading-6 text-zinc-500">No projects yet. Generate a design to save your first one.</p>
        </div>
      ) : (
        <ul className="mt-4 max-h-64 space-y-1.5 overflow-y-auto pr-1">
          {projects.map((project) => (
            <li key={project.id}>
              <button
                onClick={() => onSelect(project)}
                title="Load this description"
                className="group w-full border border-white/[0.08] bg-white/[0.015] px-4 py-3 text-left transition-colors hover:border-amber-400/35 hover:bg-amber-400/[0.04]"
              >
                <p className="line-clamp-2 text-sm font-medium leading-6 text-zinc-300 transition-colors group-hover:text-zinc-100">
                  {project.name?.trim() || fallbackName(project.description)}
                </p>
                <p className="mt-1.5 flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-zinc-600">
                  <Clock className="h-3 w-3" /> {formatStamp(project.timestamp)}
                </p>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
