import { buildDnrRules, resolveBlockedDomains } from './enforce.js'

// Background service worker: turns the user's chosen policy into live
// declarativeNetRequest rules. The rule pack is bundled (generated from the
// same ai-services.json as the website), so enforcement always matches the
// dashboard. Re-applies on install, browser startup, and any settings change.

const DEFAULT_STATE = {
  activePolicyId: 'strict-no-ai',
  paused: false,
  allowDomains: [],
  blockDomains: [],
}

let packPromise = null

function loadPack() {
  if (!packPromise) {
    packPromise = fetch(chrome.runtime.getURL('rules/pack.json')).then((response) => response.json())
  }
  return packPromise
}

async function getState() {
  const stored = await chrome.storage.local.get(DEFAULT_STATE)
  return { ...DEFAULT_STATE, ...stored }
}

async function applyPolicy() {
  const [pack, state] = await Promise.all([loadPack(), getState()])
  const resolved = resolveBlockedDomains(pack, state)
  const rules = buildDnrRules(resolved)

  const existing = await chrome.declarativeNetRequest.getDynamicRules()
  await chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds: existing.map((rule) => rule.id),
    addRules: rules,
  })

  await chrome.storage.local.set({ blockedCount: resolved.blocked.length })

  const text = state.paused ? 'off' : String(resolved.blocked.length)
  chrome.action.setBadgeText({ text })
  chrome.action.setBadgeBackgroundColor({ color: state.paused ? '#8a8f8d' : '#0d8f83' })
}

chrome.runtime.onInstalled.addListener(() => {
  void applyPolicy()
})

chrome.runtime.onStartup.addListener(() => {
  void applyPolicy()
})

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && ('activePolicyId' in changes || 'paused' in changes || 'allowDomains' in changes || 'blockDomains' in changes)) {
    void applyPolicy()
  }
})
