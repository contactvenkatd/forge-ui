import { useEffect, useRef, useState } from 'react'
import { LogOut } from 'lucide-react'
import Avatar from './Avatar'

export default function AuthButton({ user, onSignIn, onSignOut, disabled }) {
  const [open, setOpen] = useState(false)
  const wrap = useRef(null)

  useEffect(() => {
    if (!open) return
    const close = (event) => {
      if (!wrap.current?.contains(event.target)) setOpen(false)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [open])

  if (!user) {
    return (
      <button onClick={onSignIn} disabled={disabled} className="secondary-button disabled:cursor-not-allowed disabled:opacity-50">
        <svg className="h-3.5 w-3.5" viewBox="0 0 48 48" aria-hidden="true">
          <path fill="#4285F4" d="M45.1 24.5c0-1.6-.1-3.1-.4-4.5H24v8.5h11.8a10 10 0 0 1-4.4 6.6v5.5h7.1c4.1-3.8 6.6-9.4 6.6-16.1z" />
          <path fill="#34A853" d="M24 46c6 0 11-2 14.5-5.4l-7.1-5.5c-2 1.3-4.5 2.1-7.4 2.1-5.7 0-10.5-3.8-12.2-9H4.5v5.7A22 22 0 0 0 24 46z" />
          <path fill="#FBBC05" d="M11.8 28.2a13.2 13.2 0 0 1 0-8.4v-5.7H4.5a22 22 0 0 0 0 19.8l7.3-5.7z" />
          <path fill="#EA4335" d="M24 9.5c3.2 0 6.1 1.1 8.4 3.3l6.3-6.3C34.9 2.9 30 1 24 1 15.5 1 8.1 5.8 4.5 14.1l7.3 5.7C13.5 13.3 18.3 9.5 24 9.5z" />
        </svg>
        Sign in with Google
      </button>
    )
  }

  const name = user.user_metadata?.full_name || user.user_metadata?.name || user.email || 'Signed in'

  return (
    <div ref={wrap} className="relative">
      <button
        onClick={() => setOpen((value) => !value)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex items-center gap-2.5 border border-white/[0.12] bg-white/[0.03] py-1 pl-1 pr-3 transition-colors hover:border-amber-400/35 hover:bg-amber-400/[0.05]"
      >
        <Avatar user={user} />
        <span className="hidden max-w-[160px] truncate text-xs font-medium text-zinc-300 sm:block">{name}</span>
      </button>

      {open && (
        <div role="menu" className="absolute right-0 top-[calc(100%+6px)] z-30 w-56 border border-white/[0.12] bg-[#101214] shadow-[0_16px_40px_rgba(0,0,0,.5)]">
          <div className="border-b border-white/[0.08] px-4 py-3">
            <p className="truncate text-sm font-medium text-zinc-200">{name}</p>
            {user.email && <p className="mt-1 truncate font-mono text-[10px] text-zinc-600">{user.email}</p>}
          </div>
          <button
            role="menuitem"
            onClick={() => { setOpen(false); onSignOut() }}
            className="flex w-full items-center gap-2.5 px-4 py-3 font-mono text-[10px] font-semibold uppercase tracking-[0.11em] text-zinc-400 transition-colors hover:bg-white/[0.04] hover:text-amber-300"
          >
            <LogOut className="h-3.5 w-3.5" /> Sign out
          </button>
        </div>
      )}
    </div>
  )
}
