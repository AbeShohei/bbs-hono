// Static config to avoid env access at runtime.
// Fill these with your project values. (No top-level await.)

export const SUPABASE_URL: string = ''
export const SUPABASE_ANON_KEY: string = ''

export const CONFIG = {
  SUPABASE_URL,
  SUPABASE_ANON_KEY,
}

export function assertConfig() {
  if (!CONFIG.SUPABASE_URL || !CONFIG.SUPABASE_ANON_KEY) {
    throw new Error('Missing SUPABASE_URL or SUPABASE_ANON_KEY in src/config.ts')
  }
}
