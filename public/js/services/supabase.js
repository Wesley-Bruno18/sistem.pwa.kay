import { createClient } from '@supabase/supabase-js'

const runtimeConfig = window.SUPABASE_CONFIG || {}

export const SUPABASE_URL =
  runtimeConfig.url ||
  localStorage.getItem('auto-glow:supabase-url') ||
  'https://YOUR-PROJECT.supabase.co'

export const SUPABASE_ANON_KEY =
  runtimeConfig.anonKey ||
  localStorage.getItem('auto-glow:supabase-anon-key') ||
  'YOUR_SUPABASE_ANON_KEY'

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

export { supabase }

export function isSupabaseConfigured() {
  return (
    SUPABASE_URL.startsWith('https://') &&
    SUPABASE_URL.includes('.supabase.co') &&
    SUPABASE_ANON_KEY.length > 40 &&
    !SUPABASE_URL.includes('YOUR-PROJECT') &&
    !SUPABASE_ANON_KEY.includes('YOUR_SUPABASE')
  )
}

export function saveSupabaseRuntimeConfig({ url, anonKey }) {
  localStorage.setItem('auto-glow:supabase-url', url.trim())
  localStorage.setItem('auto-glow:supabase-anon-key', anonKey.trim())
}

export function clearSupabaseRuntimeConfig() {
  localStorage.removeItem('auto-glow:supabase-url')
  localStorage.removeItem('auto-glow:supabase-anon-key')
}
