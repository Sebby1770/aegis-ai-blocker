import { readFileSync } from 'node:fs'
import path from 'node:path'
import type { BrowserContext, Page } from '@playwright/test'
import { buildDnrRules, resolveBlockedDomains } from '../extension/enforce.js'
import { buildDelayRules, nextScheduleChange } from '../extension/friction.js'
import { sanitizePack } from '../extension/pack-validate.js'
import { EXTENSION_SOURCE, expect, subresource, test, visit, type ExtensionHandle, type Probe } from './fixtures'

// Softer friction in a real browser: delay (interstitial countdown, then a
// tab-scoped pass) and schedule (block only in configured hours). Block mode
// must stay exactly as it was — e2e/extension-blocking.pw.ts covers it and
// runs with friction left at its default.

type Pack = Parameters<typeof resolveBlockedDomains>[0]
const pack = sanitizePack(JSON.parse(readFileSync(path.join(EXTENSION_SOURCE, 'rules/pack.json'), 'utf8'))) as Pack
const BASE = { activePolicyId: 'strict-no-ai', paused: false, allowDomains: [], blockDomains: [] }

function byId<T extends { id: number }>(rules: T[]) {
  return [...rules].sort((a, b) => a.id - b.id)
}

async function settle(extension: ExtensionHandle, state: Record<string, unknown>, expected: unknown[]) {
  await extension.setState({ ...BASE, ...state })
  await expect.poll(async () => byId(await extension.dynamicRules()), { timeout: 10_000 }).toEqual(byId(expected as { id: number }[]))
}

async function neutralPage(context: BrowserContext, probe: Probe) {
  const page = await context.newPage()
  await page.goto(probe.url('neutral.example'), { waitUntil: 'domcontentloaded' })
  return page
}

function interstitialUrl(extension: ExtensionHandle, target: string) {
  return `chrome-extension://${extension.id}/interstitial.html#${target}`
}

async function waitOutAndContinue(page: Page) {
  const button = page.locator('#continue')
  await expect(button).toBeEnabled({ timeout: 15_000 })
  await button.click()
}

test.describe('delay mode (site access granted)', () => {
  // Simulates the user granting the optional <all_urls> permission the popup
  // requests when Delay is chosen.
  test.use({ manifestOverrides: { host_permissions: ['<all_urls>'] } })

  const DELAY = { friction: 'delay', delaySeconds: 3, passMinutes: 10 }

  test('compiles exactly the delay ruleset; block mode stays byte-identical', async ({ extension }) => {
    const resolved = resolveBlockedDomains(pack, BASE)
    await settle(extension, { friction: 'block' }, buildDnrRules(resolved))
    await settle(extension, DELAY, buildDelayRules(resolved, `chrome-extension://${extension.id}`))
    await settle(extension, { friction: 'block' }, buildDnrRules(resolved))
  })

  test('a blocked page load waits on the interstitial, then continues to the exact URL', async ({ context, extension, probe }) => {
    await settle(extension, DELAY, buildDelayRules(resolveBlockedDomains(pack, BASE), `chrome-extension://${extension.id}`))
    const target = probe.url('chatgpt.com', '/c/42?model=x#top')

    const page = await context.newPage()
    await page.goto(target)
    await expect(page).toHaveURL(interstitialUrl(extension, target))
    await expect(page.locator('#lede')).toContainText('chatgpt.com is on your delay list')
    await expect(page.locator('#continue')).toBeDisabled()
    expect(probe.reached('chatgpt.com')).toBe(false)

    await waitOutAndContinue(page)
    await expect(page).toHaveURL(target)
    await expect(page.locator('#host')).toHaveText('chatgpt.com')
    expect(probe.requests).toContainEqual({ host: 'chatgpt.com', path: '/c/42?model=x' })
  })

  test('the pass is scoped to that tab and lets the site load its own assets', async ({ context, extension, probe }) => {
    await settle(extension, DELAY, buildDelayRules(resolveBlockedDomains(pack, BASE), `chrome-extension://${extension.id}`))

    const page = await context.newPage()
    await page.goto(probe.url('chatgpt.com'))
    await waitOutAndContinue(page)
    await expect(page.locator('#host')).toHaveText('chatgpt.com')

    // Inside the passed tab, the site's CDN (its own blocked domain) works.
    expect(await subresource(page, probe.url('oaistatic.com', '/app.js'))).toBe('reached')
    // Navigating within the site keeps working for the length of the pass.
    await page.goto(probe.url('chatgpt.com', '/other'))
    await expect(page.locator('#host')).toHaveText('chatgpt.com')

    // A different tab still gets the pause.
    expect(await visit(context, probe.url('chatgpt.com', '/elsewhere'))).toBe('redirected')

    // Closing the tab ends its pass.
    expect((await extension.sessionRules()).length).toBe(1)
    await page.close()
    await expect.poll(async () => (await extension.sessionRules()).length).toBe(0)
  })

  test('embeds, API calls and link clicks from other sites are still stopped', async ({ context, extension, probe }) => {
    await settle(extension, DELAY, buildDelayRules(resolveBlockedDomains(pack, BASE), `chrome-extension://${extension.id}`))
    const page = await neutralPage(context, probe)

    expect(await subresource(page, probe.url('api.openai.com', '/v1/models'))).toBe('blocked')
    await page.evaluate((src) => {
      const frame = document.createElement('iframe')
      frame.src = src
      document.body.append(frame)
    }, probe.url('claude.ai', '/embed'))
    await page.waitForTimeout(500)
    expect(probe.reached('claude.ai')).toBe(false)

    // A link click is a web-initiated navigation: it must hit the pause too.
    await page.evaluate((href) => {
      const link = document.createElement('a')
      link.href = href
      link.textContent = 'go'
      link.id = 'go'
      document.body.append(link)
    }, probe.url('perplexity.ai', '/search?q=1'))
    await page.locator('#go').click()
    await expect(page).toHaveURL(interstitialUrl(extension, probe.url('perplexity.ai', '/search?q=1')))
    expect(probe.reached('perplexity.ai')).toBe(false)
  })

  test('the worker, not the page, enforces the wait', async ({ context, extension, probe }) => {
    await settle(extension, DELAY, buildDelayRules(resolveBlockedDomains(pack, BASE), `chrome-extension://${extension.id}`))
    const page = await context.newPage()
    await page.goto(probe.url('claude.ai'))
    await expect(page.locator('#lede')).toContainText('claude.ai')

    const early = await page.evaluate(() => chrome.runtime.sendMessage({ type: 'aegis:pass' }))
    expect(early).toEqual({ ok: false, reason: 'too_early' })
    expect(await extension.sessionRules()).toEqual([])
    expect(probe.reached('claude.ai')).toBe(false)
  })

  test('a site that frames the interstitial gets nothing (no clickjacking)', async ({ context, extension, probe }) => {
    await settle(extension, DELAY, buildDelayRules(resolveBlockedDomains(pack, BASE), `chrome-extension://${extension.id}`))
    const page = await neutralPage(context, probe)
    await page.evaluate((src) => {
      const frame = document.createElement('iframe')
      frame.src = src
      frame.id = 'trap'
      document.body.append(frame)
    }, interstitialUrl(extension, probe.url('chatgpt.com')))
    await page.waitForTimeout(4_000) // longer than the delay

    const framed = page.frames().find((frame) => frame.url().includes('interstitial.html'))
    expect(framed).toBeDefined()
    expect(await framed!.locator('#continue').count()).toBe(0)
    const session = await (await extension.worker()).evaluate(() => chrome.storage.session.get(null))
    expect(session.shown ?? {}).toEqual({})
    expect(await extension.sessionRules()).toEqual([])
  })

  test('the interstitial only ever navigates to http(s)', async ({ context, extension }) => {
    const page = await context.newPage()
    await page.goto(interstitialUrl(extension, 'javascript:alert(document.domain)'))
    await expect(page.locator('#headline')).toHaveText('Nothing to open')
    await expect(page.locator('#continue')).toBeDisabled()
  })

  test('allow exceptions skip the pause entirely', async ({ context, extension, probe }) => {
    const state = { ...DELAY, allowDomains: ['chatgpt.com'] }
    await settle(extension, state, buildDelayRules(resolveBlockedDomains(pack, { ...BASE, ...state }), `chrome-extension://${extension.id}`))
    expect(await visit(context, probe.url('chatgpt.com'))).toBe('loaded')
    expect(await visit(context, probe.url('claude.ai'))).toBe('redirected')
  })

  test('switching back to Block revokes passes and blocks outright', async ({ context, extension, probe }) => {
    await settle(extension, DELAY, buildDelayRules(resolveBlockedDomains(pack, BASE), `chrome-extension://${extension.id}`))
    const page = await context.newPage()
    await page.goto(probe.url('chatgpt.com'))
    await waitOutAndContinue(page)
    await expect.poll(async () => (await extension.sessionRules()).length).toBe(1)

    await settle(extension, { friction: 'block' }, buildDnrRules(resolveBlockedDomains(pack, BASE)))
    await expect.poll(async () => (await extension.sessionRules()).length).toBe(0)
    expect(await visit(context, probe.url('chatgpt.com'))).toBe('blocked')
  })

  test('the popup switches to Delay and edits its timings', async ({ context, extension }) => {
    const popup = await context.newPage()
    await popup.goto(`chrome-extension://${extension.id}/popup.html`)

    await popup.getByRole('radio', { name: 'Delay' }).click()
    await expect.poll(async () => (await extension.storage()).friction).toBe('delay')
    await expect(popup.getByRole('radio', { name: 'Delay' })).toHaveAttribute('aria-checked', 'true')

    await popup.locator('#delay-seconds').selectOption('30')
    await popup.locator('#pass-minutes').selectOption('5')
    await expect.poll(async () => {
      const stored = await extension.storage()
      return [stored.delaySeconds, stored.passMinutes]
    }).toEqual([30, 5])
    await expect(popup.locator('#friction-status')).toHaveText(
      'Blocked sites open after a 30s pause, then stay open 5 min in that tab.',
    )
  })
})

test.describe('delay mode without site access', () => {
  test('falls back to blocking outright — never lets the site through', async ({ context, extension, probe }) => {
    await settle(extension, { friction: 'delay', delaySeconds: 3 }, buildDnrRules(resolveBlockedDomains(pack, BASE)))
    await expect.poll(async () => (await extension.storage()).frictionEffective).toBe('block')

    expect(await visit(context, probe.url('chatgpt.com'))).toBe('blocked')
    expect(probe.reached('chatgpt.com')).toBe(false)

    const popup = await context.newPage()
    await popup.goto(`chrome-extension://${extension.id}/popup.html`)
    await expect(popup.locator('#friction-status')).toContainText('blocked outright')
  })
})

test.describe('schedule mode', () => {
  const now = new Date()
  const today = now.getDay()
  const pad = (n: number) => String(n).padStart(2, '0')
  const clock = (date: Date) => `${pad(date.getHours())}:${pad(date.getMinutes())}`

  test('inside the window it blocks with the exact block rules', async ({ context, extension, probe }) => {
    const schedule = { days: [0, 1, 2, 3, 4, 5, 6], start: '00:00', end: '00:00' } // all day, every day
    await settle(extension, { friction: 'schedule', schedule }, buildDnrRules(resolveBlockedDomains(pack, BASE)))
    await expect.poll(async () => (await extension.storage()).scheduleActive).toBe(true)
    expect(await visit(context, probe.url('chatgpt.com'))).toBe('blocked')
  })

  test('outside the window the pack is lifted, custom blocks still apply', async ({ context, extension, probe }) => {
    const schedule = { days: [(today + 3) % 7], start: '09:00', end: '10:00' } // never today
    const state = { friction: 'schedule', schedule, blockDomains: ['distracting.example'] }
    await settle(extension, state, buildDnrRules(resolveBlockedDomains(pack, { ...BASE, ...state, paused: true })))
    await expect.poll(async () => (await extension.storage()).scheduleActive).toBe(false)

    expect(await visit(context, probe.url('chatgpt.com'))).toBe('loaded')
    expect(await visit(context, probe.url('distracting.example'))).toBe('blocked')

    const popup = await context.newPage()
    await popup.goto(`chrome-extension://${extension.id}/popup.html`)
    await expect(popup.locator('#status')).toHaveText('Off-hours — schedule not active')
    await expect(popup.locator('#friction-status')).toContainText('off now until')
  })

  test('an alarm is set for the next boundary', async ({ extension }) => {
    const schedule = { days: [1, 2, 3, 4, 5], start: '09:00', end: '17:00' }
    await extension.setState({ ...BASE, friction: 'schedule', schedule })
    const expected = nextScheduleChange(schedule, new Date())!.getTime() + 500

    await expect
      .poll(async () => (await extension.worker()).evaluate(async () => (await chrome.alarms.get('aegis-schedule'))?.scheduledTime))
      .toBe(expected)
  })

  test('crossing the boundary lifts the block, live', async ({ context, extension, probe }) => {
    test.slow()
    // Avoid starting in the last seconds of a minute.
    if (new Date().getSeconds() > 45) {
      await new Promise((resolve) => setTimeout(resolve, (61 - new Date().getSeconds()) * 1000))
    }
    const start = new Date()
    const end = new Date(start.getTime() + 60_000)
    const schedule = { days: [start.getDay()], start: clock(start), end: clock(end) }
    await settle(extension, { friction: 'schedule', schedule }, buildDnrRules(resolveBlockedDomains(pack, BASE)))
    expect(await visit(context, probe.url('chatgpt.com'))).toBe('blocked')

    // At the next minute the window closes and the alarm recompiles the rules.
    await expect.poll(async () => (await extension.storage()).scheduleActive, { timeout: 90_000, intervals: [2_000] }).toBe(false)
    expect(await visit(context, probe.url('chatgpt.com'))).toBe('loaded')
  })

  test('the popup edits days and hours', async ({ context, extension }) => {
    const popup = await context.newPage()
    await popup.goto(`chrome-extension://${extension.id}/popup.html`)

    await popup.getByRole('radio', { name: 'Schedule' }).click()
    await expect(popup.locator('#schedule-options')).toBeVisible()
    await popup.locator('#schedule-days label', { hasText: 'Sa' }).click()
    await popup.locator('#schedule-start').fill('08:30')
    await popup.locator('#schedule-start').dispatchEvent('change')
    await popup.locator('#schedule-end').fill('15:15')
    await popup.locator('#schedule-end').dispatchEvent('change')

    await expect.poll(async () => (await extension.storage()).schedule).toEqual({
      days: [1, 2, 3, 4, 5, 6],
      start: '08:30',
      end: '15:15',
    })
    await expect(popup.locator('#friction-status')).toContainText('Mon–Sat 08:30–15:15')
  })
})
