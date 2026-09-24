import { readFileSync } from 'node:fs'
import path from 'node:path'
import type { BrowserContext } from '@playwright/test'
import { runnerImport } from 'vite'
import { buildDnrRules, resolveBlockedDomains } from '../extension/enforce.js'
import { sanitizePack } from '../extension/pack-validate.js'
import type * as ExplainModule from '../src/lib/explain'
import { EXTENSION_SOURCE, expect, subresource, test, visit, type ExtensionHandle, type Probe } from './fixtures'

// The product's core promise, checked in a real Chromium with the unpacked
// extension: requests to blocked AI domains never reach the network, allowed
// traffic does, and every mode/exception change recompiles the live
// declarativeNetRequest rules to exactly what the pure policy engine says.

type Pack = Parameters<typeof resolveBlockedDomains>[0]
type State = { activePolicyId?: string; paused?: boolean; allowDomains?: string[]; blockDomains?: string[] }

// The worker sanitizes even the bundled pack (folding e.g. www.perplexity.ai
// into perplexity.ai), so the oracle does too.
const pack = sanitizePack(JSON.parse(readFileSync(path.join(EXTENSION_SOURCE, 'rules/pack.json'), 'utf8'))) as Pack

// The dashboard's own explanation engine, loaded through Vite (it imports the
// rule pack JSON the way the app bundle does).
async function dashboardExplain() {
  const { module } = await runnerImport<typeof ExplainModule>(path.resolve(EXTENSION_SOURCE, '../src/lib/explain.ts'))
  return module.explainDomain
}
const DEFAULTS: State = { activePolicyId: 'strict-no-ai', paused: false, allowDomains: [], blockDomains: [] }

function expectedRules(state: State) {
  return buildDnrRules(resolveBlockedDomains(pack, { ...DEFAULTS, ...state }))
}

function byId<T extends { id: number }>(rules: T[]) {
  return [...rules].sort((a, b) => a.id - b.id)
}

async function applyAndSettle(extension: ExtensionHandle, state: State) {
  await extension.setState({ ...DEFAULTS, ...state })
  await expect
    .poll(async () => byId(await extension.dynamicRules()), { timeout: 10_000 })
    .toEqual(byId(expectedRules(state)))
}

// Fires one no-cors request per host from a single allowed page and reports
// which ones the browser let through. Fast enough to sweep the whole pack.
async function sweep(context: BrowserContext, probe: Probe, hosts: string[]) {
  const page = await context.newPage()
  await page.goto(probe.url('neutral.example'), { waitUntil: 'domcontentloaded' })
  const results: Record<string, 'reached' | 'blocked'> = {}
  for (const host of hosts) {
    results[host] = await subresource(page, probe.url(host, '/probe'))
  }
  await page.close()
  return results
}

function hostsWith(results: Record<string, string>, outcome: string) {
  return Object.keys(results).filter((host) => results[host] === outcome)
}

test.describe('default install (Strict no-AI)', () => {
  test('live rules are exactly the compiled default policy', async ({ extension }) => {
    expect(byId(await extension.dynamicRules())).toEqual(byId(expectedRules(DEFAULTS)))
  })

  test('every blocked domain is blocked, as a page and as a subresource', async ({ context, extension, probe }) => {
    const { blocked } = resolveBlockedDomains(pack, DEFAULTS)
    expect(blocked.length).toBeGreaterThan(100)
    void extension

    const results = await sweep(context, probe, blocked)
    expect(hostsWith(results, 'reached')).toEqual([])

    for (const host of ['chatgpt.com', 'claude.ai', 'gemini.google.com', 'perplexity.ai']) {
      expect(await visit(context, probe.url(host))).toBe('blocked')
    }
    for (const host of blocked) {
      expect(probe.reached(host)).toBe(false)
    }
  })

  test('parent-domain rules cover subdomains; lookalikes are not collateral damage', async ({ context, extension, probe }) => {
    void extension
    const results = await sweep(context, probe, [
      'www.chatgpt.com',
      'deep.nested.chatgpt.com',
      'files.oaiusercontent.com',
      'api.anthropic.com',
      'notchatgpt.com',
      'chatgpt.com.example.com',
      'openai.com.evil.example',
      'claude.aix',
      'google.com',
      'mail.google.com',
      'github.com',
      'wikipedia.org',
    ])

    expect(hostsWith(results, 'blocked').sort()).toEqual(
      ['api.anthropic.com', 'deep.nested.chatgpt.com', 'files.oaiusercontent.com', 'www.chatgpt.com'].sort(),
    )
  })

  // FINDING: `||chatgpt.com^` URL filters do not match a fully-qualified
  // hostname with a trailing dot, so https://chatgpt.com./ loaded straight
  // through the blocker (a well-known ad-blocker bypass).
  test('trailing-dot and mixed-case hostnames are still blocked', async ({ context, extension, probe }) => {
    void extension
    expect(await visit(context, probe.url('chatgpt.com.'))).toBe('blocked')
    expect(await visit(context, probe.url('ChatGPT.COM'))).toBe('blocked')

    const results = await sweep(context, probe, ['api.openai.com.', 'sub.claude.ai.', 'CLAUDE.AI'])
    expect(hostsWith(results, 'reached')).toEqual([])
  })

  test('embedded AI (iframes) on an unrelated site is blocked too', async ({ context, extension, probe }) => {
    void extension
    const page = await context.newPage()
    await page.goto(probe.url('blog.example'), { waitUntil: 'domcontentloaded' })
    await page.evaluate((src) => {
      const frame = document.createElement('iframe')
      frame.src = src
      document.body.append(frame)
    }, probe.url('chatgpt.com', '/embed'))
    await page.waitForTimeout(500)
    expect(probe.reached('chatgpt.com')).toBe(false)
  })
})

test.describe('modes', () => {
  test('every policy compiles to exactly its rules in the browser', async ({ extension }) => {
    for (const policy of pack.policies) {
      await applyAndSettle(extension, { activePolicyId: policy.id })
    }
  })

  test('switching modes changes what is blocked, live', async ({ context, extension, probe }) => {
    await applyAndSettle(extension, { activePolicyId: 'focus' })
    let results = await sweep(context, probe, ['chatgpt.com', 'cursor.com', 'grammarly.com', 'api.openai.com'])
    expect(results).toEqual({
      'chatgpt.com': 'blocked', // chat is blocked under Focus
      'cursor.com': 'reached', // coding tools stay reachable
      'grammarly.com': 'reached', // strict-only service, Focus is not strict
      'api.openai.com': 'blocked', // covered by the openai.com chat rule's parent match
    })

    await applyAndSettle(extension, { activePolicyId: 'child-safe' })
    results = await sweep(context, probe, ['grammarly.com', 'cursor.com'])
    expect(results).toEqual({ 'grammarly.com': 'blocked', 'cursor.com': 'reached' })

    await applyAndSettle(extension, { activePolicyId: 'strict-no-ai' })
    results = await sweep(context, probe, ['cursor.com', 'huggingface.co'])
    expect(results).toEqual({ 'cursor.com': 'blocked', 'huggingface.co': 'blocked' })
  })

  test('pause lifts the pack but keeps custom blocks; resume restores it', async ({ context, extension, probe }) => {
    await applyAndSettle(extension, { paused: true, blockDomains: ['distracting.example'] })
    expect(await sweep(context, probe, ['chatgpt.com', 'distracting.example'])).toEqual({
      'chatgpt.com': 'reached',
      'distracting.example': 'blocked',
    })

    await applyAndSettle(extension, { paused: false, blockDomains: ['distracting.example'] })
    expect(await sweep(context, probe, ['chatgpt.com', 'distracting.example'])).toEqual({
      'chatgpt.com': 'blocked',
      'distracting.example': 'blocked',
    })
  })
})

test.describe('exceptions', () => {
  test('always-allow an exact domain: it and its subdomains pass, siblings stay blocked', async ({ context, extension, probe }) => {
    await applyAndSettle(extension, { allowDomains: ['chatgpt.com'] })

    expect(await visit(context, probe.url('chatgpt.com'))).toBe('loaded')
    expect(await sweep(context, probe, ['www.chatgpt.com', 'chat.openai.com', 'oaistatic.com', 'claude.ai'])).toEqual({
      'www.chatgpt.com': 'reached',
      'chat.openai.com': 'blocked',
      'oaistatic.com': 'blocked', // ChatGPT's CDN is its own rule: allow it too if ChatGPT should fully work
      'claude.ai': 'blocked',
    })
  })

  test('always-allow a parent domain overrides blocks on its listed subdomains', async ({ context, extension, probe }) => {
    await applyAndSettle(extension, { allowDomains: ['openai.com'] })
    expect(await sweep(context, probe, ['openai.com', 'api.openai.com', 'platform.openai.com', 'chatgpt.com'])).toEqual({
      'openai.com': 'reached',
      'api.openai.com': 'reached',
      'platform.openai.com': 'reached',
      'chatgpt.com': 'blocked',
    })
  })

  test('always-allow a subdomain punches a hole only for that subdomain', async ({ context, extension, probe }) => {
    await applyAndSettle(extension, { allowDomains: ['docs.anthropic.com'] })
    expect(await sweep(context, probe, ['docs.anthropic.com', 'anthropic.com', 'console.anthropic.com'])).toEqual({
      'docs.anthropic.com': 'reached',
      'anthropic.com': 'blocked',
      'console.anthropic.com': 'blocked',
    })
  })

  test('also-block adds a domain and its subdomains in any mode', async ({ context, extension, probe }) => {
    await applyAndSettle(extension, { activePolicyId: 'focus', blockDomains: ['my-ai.example.com'] })
    expect(await sweep(context, probe, ['my-ai.example.com', 'api.my-ai.example.com', 'example.com'])).toEqual({
      'my-ai.example.com': 'blocked',
      'api.my-ai.example.com': 'blocked',
      'example.com': 'reached',
    })
  })

  test('a domain on both lists is allowed (allow wins, matching the dashboard)', async ({ context, extension, probe }) => {
    await applyAndSettle(extension, { allowDomains: ['claude.ai'], blockDomains: ['claude.ai'] })
    expect(await sweep(context, probe, ['claude.ai'])).toEqual({ 'claude.ai': 'reached' })
  })

  test("the extension and the dashboard's explanations never disagree", async ({ context, extension, probe }) => {
    const allow = ['openai.com', 'docs.anthropic.com']
    const block = ['my-ai.example.com']
    await applyAndSettle(extension, { activePolicyId: 'strict-no-ai', allowDomains: allow, blockDomains: block })

    const hosts = [
      'chatgpt.com', 'api.openai.com', 'docs.anthropic.com', 'anthropic.com', 'sub.my-ai.example.com',
      'cursor.com', 'huggingface.co', 'github.com', 'notchatgpt.com', 'gemini.google.com', 'google.com',
    ]
    const results = await sweep(context, probe, hosts)
    const explainDomain = await dashboardExplain()

    for (const host of hosts) {
      const dashboard = explainDomain(host, true, { allow, block }).status
      const dashboardBlocks = dashboard !== 'allowed'
      expect({ host, blocked: results[host] === 'blocked' }).toEqual({ host, blocked: dashboardBlocks })
    }
  })
})

test.describe('popup UI drives enforcement', () => {
  test('mode picker, exceptions and pause all take effect', async ({ context, extension, probe }) => {
    const popup = await context.newPage()
    await popup.goto(`chrome-extension://${extension.id}/popup.html`)

    await popup.getByRole('option', { name: /^Focus/ }).click()
    await expect.poll(async () => (await extension.storage()).activePolicyId).toBe('focus')
    await expect.poll(async () => byId(await extension.dynamicRules())).toEqual(byId(expectedRules({ activePolicyId: 'focus' })))
    expect(await sweep(context, probe, ['cursor.com', 'chatgpt.com'])).toEqual({ 'cursor.com': 'reached', 'chatgpt.com': 'blocked' })

    await popup.getByText('Exceptions').click()
    await popup.locator('#allow-input').fill('https://www.ChatGPT.com/c/123')
    await popup.locator('#allow-form button').click()
    await expect(popup.locator('#allow-list .chip')).toHaveText(['chatgpt.com ×'])
    await expect.poll(async () => (await sweep(context, probe, ['chatgpt.com']))['chatgpt.com']).toBe('reached')

    await popup.locator('#allow-list .chip').click()
    await expect.poll(async () => (await sweep(context, probe, ['chatgpt.com']))['chatgpt.com']).toBe('blocked')

    await popup.locator('#pause').click()
    await expect(popup.locator('#pause')).toHaveText('Resume')
    await expect.poll(async () => (await sweep(context, probe, ['chatgpt.com']))['chatgpt.com']).toBe('reached')
    await popup.locator('#pause').click()
    await expect.poll(async () => (await sweep(context, probe, ['chatgpt.com']))['chatgpt.com']).toBe('blocked')
  })

  test('the popup rejects junk exception input', async ({ context, extension }) => {
    const popup = await context.newPage()
    await popup.goto(`chrome-extension://${extension.id}/popup.html`)
    await popup.getByText('Exceptions').click()
    await popup.locator('#block-input').fill('not a domain!!')
    await popup.locator('#block-form button').click()
    await expect(popup.locator('#block-list .chip')).toHaveCount(0)
    expect((await extension.storage()).blockDomains ?? []).toEqual([])
  })
})
