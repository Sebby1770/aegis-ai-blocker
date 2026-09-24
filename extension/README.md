# Aegis Enforcer (browser extension)

Where the website *exports* blocklists and the dashboard *builds* them, this
extension **enforces** them — it actually blocks AI services live in your
browser using Chrome's `declarativeNetRequest` engine (the same primitive
uBlock Origin Lite uses).

Pick a value in the popup — Focus, Child-safe, School exam, Strict no-AI — and
the matching AI domains are blocked in real time. Switch modes or hit Pause and
enforcement updates instantly. Add per-domain exceptions (always allow / also
block) right from the popup, and the rule pack keeps itself current: the worker
refreshes it from this repository every six hours, so new AI domains get blocked
without waiting for an extension update.

## How it works

```
ai-services.json ──(npm run generate:rules)──▶ extension/rules/pack.json (bundled)
                                                        │
GitHub raw (same file, main branch) ──▶ pack-validate.js ┤  ◀── 6-hourly alarm
                                                        ▼
popup.js ──(policy/pause/exceptions via chrome.storage)─┤
                                                        ▼
                          background.js ──▶ enforce.js (pure, tested)
                                                        │
                                       declarativeNetRequest.updateDynamicRules
                                                        ▼
                                           live blocking in the browser
```

- **`enforce.js`** — the pure brain. `resolveBlockedDomains(pack, state)` mirrors
  the website's `resolveRules` (policy → categories, strict mode → strict-only
  services, allow-exceptions win, including over their subdomains);
  `buildDnrRules` compiles the result into DNR rules (block priority 1, allow
  priority 2) that match on `requestDomains`, so the domain, every subdomain, and
  the trailing-dot FQDN form (`chatgpt.com.`) are all covered. A `||domain^`
  URL filter would miss that last form. Unit-tested in `enforce.test.ts`.
- **`pack-validate.js`** — the safety gate for the self-updating pack. Every
  remote (and stored) pack passes through `sanitizePack` before it can touch
  enforcement: malformed entries are dropped, domains are canonicalized with
  `toValidDomain`, and hard caps bound the ruleset (≤20 policies, ≤500 services,
  ≤50 domains per service, ≤2000 total domains) so a compromised or corrupted
  download can never balloon the rules or crash the worker. Remote fetches are
  additionally size-capped (≤1 MB body, streamed and abandoned if exceeded) and
  version-guarded (a fetched pack is only accepted when newer than the current
  one, so a compromised source cannot force a downgrade). Falls back to the
  bundled pack when the remote copy fails validation. Unit-tested in
  `pack-validate.test.ts`.
- **`background.js`** — the service worker. Reapplies rules on install, startup,
  and any settings change; refreshes the remote pack on a 6-hour
  `chrome.alarms` schedule (network errors are swallowed — the current pack
  keeps enforcing); sets the toolbar badge to the blocked-domain count.
- **`popup.{html,css,js}`** — the mode picker, plus per-domain exceptions
  (allow wins over block; adding a domain to one list removes it from the
  other), the pack's version/freshness readout, and a manual refresh button.
  Only writes to `chrome.storage`; the worker reacts.
- **`config.js`** — the remote pack URL (GitHub raw, `main` branch).
- **`rules/pack.json`** — generated from the same rule pack as everything else,
  so enforcement can never drift from the dashboard. Never hand-edit it. It is
  both the bundled fallback and the file the self-update fetches.

## Friction: Block, Delay, Schedule

Below the policy modes, the popup picks how blocking feels. The logic lives in
`friction.js` (pure, unit-tested in `friction.test.ts`):

- **Block** (default): blocked domains never load. Its rules are exactly
  `buildDnrRules()`, unchanged by friction.
- **Delay**: page loads of blocked domains are redirected (one DNR regex rule,
  `\0` substitution) to `interstitial.html` with the original URL in the
  fragment; every other request type stays blocked. After the countdown the
  worker adds a **session** `allowAllRequests` rule for that domain, **in that
  tab only**, for the pass length. The pass ends at expiry (alarm) or when the
  tab closes. The worker checks the elapsed time against its own clock, only
  accepts pass requests from the top-level interstitial, and the page refuses
  to run inside a frame and only navigates to `http(s)` targets.
- **Schedule**: block only inside the configured days/hours (overnight
  windows run into the next morning). Outside the window the pack is lifted
  like Pause; "also block" domains still apply. An alarm fires at the next
  boundary, plus a 5-minute reconcile tick for sleep and clock changes.

**Permissions.** Chrome silently ignores DNR `redirect` rules for sites the
extension has no host access to, so Delay would let everything through without
it. The manifest therefore declares `<all_urls>` only under
`optional_host_permissions` (no install-time warning). The popup requests it
when you choose Delay, and until it is granted the worker compiles plain block
rules. `interstitial.html` is a web-accessible resource so that link clicks from
other sites can land on it; a side effect is that pages can detect the
extension is installed.

## Real-browser tests

`npm run test:e2e` (Playwright, also a CI job) loads this folder unpacked into
Chromium and resolves every hostname to a local HTTPS server. The server's request
log then shows which requests got through, so the tests prove what the extension
actually blocks: every pack domain as a page and as a subresource, subdomains
vs. lookalikes, iframes, every policy compiling to exactly the expected live
rules, mode switching, pause, both exception lists, agreement with the
dashboard's explanations, and the popup UI end to end. See
`e2e/extension-blocking.pw.ts`. `e2e/friction.pw.ts` covers Delay (interstitial,
exact-URL continue, tab-scoped pass, the worker-enforced wait, framing and
`javascript:` attempts, fallback without the permission) and Schedule
(inside/outside the window, the next-boundary alarm, and a live boundary
crossing).

## Install (unpacked, for development)

1. Run `npm run generate:rules` in the repo root to (re)generate `rules/pack.json`.
2. Open `chrome://extensions`, enable **Developer mode**.
3. Click **Load unpacked** and select this `extension/` folder.
4. Pin **Aegis Enforcer** and open the popup to choose a policy.

Works in Chrome, Edge, Brave, and other Chromium browsers. Firefox support needs
the standard `browser_specific_settings` block.

## Defaults & scope

- Default policy on install is **Strict no-AI**, so it protects out of the box.
- By default it has **no host permissions at all**: block/allow
  `declarativeNetRequest` rules are evaluated by the browser itself and need
  none. Only choosing **Delay** asks for optional site access (see above). The
  extension never reads page content and never sends data anywhere.

## Icons

`icons/icon-{16,48,128}.png` are generated — deterministic, dependency-free —
by `node scripts/generate-extension-icons.mjs` (a minimal hand-rolled PNG
encoder drawing the Aegis shield mark). They're wired into `manifest.json`
(`icons` + `action.default_icon`), which satisfies the Chrome Web Store's PNG
icon requirement. Re-run the script if the mark ever changes; never edit the
PNGs by hand.
