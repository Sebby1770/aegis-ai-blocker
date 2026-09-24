import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, cpSync, writeFileSync } from 'node:fs'
import { createServer, type Server } from 'node:https'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium, expect, test as base, type BrowserContext, type Page, type Worker } from '@playwright/test'

// Real-browser harness for the Aegis Enforcer extension.
//
// - Loads the unpacked extension (a fresh copy of extension/) into Chromium.
// - Maps EVERY hostname to 127.0.0.1 (--host-resolver-rules), where a local
//   HTTPS server with a throwaway self-signed certificate answers — so
//   https://chatgpt.com/ really navigates, nothing leaves the machine, and the
//   server's request log is ground truth for "did this request get through?".
// - HTTPS everywhere sidesteps HSTS-preloaded TLDs (.dev, .app, …) that would
//   otherwise upgrade plain-http test navigations.

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
export const EXTENSION_SOURCE = path.join(repoRoot, 'extension')

type RequestLog = Array<{ host: string; path: string }>

export type Probe = {
  port: number
  requests: RequestLog
  url(host: string, pathname?: string): string
  reached(host: string): boolean
  reset(): void
}

export type ExtensionHandle = {
  id: string
  worker(): Promise<Worker>
  setState(state: Record<string, unknown>): Promise<void>
  dynamicRules(): Promise<DnrRule[]>
  sessionRules(): Promise<DnrRule[]>
  storage(): Promise<Record<string, unknown>>
}

export type DnrRule = {
  id: number
  priority?: number
  action: { type: string; redirect?: { extensionPath?: string; regexSubstitution?: string; url?: string } }
  condition: Record<string, unknown>
}

function certificate(dir: string) {
  const key = path.join(dir, 'key.pem')
  const cert = path.join(dir, 'cert.pem')
  execFileSync('openssl', [
    'req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '1',
    '-subj', '/CN=aegis-e2e', '-keyout', key, '-out', cert,
  ], { stdio: 'ignore' })
  return { key: readFileSync(key), cert: readFileSync(cert) }
}

// Uses the Playwright-managed Chromium when it's installed; otherwise any
// preinstalled Playwright Chromium build (cloud dev containers pin one).
function chromiumExecutable() {
  const managed = chromium.executablePath()
  if (existsSync(managed)) {
    return undefined
  }

  const root = process.env.PLAYWRIGHT_BROWSERS_PATH
  const candidate = root
    ? readdirSync(root)
        .filter((entry) => /^chromium-\d+$/.test(entry))
        .sort()
        .map((entry) => path.join(root, entry, 'chrome-linux', 'chrome'))
        .find((file) => existsSync(file))
    : undefined

  return candidate
}

export async function launchWithExtension(extensionDir: string, userDataDir: string) {
  return chromium.launchPersistentContext(userDataDir, {
    channel: 'chromium',
    headless: true,
    executablePath: chromiumExecutable(),
    ignoreHTTPSErrors: true,
    args: [
      `--disable-extensions-except=${extensionDir}`,
      `--load-extension=${extensionDir}`,
      '--host-resolver-rules=MAP * 127.0.0.1',
      '--no-proxy-server',
    ],
  })
}

export async function extensionWorker(context: BrowserContext) {
  const existing = context.serviceWorkers().find((worker) => worker.url().startsWith('chrome-extension://'))
  return existing ?? (await context.waitForEvent('serviceworker'))
}

export function handleFor(context: BrowserContext, id: string): ExtensionHandle {
  const worker = async () => {
    const found = context.serviceWorkers().find((candidate) => candidate.url().startsWith(`chrome-extension://${id}/`))
    return found ?? (await context.waitForEvent('serviceworker'))
  }

  return {
    id,
    worker,
    async setState(state) {
      await (await worker()).evaluate((next) => chrome.storage.local.set(next), state)
    },
    async dynamicRules() {
      return (await worker()).evaluate(() => chrome.declarativeNetRequest.getDynamicRules()) as Promise<DnrRule[]>
    },
    async sessionRules() {
      return (await worker()).evaluate(() => chrome.declarativeNetRequest.getSessionRules()) as Promise<DnrRule[]>
    },
    async storage() {
      return (await worker()).evaluate(() => chrome.storage.local.get(null))
    },
  }
}

// Navigates a fresh tab and reports what happened from the user's point of
// view. A new tab per visit avoids racing a previous block's error page.
export async function visit(context: BrowserContext, url: string): Promise<'loaded' | 'blocked' | 'redirected'> {
  const page = await context.newPage()
  try {
    const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 10_000 })
    if (page.url().startsWith('chrome-extension://')) {
      return 'redirected'
    }
    return response && response.ok() ? 'loaded' : 'blocked'
  } catch (error) {
    if (String(error).includes('ERR_BLOCKED_BY_CLIENT')) {
      return 'blocked'
    }
    throw error
  } finally {
    await page.close()
  }
}

// Opens a tab on `origin` (which must be allowed) and fires a cross-origin
// subresource request from it (no-cors fetch, like a script or beacon would),
// reporting whether the request reached the network.
export async function subresourceFrom(context: BrowserContext, origin: string, url: string) {
  const page = await context.newPage()
  try {
    await page.goto(origin, { waitUntil: 'domcontentloaded' })
    return await subresource(page, url)
  } finally {
    await page.close()
  }
}

// Fires a cross-origin subresource request (no-cors fetch, like a script or
// beacon would) from inside `page` and reports whether it reached the network.
export async function subresource(page: Page, url: string): Promise<'reached' | 'blocked'> {
  return page.evaluate(
    (target) =>
      fetch(target, { mode: 'no-cors', cache: 'no-store' }).then(
        () => 'reached' as const,
        () => 'blocked' as const,
      ),
    url,
  )
}

type Fixtures = {
  context: BrowserContext
  extension: ExtensionHandle
}

type WorkerFixtures = {
  probe: Probe
}

export const test = base.extend<Fixtures, WorkerFixtures>({
  probe: [
    // eslint-disable-next-line no-empty-pattern
    async ({}, use) => {
      const dir = mkdtempSync(path.join(tmpdir(), 'aegis-e2e-cert-'))
      const requests: RequestLog = []
      const server: Server = createServer(certificate(dir), (req, res) => {
        const host = (req.headers.host ?? '').replace(/:\d+$/, '')
        requests.push({ host, path: req.url ?? '/' })
        if ((req.url ?? '').endsWith('.json')) {
          res.writeHead(404).end()
          return
        }
        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'access-control-allow-origin': '*' })
        res.end(`<!doctype html><title>${host}</title><h1 id="host">${host}</h1>`)
      })
      await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
      const { port } = server.address() as AddressInfo

      await use({
        port,
        requests,
        url: (host, pathname = '/') => `https://${host}:${port}${pathname}`,
        reached: (host) => requests.some((entry) => entry.host === host),
        reset: () => {
          requests.length = 0
        },
      })

      await new Promise<void>((resolve) => server.close(() => resolve()))
      rmSync(dir, { recursive: true, force: true })
    },
    { scope: 'worker' },
  ],

  context: async ({ probe }, use) => {
    probe.reset()
    const extensionDir = mkdtempSync(path.join(tmpdir(), 'aegis-e2e-ext-'))
    const profileDir = mkdtempSync(path.join(tmpdir(), 'aegis-e2e-profile-'))
    cpSync(EXTENSION_SOURCE, extensionDir, { recursive: true })
    prepareExtension(extensionDir)

    const context = await launchWithExtension(extensionDir, profileDir)
    await use(context)
    await context.close()
    rmSync(extensionDir, { recursive: true, force: true })
    rmSync(profileDir, { recursive: true, force: true })
  },

  extension: async ({ context }, use) => {
    const worker = await extensionWorker(context)
    const id = new URL(worker.url()).host
    const handle = handleFor(context, id)

    // Extension API bindings attach to the worker a moment after it starts.
    await expect
      .poll(async () => (await handle.worker()).evaluate(() => typeof chrome.declarativeNetRequest), { timeout: 15_000 })
      .toBe('object')

    // onInstalled compiles the default policy; wait until it has landed.
    await expect.poll(async () => (await handle.dynamicRules()).length, { timeout: 15_000 }).toBeGreaterThan(0)
    await use(handle)
  },
})

// Hook for specs that need to adjust the unpacked copy before launch (e.g. to
// simulate a granted optional permission). Default: load it exactly as shipped.
let manifestPatch: ((manifest: Record<string, unknown>) => void) | null = null

export function patchManifestForThisFile(patch: (manifest: Record<string, unknown>) => void) {
  manifestPatch = patch
}

function prepareExtension(dir: string) {
  if (!manifestPatch) {
    return
  }
  const file = path.join(dir, 'manifest.json')
  const manifest = JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown>
  manifestPatch(manifest)
  writeFileSync(file, JSON.stringify(manifest, null, 2))
}

export { expect }
