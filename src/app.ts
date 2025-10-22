import { Hono } from 'hono'
import { z } from 'zod'
import { createClient } from '@supabase/supabase-js'
import { CONFIG, assertConfig } from './config'

const app = new Hono().basePath('/api')

// Static config (no env access)
function getSupabase() {
  assertConfig()
  return createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY, {
    global: { fetch },
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

// health
app.get('/healthz', (c) => c.text('ok'))

// validation
const PostInsert = z.object({
  author: z.string().trim().max(32).optional().or(z.literal('').transform(() => undefined)),
  content: z.string().trim().min(1).max(500),
})

// list
app.get('/posts', async (c) => {
  const supabase = getSupabase()
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
  const supabase = getSupabase()
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
