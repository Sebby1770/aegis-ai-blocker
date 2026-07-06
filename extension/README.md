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
  services, allow-exceptions win); `buildDnrRules` compiles the result into DNR
  rules (block priority 1, allow priority 2). Unit-tested in `enforce.test.ts`.
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

## Install (unpacked, for development)

1. Run `npm run generate:rules` in the repo root to (re)generate `rules/pack.json`.
2. Open `chrome://extensions`, enable **Developer mode**.
3. Click **Load unpacked** and select this `extension/` folder.
4. Pin **Aegis Enforcer** and open the popup to choose a policy.

Works in Chrome, Edge, Brave, and other Chromium browsers. Firefox support needs
the standard `browser_specific_settings` block.

## Defaults & scope

- Default policy on install is **Strict no-AI**, so it protects out of the box.
- It requests `<all_urls>` host access because a blocker must be able to act on
  any site; it inspects nothing — DNR rules are evaluated by the browser itself,
  and the extension never reads page content or sends data anywhere.

## Icons

`icons/icon-{16,48,128}.png` are generated — deterministic, dependency-free —
by `node scripts/generate-extension-icons.mjs` (a minimal hand-rolled PNG
encoder drawing the Aegis shield mark). They're wired into `manifest.json`
(`icons` + `action.default_icon`), which satisfies the Chrome Web Store's PNG
icon requirement. Re-run the script if the mark ever changes; never edit the
PNGs by hand.
