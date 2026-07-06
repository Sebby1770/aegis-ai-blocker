// Popup UI: policy modes, pause, per-domain exceptions, and rule pack status.
// It only reads/writes chrome.storage; the background worker reacts to those
// changes and recompiles the live blocking rules.

import { REMOTE_PACK_URL } from './config.js'
import { fetchValidatedPack, isAcceptableVersion, sanitizePack, toValidDomain } from './pack-validate.js'

const DEFAULT_STATE = {
  activePolicyId: 'strict-no-ai',
  paused: false,
  allowDomains: [],
  blockDomains: [],
  blockedCount: 0,
  packVersion: '',
  packFetchedAt: '',
}

const modesEl = document.getElementById('modes')
const statusEl = document.getElementById('status')
const countEl = document.getElementById('count')
const pauseEl = document.getElementById('pause')
const packEl = document.getElementById('pack')
const refreshEl = document.getElementById('refresh')

async function getActivePack() {
  const { remotePack } = await chrome.storage.local.get({ remotePack: null })
  const validated = remotePack ? sanitizePack(remotePack) : null

  if (validated) {
    return validated
  }

  const response = await fetch(chrome.runtime.getURL('rules/pack.json'))
  return sanitizePack(await response.json())
}

function renderModes(pack, state) {
  modesEl.replaceChildren()

  for (const policy of pack.policies) {
    const selected = !state.paused && policy.id === state.activePolicyId
    const button = document.createElement('button')
    button.type = 'button'
    button.className = `mode ${selected ? 'selected' : ''}`
    button.setAttribute('role', 'option')
    button.setAttribute('aria-selected', String(selected))

    const name = document.createElement('strong')
    name.textContent = policy.name
    const tagline = document.createElement('small')
    tagline.textContent = policy.tagline

    button.append(name, tagline)
    button.addEventListener('click', () => {
      void chrome.storage.local.set({ activePolicyId: policy.id, paused: false })
    })
    modesEl.append(button)
  }
}

function renderChips(listEl, domains, storageKey) {
  listEl.replaceChildren()

  if (domains.length === 0) {
    const empty = document.createElement('span')
    empty.className = 'chips-empty'
    empty.textContent = 'None yet.'
    listEl.append(empty)
    return
  }

  for (const domain of domains) {
    const chip = document.createElement('button')
    chip.type = 'button'
    chip.className = 'chip'
    chip.title = `Remove ${domain}`
    chip.textContent = `${domain} ×`
    chip.addEventListener('click', async () => {
      // Disable on click so a rapid second click can't read this list before
      // the write lands and clobber it (read-modify-write race). The storage
      // change re-renders fresh chips, discarding this disabled one.
      chip.disabled = true
      const stored = await chrome.storage.local.get({ [storageKey]: [] })
      const next = (stored[storageKey] ?? []).filter((entry) => entry !== domain)
      await chrome.storage.local.set({ [storageKey]: next })
    })
    listEl.append(chip)
  }
}

function wireExceptionForm(formId, inputId, storageKey, otherKey) {
  const form = document.getElementById(formId)
  const input = document.getElementById(inputId)

  form.addEventListener('submit', async (event) => {
    event.preventDefault()
    const domain = toValidDomain(input.value)

    if (!domain) {
      input.setCustomValidity('Enter a domain like example.com')
      input.reportValidity()
      return
    }

    input.setCustomValidity('')
    // Disable during the read-modify-write so a second rapid submit can't read
    // stale lists and clobber this write (TOCTOU race). Re-enabled in finally.
    input.disabled = true
    try {
      const stored = await chrome.storage.local.get({ [storageKey]: [], [otherKey]: [] })
      const list = stored[storageKey] ?? []
      // A domain can only live in one list; adding it here removes it from the
      // other, matching the dashboard's allow-wins semantics.
      const other = (stored[otherKey] ?? []).filter((entry) => entry !== domain)

      await chrome.storage.local.set({
        [storageKey]: list.includes(domain) ? list : [...list, domain],
        [otherKey]: other,
      })
      input.value = ''
    } finally {
      input.disabled = false
      input.focus()
    }
  })

  input.addEventListener('input', () => input.setCustomValidity(''))
}

function formatAgo(iso) {
  const then = Date.parse(iso)

  if (!iso || Number.isNaN(then)) {
    return 'bundled'
  }

  const minutes = Math.max(0, Math.round((Date.now() - then) / 60000))

  if (minutes < 60) {
    return `refreshed ${minutes}m ago`
  }

  const hours = Math.round(minutes / 60)
  return hours < 48 ? `refreshed ${hours}h ago` : `refreshed ${Math.round(hours / 24)}d ago`
}

async function render() {
  const [pack, state] = await Promise.all([
    getActivePack(),
    chrome.storage.local.get(DEFAULT_STATE),
  ])

  if (!pack) {
    statusEl.textContent = 'Rule pack unavailable'
    return
  }

  renderModes(pack, state)
  renderChips(document.getElementById('allow-list'), state.allowDomains ?? [], 'allowDomains')
  renderChips(document.getElementById('block-list'), state.blockDomains ?? [], 'blockDomains')

  const paused = Boolean(state.paused)
  pauseEl.textContent = paused ? 'Resume' : 'Pause'
  pauseEl.classList.toggle('is-paused', paused)
  statusEl.textContent = paused ? 'Paused — nothing blocked' : 'Perimeter active'

  const count = Number(state.blockedCount ?? 0)
  countEl.textContent = paused ? 'Enforcement paused' : `${count} domains contained`
  packEl.textContent = `pack ${pack.version} · ${formatAgo(state.packFetchedAt)}`
}

pauseEl.addEventListener('click', async () => {
  const { paused } = await chrome.storage.local.get({ paused: false })
  await chrome.storage.local.set({ paused: !paused })
})

// Manual refresh: fetch + validate here, store the result; the background
// worker reacts to the remotePack change and recompiles rules.
refreshEl.addEventListener('click', async () => {
  refreshEl.disabled = true
  try {
    const pack = await fetchValidatedPack(REMOTE_PACK_URL)

    if (!pack) {
      packEl.textContent = 'refresh failed — kept current pack'
      return
    }

    const { packVersion } = await chrome.storage.local.get({ packVersion: '' })
    if (!isAcceptableVersion(pack.version, packVersion)) {
      packEl.textContent = 'already up to date — kept current pack'
      return
    }

    await chrome.storage.local.set({ remotePack: pack, packFetchedAt: new Date().toISOString() })
  } catch {
    packEl.textContent = 'offline — kept current pack'
  } finally {
    refreshEl.disabled = false
  }
})

wireExceptionForm('allow-form', 'allow-input', 'allowDomains', 'blockDomains')
wireExceptionForm('block-form', 'block-input', 'blockDomains', 'allowDomains')

chrome.storage.onChanged.addListener((_changes, area) => {
  if (area === 'local') {
    void render()
  }
})

void render()
