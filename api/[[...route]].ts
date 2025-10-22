import app from '../src/app.js'

// Use Node runtime on Vercel to ensure process.env is available
export const config = { runtime: 'nodejs' }

export default (req: Request) => app.fetch(req)
