# safeFetchJson()

Robust helper for safely reading a Response body as JSON without throwing when
the payload is empty or not valid JSON.

```js
// Returns an object. When response has no body, returns {}.
// When body is not valid JSON, returns { raw: string }.
export async function safeFetchJson(res) {
  const text = await res.text().catch(() => "");
  if (!text) return {};
  try { return JSON.parse(text); } catch { return { raw: text }; }
}

// Example wrapper that never throws and times out.
export async function fetchJSON(url, opts = {}, timeoutMs = 10000) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...opts, signal: controller.signal });
    const data = await safeFetchJson(res);
    if (!res.ok) {
      const msg = (data && data.error) || res.statusText || 'Request failed';
      return { ok: false, error: msg };
    }
    return { ok: true, data };
  } catch (err) {
    const msg = err?.name === 'AbortError' ? 'Timeout' : (err && err.message) || 'Network error';
    return { ok: false, error: msg };
  } finally {
    clearTimeout(id);
  }
}
```

Notes:
- Prefer reading `res.text()` first; parse JSON in a try/catch.
- Do not assume the server always returns JSON on error paths.
- Wrap network calls to surface `{ ok, data | error }` instead of throwing.

