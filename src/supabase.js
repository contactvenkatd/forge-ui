import { createClient } from '@supabase/supabase-js'

// Trim defensively: a stray trailing newline/space in a GitHub Actions
// secret is enough to make the URL fail to parse below.
const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL || '').trim()
const supabaseAnonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY || '').trim()

function isValidHttpUrl(value) {
  try {
    const parsed = new URL(value)
    return parsed.protocol === 'http:' || parsed.protocol === 'https:'
  } catch {
    return false
  }
}

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey && isValidHttpUrl(supabaseUrl))

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in your .env file.')
} else if (!isValidHttpUrl(supabaseUrl)) {
  // Never let a bad env value take down the whole app at import time.
  console.error(
    `Supabase is misconfigured: VITE_SUPABASE_URL is not a valid URL (got "${supabaseUrl}"). ` +
      'Check the VITE_SUPABASE_URL secret/env value for stray quotes, whitespace, or a missing https:// prefix. ' +
      'Sign-in and saved projects are disabled until this is fixed.'
  )
}

export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        // Read the OAuth tokens / PKCE code out of the callback URL on load.
        detectSessionInUrl: true,
        // Keep the session in localStorage so a reload stays signed in.
        persistSession: true,
        autoRefreshToken: true,
      },
    })
  : null
