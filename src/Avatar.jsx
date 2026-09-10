import { useState } from 'react'
import { User } from 'lucide-react'

export default function Avatar({ user, size = 'h-7 w-7', iconSize = 'h-3.5 w-3.5' }) {
  const [broken, setBroken] = useState(false)
  const url = user?.user_metadata?.avatar_url || user?.user_metadata?.picture

  if (!url || broken) {
    return (
      <span className={`${size} grid shrink-0 place-items-center rounded-full border border-white/10 bg-white/[0.04] text-zinc-500`}>
        <User className={iconSize} strokeWidth={1.7} />
      </span>
    )
  }

  return (
    <img
      src={url}
      alt=""
      referrerPolicy="no-referrer"
      onError={() => setBroken(true)}
      className={`${size} shrink-0 rounded-full border border-white/10 object-cover`}
    />
  )
}
