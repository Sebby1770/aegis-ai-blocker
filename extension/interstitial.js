// Delay-mode interstitial. declarativeNetRequest redirected a page load for a
// blocked site here, with the original URL in the fragment. After a countdown
// (running only while the tab is visible) the user may continue: the worker
// grants a short pass for this tab — checked against its own clock, not this
// page's — and the page navigates on.

import { safeTarget } from './friction.js'

const headline = document.getElementById('headline')
const lede = document.getElementById('lede')
const secondsEl = document.getElementById('seconds')
const timerEl = secondsEl.parentElement
const note = document.getElementById('note')
const continueButton = document.getElementById('continue')
const backButton = document.getElementById('back')
const errorEl = document.getElementById('error')

// Everything after the first '#' is the intercepted URL (its own fragment
// included).
const raw = location.href.slice(location.href.indexOf('#') + 1)
const target = location.href.includes('#') ? safeTarget(raw) : null

function showError(message) {
  errorEl.textContent = message
  errorEl.hidden = false
}

function goBack() {
  if (history.length > 1) {
    history.back()
    return
  }
  chrome.tabs.getCurrent((tab) => {
    if (tab?.id !== undefined) {
      void chrome.tabs.remove(tab.id)
    }
  })
}

backButton.addEventListener('click', goBack)

function renderHost(host, passMinutes) {
  const strong = document.createElement('strong')
  strong.textContent = host
  lede.replaceChildren(strong, ` is on your delay list. Still want to go? If you continue, it stays open in this tab for ${passMinutes} min.`)
}

function startCountdown(seconds) {
  let remaining = seconds * 1000
  let last = performance.now()

  const tick = () => {
    const now = performance.now()
    if (document.visibilityState === 'visible') {
      remaining -= now - last
    }
    last = now

    const left = Math.max(0, Math.ceil(remaining / 1000))
    secondsEl.textContent = String(left)

    if (remaining <= 0) {
      clearInterval(timer)
      timerEl.classList.add('done')
      secondsEl.textContent = '✓'
      note.textContent = 'Thanks for pausing.'
      continueButton.disabled = false
      continueButton.focus()
    }
  }

  const timer = setInterval(tick, 200)
  tick()
}

continueButton.addEventListener('click', async () => {
  continueButton.disabled = true
  const response = await chrome.runtime.sendMessage({ type: 'aegis:pass' })
  const next = response?.ok ? safeTarget(response.url) : null
  if (next) {
    location.replace(next)
    return
  }
  continueButton.disabled = false
  showError(response?.reason === 'too_early' ? 'Almost — give it another moment.' : 'Could not open the site. Try again.')
})

async function start() {
  // Web-accessible so that link clicks from other sites can land here — which
  // also lets any site frame this page. Never run framed (clickjacking).
  if (window.top !== window) {
    document.body.replaceChildren()
    return
  }

  if (!target) {
    headline.textContent = 'Nothing to open'
    lede.textContent = 'This page only opens links that Aegis paused.'
    secondsEl.textContent = '—'
    return
  }

  const response = await chrome.runtime.sendMessage({ type: 'aegis:interstitial-shown', url: target })

  if (!response?.ok) {
    showError('Could not check this site.')
    return
  }

  // No longer delayed (mode changed or the site was allowed): go straight on.
  if (response.open) {
    location.replace(response.target)
    return
  }

  document.title = `Take a breath · ${response.domain}`
  renderHost(new URL(response.target).hostname, response.passMinutes)
  continueButton.textContent = `Continue to ${response.domain}`
  startCountdown(response.delaySeconds)
}

void start()
