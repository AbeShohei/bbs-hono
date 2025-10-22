// Static config to avoid env access at runtime.
// Fill these with your project values. For local-only overrides, create
// `src/config.local.ts` exporting the same names; it is git-ignored.

export const SUPABASE_URL: string = ''
export const SUPABASE_ANON_KEY: string = ''

// Optional: load local override if present (bundlers will tree-shake try/catch if not used)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let overrides: any = {}
try {
  // @ts-ignore - this file may not exist; it's fine
  overrides = await import('./config.local')
} catch {}

export const CONFIG = {
  SUPABASE_URL: overrides.SUPABASE_URL ?? SUPABASE_URL,
  SUPABASE_ANON_KEY: overrides.SUPABASE_ANON_KEY ?? SUPABASE_ANON_KEY,
}

export function assertConfig() {
  if (!CONFIG.SUPABASE_URL || !CONFIG.SUPABASE_ANON_KEY) {
    throw new Error('Missing SUPABASE_URL or SUPABASE_ANON_KEY in src/config.ts (or config.local.ts)')
  }
}

