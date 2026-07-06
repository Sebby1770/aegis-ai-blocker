import { REMOTE_PACK_URL } from './config.js'
import { buildDnrRules, resolveBlockedDomains } from './enforce.js'
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

const REFRESH_ALARM = 'aegis-refresh-pack'
const REFRESH_PERIOD_MINUTES = 6 * 60

const DEFAULT_STATE = {
  activePolicyId: 'strict-no-ai',
  paused: false,
  allowDomains: [],
  blockDomains: [],
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

async function applyPolicy() {
  const [pack, state] = await Promise.all([getActivePack(), getState()])

  if (!pack) {
    return
  }

  const resolved = resolveBlockedDomains(pack, state)
  const rules = buildDnrRules(resolved)

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

  await chrome.storage.local.set({
    blockedCount: resolved.blocked.length,
    packVersion: pack.version,
  })

  const text = state.paused ? 'off' : String(resolved.blocked.length)
  chrome.action.setBadgeText({ text })
  chrome.action.setBadgeBackgroundColor({ color: state.paused ? '#8a8f8d' : '#0d8f83' })
}

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
  }
})

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') {
    return
  }

  // A popup-initiated refresh stores the new pack directly; settings changes
  // come from the popup's mode picker and exception lists.
  const relevant = ['activePolicyId', 'paused', 'allowDomains', 'blockDomains', 'remotePack']
  if (relevant.some((key) => key in changes)) {
    void applyPolicy()
  }
})
