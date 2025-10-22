import { Hono } from 'hono'
import { z } from 'zod'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { CONFIG, assertConfig } from './config'

const app = new Hono()

// health
app.get('/healthz', (c) => c.text('ok'))

// diagnostics for static config (does not leak secrets)
app.get('/_diag/config', (c) => {
  const hasUrl = Boolean(CONFIG.SUPABASE_URL)
  const hasKey = Boolean(CONFIG.SUPABASE_ANON_KEY)
  return c.json({ hasUrl, hasKey })
})

// Supabase client per request (Cloudflare Workers bindings)
function getSupabase(): SupabaseClient {
  assertConfig()
  return createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY, {
    global: { fetch },
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

// validation
const PostInsert = z.object({
  author: z.string().trim().max(32).optional().or(z.literal('').transform(() => undefined)),
  content: z.string().trim().min(1).max(500),
})

// list
app.get('/api/posts', async (c) => {
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
app.post('/api/posts', async (c) => {
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
  const { author, content } = parsed.data
  const supabase = getSupabase()
  const { data, error } = await supabase
    .from('posts')
    .insert([{ author: author ?? null, content }])
    .select()
    .single()
  if (error) return c.json({ error: error.message }, 500)
  return c.json({ post: data }, 201)
})

// simple frontend
app.get('/', (c) =>
  c.html(`<!doctype html><html><head><meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>BBS</title>
<style>
body { font-family: system-ui, sans-serif; max-width: 720px; margin: 24px auto; padding: 0 12px; }
.post { border: 1px solid #ddd; border-radius: 8px; padding: 12px; margin: 8px 0; }
.meta { color: #666; font-size: 12px; }
form { display: grid; gap: 8px; margin-bottom: 16px; }
input, textarea { padding: 8px; font-size: 14px; }
button { padding: 8px 12px; font-size: 14px; }
</style></head><body>
<h1>BBS</h1>
<p>Hono + Cloudflare Workers + Supabase</p>
<form id="post-form">
  <input id="author" name="author" maxlength="32" placeholder="Name (optional)" />
  <textarea id="content" name="content" rows="4" maxlength="500" placeholder="Content (required)" required></textarea>
  <button type="submit">Post</button>
</form>
<section id="list"></section>
<script>
const elList = document.getElementById('list');
const form = document.getElementById('post-form');
async function load() {
  elList.innerHTML = '<p>Loading...</p>';
  const res = await fetch('/api/posts');
  const data = await res.json();
  const posts = data.posts || [];
  if (!posts.length) { elList.innerHTML = '<p>No posts yet</p>'; return; }
  elList.innerHTML = posts.map(p => {
    const when = p.created_at ? new Date(p.created_at).toLocaleString() : '';
    const who = p.author || 'Anonymous';
    const body = (p.content || '').replace(/&/g,'&amp;').replace(/</g,'&lt;');
    return '<div class="post"><div class="meta">' + who + ' - ' + when + '</div><div>' + body + '</div></div>';
  }).join('');
}
form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const author = (document.getElementById('author')).value;
  const content = (document.getElementById('content')).value;
  const res = await fetch('/api/posts', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ author, content }) });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    alert('Failed to post: ' + (err.error || res.status));
    return;
  }
  (document.getElementById('content')).value = '';
  await load();
});
load();
</script>
</body></html>`),
)

export default app
