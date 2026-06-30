# Aegis Enforcer (browser extension)

Where the website *exports* blocklists and the dashboard *builds* them, this
extension **enforces** them — it actually blocks AI services live in your
browser using Chrome's `declarativeNetRequest` engine (the same primitive
uBlock Origin Lite uses).

Pick a value in the popup — Focus, Child-safe, School exam, Strict no-AI — and
the matching AI domains are blocked in real time. Switch modes or hit Pause and
enforcement updates instantly.

## How it works

```
ai-services.json ──(npm run generate:rules)──▶ extension/rules/pack.json
                                                        │
popup.js ──(writes policy/pause to chrome.storage)──────┤
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
- **`background.js`** — the service worker. Reapplies rules on install, startup,
  and any settings change; sets the toolbar badge to the blocked-domain count.
- **`popup.{html,css,js}`** — the mode picker. Only writes to `chrome.storage`;
  the worker reacts.
- **`rules/pack.json`** — generated from the same rule pack as everything else,
  so enforcement can never drift from the dashboard. Never hand-edit it.

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

## Notes for store submission

Toolbar/store icons must be PNG for the Chrome Web Store; add a `128x128` (and
48/16) PNG and an `"icons"` block to `manifest.json` before publishing. The
unpacked extension loads without them.
