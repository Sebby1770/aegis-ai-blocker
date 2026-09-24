import { REMOTE_PACK_URL } from './config.js'
import { resolveBlockedDomains } from './enforce.js'
import {
  compileRules,
  coveringDomain,
  expiredPasses,
  FRICTION_DEFAULTS,
  INTERSTITIAL_PATH,
  nextScheduleChange,
  passRule,
  safeTarget,
  sanitizeFriction,
  scheduledState,
} from './friction.js'
import { fetchValidatedPack, isAcceptableVersion, sanitizePack } from './pack-validate.js'

// Background service worker: turns the user's chosen policy into live
// declarativeNetRequest rules, and keeps the rule pack fresh.
//
// The pack has two sources, both flowing through the same validator:
//   1. the bundled copy (extension/rules/pack.json, generated from
//      ai-services.json at build time), and
//   2. a self-updated copy fetched from the repo every few hours, so users
//      get new AI domains without reinstalling the extension.
// The remote copy is structure-validated and size-capped by sanitizePack
// before it is ever stored or compiled into rules; anything malformed keeps
// the previous pack in place.
//
// Friction (friction.js) sits on top: block (default), delay (interstitial
// countdown, then a short tab-scoped pass), or schedule (block only in
// configured hours).

const REFRESH_ALARM = 'aegis-refresh-pack'
const REFRESH_PERIOD_MINUTES = 6 * 60
const SCHEDULE_ALARM = 'aegis-schedule'
const SCHEDULE_CHECK_ALARM = 'aegis-schedule-check'
const PASS_ALARM = 'aegis-pass-expiry'
const ALL_SITES = { origins: ['<all_urls>'] }

const DEFAULT_STATE = {
  activePolicyId: 'strict-no-ai',
  paused: false,
  allowDomains: [],
  blockDomains: [],
  ...FRICTION_DEFAULTS,
}

async function loadBundledPack() {
  const response = await fetch(chrome.runtime.getURL('rules/pack.json'))
  return sanitizePack(await response.json())
}

// The active pack: a validated remote copy when present, else the bundled one.
// The stored copy is re-validated on every read so a corrupted storage entry
// can never reach the rule compiler.
async function getActivePack() {
  const { remotePack } = await chrome.storage.local.get({ remotePack: null })
  const validated = remotePack ? sanitizePack(remotePack) : null
  return validated ?? (await loadBundledPack())
}

async function getState() {
  const stored = await chrome.storage.local.get(DEFAULT_STATE)
  return { ...DEFAULT_STATE, ...stored }
}

// Delay mode redirects page loads, and Chrome silently ignores redirect rules
// for sites the extension has no host access to — so delay is only compiled
// once the user has granted the optional <all_urls> permission.
function hasHostAccess() {
  return chrome.permissions.contains(ALL_SITES)
}

function extensionOrigin() {
  return `chrome-extension://${chrome.runtime.id}`
}

// --- rule application ----------------------------------------------------------

// Storage changes can arrive in bursts; applying them concurrently would race
// on rule ids. Serialize every apply behind the previous one.
let applying = Promise.resolve()

function applyPolicy() {
  applying = applying.then(applyPolicyNow, applyPolicyNow)
  return applying
}

async function applyPolicyNow() {
  const [pack, state, hostAccess] = await Promise.all([getActivePack(), getState(), hasHostAccess()])

  if (!pack) {
    return
  }

  const friction = sanitizeFriction(state)
  const now = new Date()
  const effectiveState = scheduledState(state, friction, now)
  const outsideSchedule = effectiveState !== state
  const resolved = resolveBlockedDomains(pack, effectiveState)
  const { rules, effective } = compileRules(resolved, friction, { extensionOrigin: extensionOrigin(), hostAccess })

  // Compiling rules can fail (transient API errors, limit violations). Bail
  // without touching stored state or the badge so a failed apply is visible
  // as a stale count rather than silently leaving stale rules half-updated.
  try {
    const existing = await chrome.declarativeNetRequest.getDynamicRules()
    await chrome.declarativeNetRequest.updateDynamicRules({
      removeRuleIds: existing.map((rule) => rule.id),
      addRules: rules,
    })
  } catch (error) {
    console.error('Aegis: failed to apply blocking rules', error)
    return
  }

  if (effective !== 'delay') {
    await clearPasses()
  }

  const nextChange = await scheduleNextChange(friction, now)

  await chrome.storage.local.set({
    blockedCount: resolved.blocked.length,
    packVersion: pack.version,
    frictionEffective: effective,
    scheduleActive: friction.friction === 'schedule' ? !outsideSchedule : null,
    scheduleNextChangeAt: nextChange ? nextChange.toISOString() : '',
  })

  const off = state.paused || outsideSchedule
  chrome.action.setBadgeText({ text: off ? 'off' : String(resolved.blocked.length) })
  chrome.action.setBadgeBackgroundColor({ color: off ? '#8a8f8d' : effective === 'delay' ? '#b7791f' : '#0d8f83' })
}

// Schedule mode wakes the worker exactly at the next boundary, plus a 5-minute
// reconcile tick that catches sleep/wake and system clock changes.
async function scheduleNextChange(friction, now) {
  if (friction.friction !== 'schedule') {
    await chrome.alarms.clear(SCHEDULE_ALARM)
    await chrome.alarms.clear(SCHEDULE_CHECK_ALARM)
    return null
  }

  const next = nextScheduleChange(friction.schedule, now)
  if (next) {
    await chrome.alarms.create(SCHEDULE_ALARM, { when: next.getTime() + 500 })
  } else {
    await chrome.alarms.clear(SCHEDULE_ALARM)
  }

  if (!(await chrome.alarms.get(SCHEDULE_CHECK_ALARM))) {
    await chrome.alarms.create(SCHEDULE_CHECK_ALARM, { periodInMinutes: 5 })
  }

  return next
}

// --- delay-mode passes -------------------------------------------------------------
// A pass is a session rule (allowAllRequests, one domain, one tab) recorded in
// storage.session so it survives worker restarts and ends with the browser.

async function getSession() {
  return chrome.storage.session.get({ passes: [], shown: {} })
}

async function savePasses(passes) {
  await chrome.storage.session.set({ passes })

  if (passes.length === 0) {
    await chrome.alarms.clear(PASS_ALARM)
    return
  }

  const soonest = Math.min(...passes.map((pass) => pass.expiresAt))
  await chrome.alarms.create(PASS_ALARM, { when: soonest + 500 })
}

async function removePasses(predicate) {
  const { passes } = await getSession()
  const gone = passes.filter(predicate)
  if (gone.length === 0) {
    return
  }

  await chrome.declarativeNetRequest.updateSessionRules({ removeRuleIds: gone.map((pass) => pass.id) })
  await savePasses(passes.filter((pass) => !predicate(pass)))
}

function clearPasses() {
  return removePasses(() => true)
}

async function expirePasses() {
  const { passes } = await getSession()
  const expired = new Set(expiredPasses(passes, Date.now()).map((pass) => pass.id))
  await removePasses((pass) => expired.has(pass.id))
}

async function delayContext() {
  const [pack, state] = await Promise.all([getActivePack(), getState()])
  const friction = sanitizeFriction(state)
  const resolved = pack ? resolveBlockedDomains(pack, scheduledState(state, friction, new Date())) : { blocked: [] }
  return { friction, resolved }
}

// The interstitial announces itself with the URL it intercepted. The worker
// records when that tab started waiting: the pass is granted against this
// timestamp, not against the page's own countdown.
async function handleInterstitialShown(message, tabId) {
  const target = safeTarget(message.url)
  if (!target) {
    return { ok: false, reason: 'invalid_target' }
  }

  const { friction, resolved } = await delayContext()
  const domain = coveringDomain(new URL(target).hostname, resolved.blocked)

  // Mode changed, or the site was allowed since: nothing left to wait for.
  if (friction.friction !== 'delay' || !domain) {
    return { ok: true, open: true, target }
  }

  const { shown } = await getSession()
  shown[tabId] = { target, domain, at: Date.now() }
  await chrome.storage.session.set({ shown })

  return { ok: true, open: false, target, domain, delaySeconds: friction.delaySeconds, passMinutes: friction.passMinutes }
}

async function handlePassRequest(tabId) {
  const { passes, shown } = await getSession()
  const record = shown[tabId]
  if (!record) {
    return { ok: false, reason: 'no_interstitial' }
  }

  const { friction } = await delayContext()
  if (friction.friction !== 'delay') {
    return { ok: true, url: record.target }
  }

  // A small allowance for timer jitter between the page and the worker.
  if (Date.now() - record.at < friction.delaySeconds * 1000 - 250) {
    return { ok: false, reason: 'too_early' }
  }

  const replaced = passes.filter((pass) => pass.tabId === tabId && pass.domain === record.domain)
  const id = Math.max(0, ...passes.map((pass) => pass.id)) + 1

  await chrome.declarativeNetRequest.updateSessionRules({
    removeRuleIds: replaced.map((pass) => pass.id),
    addRules: [passRule(id, record.domain, tabId)],
  })
  await savePasses([
    ...passes.filter((pass) => !replaced.includes(pass)),
    { id, tabId, domain: record.domain, expiresAt: Date.now() + friction.passMinutes * 60_000 },
  ])

  delete shown[tabId]
  await chrome.storage.session.set({ shown })

  return { ok: true, url: record.target }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Only the interstitial as a top-level page may ask for a pass: it is web
  // accessible (so link clicks from other sites can land on it), which also
  // means any site could frame it and try to trick a click.
  const fromInterstitial =
    sender.id === chrome.runtime.id &&
    sender.frameId === 0 &&
    typeof sender.tab?.id === 'number' &&
    typeof sender.url === 'string' &&
    sender.url.startsWith(chrome.runtime.getURL(INTERSTITIAL_PATH))

  if (!fromInterstitial) {
    return false
  }

  const handle =
    message?.type === 'aegis:interstitial-shown'
      ? handleInterstitialShown(message, sender.tab.id)
      : message?.type === 'aegis:pass'
        ? handlePassRequest(sender.tab.id)
        : null

  if (!handle) {
    return false
  }

  handle.then(sendResponse, () => sendResponse({ ok: false, reason: 'error' }))
  return true
})

chrome.tabs.onRemoved.addListener((tabId) => {
  void removePasses((pass) => pass.tabId === tabId)
  void getSession().then(({ shown }) => {
    if (shown[tabId]) {
      delete shown[tabId]
      return chrome.storage.session.set({ shown })
    }
  })
})

chrome.permissions.onAdded.addListener(() => void applyPolicy())
chrome.permissions.onRemoved.addListener(() => void applyPolicy())

// --- rule pack refresh ------------------------------------------------------------

// Fetches the latest pack from the repo. Network errors, oversized bodies, and
// invalid payloads all yield null — the extension simply keeps enforcing its
// current pack. A fetched pack is stored only when it is newer than the one we
// already have, so a compromised source cannot force a coverage-reducing
// downgrade.
async function refreshPack() {
  try {
    const pack = await fetchValidatedPack(REMOTE_PACK_URL)
    if (!pack) {
      return
    }

    const { packVersion } = await chrome.storage.local.get({ packVersion: '' })
    if (!isAcceptableVersion(pack.version, packVersion)) {
      return
    }

    await chrome.storage.local.set({
      remotePack: pack,
      packFetchedAt: new Date().toISOString(),
    })

    if (pack.version !== packVersion) {
      await applyPolicy()
    }
  } catch {
    // Offline or blocked — enforce the pack we already have.
  }
}

function scheduleRefresh() {
  chrome.alarms.create(REFRESH_ALARM, {
    periodInMinutes: REFRESH_PERIOD_MINUTES,
    delayInMinutes: 1,
  })
}

chrome.runtime.onInstalled.addListener(() => {
  scheduleRefresh()
  void applyPolicy()
})

chrome.runtime.onStartup.addListener(() => {
  scheduleRefresh()
  void applyPolicy()
})

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === REFRESH_ALARM) {
    void refreshPack()
  } else if (alarm.name === SCHEDULE_ALARM || alarm.name === SCHEDULE_CHECK_ALARM) {
    void applyPolicy()
  } else if (alarm.name === PASS_ALARM) {
    void expirePasses()
  }
})

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') {
    return
  }

  // A popup-initiated refresh stores the new pack directly; settings changes
  // come from the popup's mode picker, friction controls and exception lists.
  const relevant = [
    'activePolicyId',
    'paused',
    'allowDomains',
    'blockDomains',
    'remotePack',
    'friction',
    'delaySeconds',
    'passMinutes',
    'schedule',
  ]
  if (relevant.some((key) => key in changes)) {
    void applyPolicy()
  }
})
