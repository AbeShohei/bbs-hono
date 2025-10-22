import app from '../src/app'

export const config = { runtime: 'edge' }

export default (req: Request) => app.fetch(req)
