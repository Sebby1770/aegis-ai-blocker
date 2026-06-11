import { guardRequest } from './_lib/http.js'
import type { ApiRequest, ApiResponse } from './_lib/types.js'

// Liveness probe for uptime monitors. Returns no build, env, or dependency
// details: a 200 means the API runtime is serving requests, nothing more.
export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (!(await guardRequest(req, res, { method: 'GET' }))) {
    return
  }

  return res.status(200).json({ status: 'ok', time: new Date().toISOString() })
}
