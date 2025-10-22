import { Hono } from 'hono'
import { z } from 'zod'
export const config = { runtime: 'nodejs' }
import { createClient } from '@supabase/supabase-js'
import { CONFIG } from './config.js'

const app = new Hono().basePath('/api')

// Return JSON for unhandled exceptions and log structured details for Vercel Logs
app.onError((err, c) => {
  const url = new URL(c.req.url)
  const message = err instanceof Error ? err.message : String(err)
  const stack = err instanceof Error ? err.stack : undefined
  // Structured error log for Vercel Functions Logs
  console.error(
    JSON.stringify(
      {
        level: 'error',
        at: 'app.onError',
        runtime: 'nodejs',
        method: c.req.method,
        path: url.pathname,
        message,
        stack,
      },
      null,
      2,
    ),
  )
  return c.json({ error: message }, 500)
})

// env から anon キーで初期化（NEXT_PUBLIC_* も許容）
function getSupabaseAnon() {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) throw new Error(`Missing Supabase env: url=${!!url}, anon=${!!key}`)
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
}

// Server-only client using Service Role key (never expose to client).
// Use for admin/maintenance endpoints guarded by auth.
function getSupabaseService() {
  const env = (typeof process !== 'undefined' ? process.env ?? {} : {}) as Record<string, string | undefined>
  const url = env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL || CONFIG.SUPABASE_URL
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY // no NEXT_PUBLIC variant by design
  if (!url || !serviceKey) throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY for service client')
  return createClient(url, serviceKey, {
    global: { fetch },
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

// health
app.get('/healthz', (c) => c.text('ok'))

// debug env（確認後に削除可）: true/false を返す
app.get('/__debug', (c) => {
  const hasUrl = Boolean(process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL)
  const hasAnon = Boolean(process.env.SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
  return c.text(hasUrl && hasAnon ? 'true' : 'false')
})

// debug (no secrets leaked)
app.get('/_debug/env', (c) => {
  const env = (typeof process !== 'undefined' ? process.env ?? {} : {}) as Record<string, string | undefined>
  const hasUrlEnv = Boolean(env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL)
  const hasKeyEnv = Boolean(env.SUPABASE_ANON_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
  const hasService = Boolean(env.SUPABASE_SERVICE_ROLE_KEY)
  const hasConfigUrl = Boolean(CONFIG.SUPABASE_URL)
  const hasConfigKey = Boolean(CONFIG.SUPABASE_ANON_KEY)
  const node = typeof process !== 'undefined' ? process.versions?.node : undefined
  return c.json({ hasUrlEnv, hasKeyEnv, hasService, hasConfigUrl, hasConfigKey, runtime: 'nodejs', node })
})

// validation
const PostInsert = z.object({
  author: z.string().trim().max(32).optional().or(z.literal('').transform(() => undefined)),
  content: z.string().trim().min(1).max(500),
})

// list
app.get('/posts', async (c) => {
  const supabase = getSupabaseAnon()
  const { data, error } = await supabase
    .from('posts')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(50)
  if (error) return c.json({ error: error.message }, 500)
  return c.json({ posts: data ?? [] })
})

// create
app.post('/posts', async (c) => {
  const json = (await c.req.json().catch(() => null)) as unknown
  if (!json) return c.json({ error: 'Invalid JSON' }, 400)
  const parsed = PostInsert.safeParse(json)
  if (!parsed.success) return c.json({ error: 'Validation failed', details: parsed.error.flatten() }, 400)

  const { author, content } = parsed.data

  //  anon で書くなら
  const supabase = getSupabaseAnon()
  //  RLS を避けて service role で書くなら（上行と差し替え）
  // const supabase = getSupabaseService()

  const { data, error } = await supabase
    .from('posts')
    .insert([{ author: author ?? null, content }])
    .select()
    .single()
  if (error) return c.json({ error: error.message }, 500)
  return c.json({ post: data }, 201)
})

// Service Role insert path (protect with auth in production)
// Enable this only if SUPABASE_SERVICE_ROLE_KEY is configured.
app.post('/posts/admin', async (c) => {
  let json: unknown
  try {
    json = await c.req.json()
  } catch {
    return c.json({ error: 'Invalid JSON' }, 400)
  }
  const parsed = PostInsert.safeParse(json)
  if (!parsed.success) {
    return c.json({ error: 'Validation failed', details: parsed.error.flatten() }, 400)
  }

  const hasService = typeof process !== 'undefined' && Boolean(process.env?.SUPABASE_SERVICE_ROLE_KEY)
  if (!hasService) return c.json({ error: 'Service role not configured' }, 403)

  const supabase = getSupabaseService()
  const { author, content } = parsed.data
  const { data, error } = await supabase
    .from('posts')
    .insert([{ author: author ?? null, content }])
    .select()
    .single()
  if (error) return c.json({ error: error.message }, 500)
  return c.json({ post: data }, 201)
})

export default app
