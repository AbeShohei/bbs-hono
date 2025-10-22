import { Hono } from 'hono'
import { serve } from '@hono/node-server'
import { readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import app from './src/app'
import { config as dotenv } from 'dotenv'

// Load environment variables for local dev
if (existsSync('.env.local')) dotenv({ path: '.env.local' })
else dotenv()

const root = new Hono()

// Serve static index.html for local dev
root.get('/', async (c) => {
  const html = await readFile('index.html', 'utf-8')
  return c.html(html)
})

// Mount API app (already basePath('/api'))
root.route('/', app)

const port = Number(process.env.PORT || 3000)
console.log(`Local dev server running: http://localhost:${port}`)
serve({ fetch: root.fetch, port })

