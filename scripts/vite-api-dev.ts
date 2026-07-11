import { existsSync } from 'node:fs'
import path from 'node:path'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { createServerModuleRunner, loadEnv, type Plugin } from 'vite'

type VercelStyleResponse = ServerResponse & {
  status?: (code: number) => VercelStyleResponse
  json?: (body: unknown) => void
}

type VercelStyleHandler = (req: IncomingMessage, res: VercelStyleResponse) => Promise<unknown>

// Serves the Vercel serverless functions in `api/` from the Vite dev server,
// so the full SaaS flow (auth -> entitlement -> checkout -> webhook) can run
// locally with plain `npm run dev`. Dev-only: `apply: 'serve'` means the
// production build and the deployed Vercel functions are untouched.
//
// Handlers are loaded through a module runner on the SSR environment
// (Environment API), which transforms the TypeScript on demand — including
// Vercel's `.js`-specifier-to-`.ts` imports — and re-transforms automatically
// when a file under api/ changes. (The legacy `server.ssrLoadModule` shim
// deadlocks under Vite 8's rolldown pipeline; the runner does not.)
export function apiDevPlugin(): Plugin {
  return {
    name: 'aegis-api-dev',
    apply: 'serve',
    configureServer(server) {
      const root = server.config.root
      const apiDir = path.resolve(root, 'api')
      const runner = createServerModuleRunner(server.environments.ssr)

      // Vercel functions read configuration from process.env; Vite keeps env
      // files out of it. Bridge the gap without overriding real shell vars.
      const fileEnv = loadEnv(server.config.mode, root, '')
      for (const [key, value] of Object.entries(fileEnv)) {
        if (process.env[key] === undefined) {
          process.env[key] = value
        }
      }

      server.middlewares.use('/api', (req, res, next) => {
        void (async () => {
          const name = (req.url ?? '').split('?')[0].replace(/^\/+/, '')

          if (!/^[a-z0-9-]+$/.test(name) || !existsSync(path.join(apiDir, `${name}.ts`))) {
            next()
            return
          }

          const mod = (await runner.import(`/api/${name}.ts`)) as {
            default: VercelStyleHandler
          }

          const wrapped = res as VercelStyleResponse
          wrapped.status = (code: number) => {
            wrapped.statusCode = code
            return wrapped
          }
          wrapped.json = (body: unknown) => {
            wrapped.setHeader('Content-Type', 'application/json')
            wrapped.end(JSON.stringify(body))
          }

          await mod.default(req, wrapped)
        })().catch((error: unknown) => {
          server.config.logger.error(`[api-dev] ${String(error)}`)
          if (!res.headersSent) {
            res.statusCode = 500
            res.setHeader('Content-Type', 'application/json')
          }
          if (!res.writableEnded) {
            res.end(JSON.stringify({ error: 'dev_api_failed' }))
          }
        })
      })
    },
  }
}
