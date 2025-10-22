import { Hono } from 'hono'
import { z } from 'zod'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { CONFIG } from './config.js'

type Bindings = {
  SUPABASE_URL: string
  SUPABASE_ANON_KEY: string
}

const app = new Hono<{ Bindings: Bindings }>()

// health
app.get('/healthz', (c) => c.text('ok'))

// diagnostics for static config (does not leak secrets)
app.get('/_diag/config', (c) => {
  const hasUrl = Boolean(CONFIG.SUPABASE_URL)
  const hasKey = Boolean(CONFIG.SUPABASE_ANON_KEY)
  return c.json({ hasUrl, hasKey })
})

// Supabase client per request (Cloudflare Workers bindings)
function getSupabase(c: import('hono').Context<{ Bindings: Bindings }>): SupabaseClient {
  const url = c.env?.SUPABASE_URL ?? CONFIG.SUPABASE_URL
  const key = c.env?.SUPABASE_ANON_KEY ?? CONFIG.SUPABASE_ANON_KEY
  if (!url || !key) {
    throw new Error('Missing SUPABASE_URL or SUPABASE_ANON_KEY (env or config.ts)')
  }
  return createClient(url, key, {
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
  const supabase = getSupabase(c)
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
  const supabase = getSupabase(c)
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
const btn = document.querySelector('button[type="submit"]');
function escapeHtml(s){ return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;') }
function sleep(ms){ return new Promise(r=>setTimeout(r,ms)) }
async function safeFetchJson(res){
  const text = await res.text().catch(()=>"");
  if (!text) return {};
  try { return JSON.parse(text) } catch { return { raw: text } }
}
async function fetchJSON(url, opts = {}, timeoutMs = 10000){
  const controller = new AbortController();
  const id = setTimeout(()=>controller.abort(), timeoutMs);
  try{
    const res = await fetch(url, { ...opts, signal: controller.signal });
    const data = await safeFetchJson(res);
    if (!res.ok) { throw new Error((data && data.error) || res.statusText || 'Request failed') }
    return { ok: true, data };
  }catch(err){
    const msg = err?.name === 'AbortError' ? 'Timeout' : (err && err.message) || 'Network error';
    return { ok: false, error: msg };
  }finally{ clearTimeout(id) }
}
async function load() {
  elList.innerHTML = '<p>Loading...</p>';
  const retries=[0,500,1500];
  for (let i=0;i<retries.length;i++){
    if (retries[i]) await sleep(retries[i]);
    const res = await fetchJSON('/api/posts');
    if (res.ok){
      const posts = res.data.posts || [];
      if (!posts.length) { elList.innerHTML = '<p>No posts yet</p>'; return; }
      elList.innerHTML = posts.map(p => {
        const when = p.created_at ? new Date(p.created_at).toLocaleString() : '';
        const who = p.author || 'Anonymous';
        const body = escapeHtml(p.content);
        return '<div class="post"><div class="meta">' + escapeHtml(who) + ' - ' + when + '</div><div>' + body + '</div></div>';
      }).join('');
      return;
    }
  }
  elList.innerHTML = '<p>Failed to load. Please retry later.</p>';
}
form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const author = (document.getElementById('author')).value.trim();
  const content = (document.getElementById('content')).value.trim();
  if (!content) { alert('Content is required'); return; }
  if (btn) btn.disabled = true;
  const res = await fetchJSON('/api/posts', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ author, content }) });
  if (btn) btn.disabled = false;
  if (!res.ok) { alert('Failed to post: ' + res.error); return; }
  (document.getElementById('content')).value = '';
  await load();
});
load();
</script>
</body></html>`),
)

export default app
