// Popup UI: lets the user pick a policy mode or pause enforcement. It only
// writes to chrome.storage; the background worker reacts and recompiles the
// live blocking rules. The mode list comes from the bundled pack, so it stays
// in lockstep with the website's policy modes.

const DEFAULT_STATE = {
  activePolicyId: 'strict-no-ai',
  paused: false,
  blockedCount: 0,
}

const modesEl = document.getElementById('modes')
const statusEl = document.getElementById('status')
const countEl = document.getElementById('count')
const pauseEl = document.getElementById('pause')

async function loadPack() {
  const response = await fetch(chrome.runtime.getURL('rules/pack.json'))
  return response.json()
}

async function render() {
  const [pack, state] = await Promise.all([
    loadPack(),
    chrome.storage.local.get(DEFAULT_STATE),
  ])

  modesEl.replaceChildren()
  for (const policy of pack.policies) {
    const button = document.createElement('button')
    button.type = 'button'
    button.className = `mode ${!state.paused && policy.id === state.activePolicyId ? 'selected' : ''}`
    button.setAttribute('role', 'option')
    button.setAttribute('aria-selected', String(!state.paused && policy.id === state.activePolicyId))

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

  const paused = Boolean(state.paused)
  pauseEl.textContent = paused ? 'Resume' : 'Pause'
  pauseEl.classList.toggle('is-paused', paused)
  statusEl.textContent = paused ? 'Paused — nothing blocked' : 'Perimeter active'

  const count = Number(state.blockedCount ?? 0)
  countEl.innerHTML = paused
    ? 'Enforcement paused'
    : `<strong>${count}</strong> domains contained`
}

pauseEl.addEventListener('click', async () => {
  const { paused } = await chrome.storage.local.get({ paused: false })
  await chrome.storage.local.set({ paused: !paused })
})

chrome.storage.onChanged.addListener((_changes, area) => {
  if (area === 'local') {
    void render()
  }
})

void render()
