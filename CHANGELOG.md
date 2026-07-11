# Changelog

All notable changes to the product and the rule pack.

## 2.3.2 — 2026-07-11

### Added
- **Live backend.** The app now runs against a real production Supabase project
  (`aegis-ai-blocker`, ap-southeast-2): magic-link email sign-in works, all
  schema migrations are applied (profiles, lifetime licenses, payment events,
  devices, rule snapshots, audit logs, durable rate limiting — RLS throughout),
  and the security advisors were reviewed (one `search_path` hardening fix
  applied live and mirrored into `supabase/migrations/`).
- **Full-stack local dev.** A new dev-only Vite plugin
  (`scripts/vite-api-dev.ts`) mounts the Vercel serverless functions from
  `api/` directly on the dev server via the Environment API module runner —
  `npm run dev` now serves the SPA *and* `/api/health`, `/api/entitlement`,
  `/api/create-checkout-session`, `/api/stripe-webhook`, and `/api/export`,
  with env loaded from `.env.local` and hot re-transform when API files
  change. Production builds and deployed functions are untouched
  (`apply: 'serve'`).
- Launch checklist gains a **Local development** section (webhook testing via
  `stripe listen`, test card flow) and tracks Supabase setup progress.

## 2.3.1 — 2026-07-07

### Changed
- **A second, deeper layer of marketing motion** — same rules as 2.3.0 (no new
  dependencies; reduced-motion / touch / fine-pointer gated; no feature change):
  - **3D tilt** — spotlight cards now lean toward the cursor (a subtle ≤2.5°
    perspective tilt) on top of the radial glow, folded into the same single
    delegated pointer listener and reset the instant the pointer leaves.
  - **Magnetic CTA** — the hero "Get lifetime access" button is gently pulled
    toward the cursor and eases back on exit.
  - **Scroll-progress bar** — a thin teal→cyan bar across the top of the
    viewport fills as you scroll (transform-based, so it's cheap).
  - **Ambient section aurora** — the light content sections carry a faint,
    slowly-breathing teal glow so the white space has depth instead of sitting
    flat.

## 2.3.0 — 2026-07-07

### Changed
- **A ReactBits-inspired motion pass across the marketing site — no new
  dependencies.** Every effect is hand-built, GPU-cheap, and gated on
  `prefers-reduced-motion` / touch / IntersectionObserver support so content is
  never hidden behind an animation that can't run, and no existing feature
  changed:
  - **SplitText headlines** — hero and page-hero headings rise in word-by-word
    with a staggered entrance, keeping the teal→cyan gradient on the accent word.
  - **CountUp stats** — the hero and catalog coverage numbers animate up from
    zero the first time they scroll into view.
  - **Spotlight cards** — step, feature, coverage, catalog, pricing, and CTA
    cards now carry a soft radial glow that follows the cursor (one delegated
    listener; disabled on touch).
  - **Scroll reveal** — marketing sections fade and rise as they enter the
    viewport; this also activates the previously-inert `data-reveal` markers.
  - **ShinyText + button sheen** — a light glint travels across the "Every rule,
    in the open" CTA heading, and primary buttons get a subtle sheen sweep on
    hover.
  - A staggered cascade brings the hero eyebrow, copy, actions, mode pills,
    tester, and stats in on load.
- New reusable motion primitives live under `src/components/motion/`
  (`useInView`, `useScrollReveal`, `CountUp`, `SplitText`, `ShinyText`).

## 2.2.0 — 2026-07-06

### Added
- **Self-updating rule pack in the Aegis Enforcer extension.** The service
  worker now refreshes `rules/pack.json` from this repository (GitHub raw,
  `main` branch) on a 6-hour `chrome.alarms` schedule, so newly catalogued AI
  domains start getting blocked without waiting for a store update. Every
  remote — and every stored — pack passes through a new validation gate
  (`extension/pack-validate.js`) before it can touch enforcement: malformed
  entries are dropped, domains are canonicalized (protocol/`www.`/port/path
  stripped, strict hostname grammar), and hard caps bound the ruleset
  (≤20 policies, ≤500 services, ≤50 domains per service, ≤2000 total domains)
  so a corrupted or hostile download can never balloon the rules or crash the
  worker. Anything that fails validation is discarded and the bundled pack
  keeps enforcing; network errors are swallowed the same way. 16 new unit tests
  (`pack-validate.test.ts`) cover canonicalization, garbage rejection, caps
  under an oversized hostile pack, never-throws on adversarial shapes, the
  size-cap streaming reader, the version-downgrade guard, and the end-to-end
  validated fetch — the suite is now 109 tests.
- **Per-domain exceptions in the extension popup.** The same *always allow* /
  *also block* overrides the dashboard has, now editable right where
  enforcement happens. Domains render as removable chips, input is validated
  with the shared `toValidDomain`, allow wins on conflict, and adding a domain
  to one list removes it from the other. Enforcement re-compiles instantly.
- **Pack status + manual refresh in the popup.** A footer readout shows the
  active pack version and freshness ("bundled", "refreshed 2h ago"), plus a ↻
  button to fetch the latest pack on demand — failures keep the current pack
  and say so ("offline — kept current pack").
- **Real extension icons.** `extension/icons/icon-{16,48,128}.png` — the Aegis
  shield on a teal→cyan gradient — generated deterministically by a
  dependency-free PNG encoder (`scripts/generate-extension-icons.mjs`, ~160
  lines: hand-rolled IHDR/IDAT/IEND chunks, CRC32, zlib deflate, supersampled
  SDF drawing). Wired into `manifest.json` (`icons` + `action.default_icon`),
  clearing the last blocker for Chrome Web Store submission.

### Hardened
Following an adversarial review of the self-update path, the remote-pack
pipeline was tightened against a compromised or misbehaving source:
- **Size cap on remote fetches.** Pack downloads are refused if they exceed
  1 MB (the bundled pack is ~15 KB). The body is streamed and abandoned the
  moment the byte count crosses the cap, so a lying `Content-Length` or a
  multi-gigabyte payload can no longer be buffered into the worker's memory.
  Applies to both the 6-hour background refresh and the popup's manual refresh.
- **Downgrade protection.** A fetched pack is stored only when its version is
  newer than (or equal to) the one already in force, so a rolled-back or
  hostile older pack can't quietly shrink your coverage. Versions are compared
  as their date-stamped strings.
- **Fail-safe rule compilation.** `declarativeNetRequest.updateDynamicRules`
  is now wrapped in try/catch; a transient API or limit error is logged and the
  previous rules are left intact instead of the apply failing silently.
- **Race-free popup edits.** Adding an exception or removing a chip disables its
  control until the storage write lands, closing a read-modify-write window
  where two fast clicks could clobber each other's changes.

### Changed
- Extension manifest gains the `alarms` permission (for the refresh schedule)
  and is now versioned in lockstep with the product (2.2.0).

## 2.1.0 — 2026-06-23

### Added
- **Live browser enforcement — the Aegis Enforcer extension (`extension/`).**
  Aegis no longer only *exports* blocklists you import elsewhere; it can now
  *enforce* your policy itself. A Manifest V3 browser extension compiles your
  chosen policy + exceptions into Chrome `declarativeNetRequest` rules and blocks
  AI services live, updating the instant you switch modes or pause. Its rule pack
  (`extension/rules/pack.json`) is generated from the same `ai-services.json` as
  the website and exports, so web, exports, iOS and the extension can never
  drift. The enforcement engine (`extension/enforce.js`) is pure and unit-tested
  (8 tests): strict-no-AI blocks everything, Focus leaves coding tools reachable,
  allow-exceptions override blocks, pause enforces nothing, and the compiled DNR
  rules carry unique ids with allow-over-block priority.

### Changed
- **Redesigned the marketing site around an interactive "containment field"
  hero.** A hand-rolled canvas (no libraries) drifts real AI domains through
  dark space; they are deflected at a glowing boundary ring around your
  headline and flash red as they are blocked — a literal picture of "decide
  where AI is allowed." It reacts to the cursor, pauses when the tab is hidden,
  and renders a single settled frame under `prefers-reduced-motion`. Paired with
  a monospaced instrument-readout eyebrow, a frosted sticky nav, gradient CTAs,
  glassmorphic panels, gradient-accented belief cards, card hover lifts, and a
  dark-gradient CTA band. The canvas is purely decorative and takes no pointer
  events, so content is never hidden or blocked behind it.
- **"Mission control" art direction across the marketing site.** A fixed HUD
  perimeter bezel with corner brackets and a live readout
  (`AEGIS · PERIMETER ACTIVE · N DOMAINS CONTAINED`); a scrolling marquee ticker
  of AI domains being blocked under the hero; an additive reticle cursor that
  locks onto interactive elements (desktop only — the native cursor is never
  hidden); oversized outlined `01 / 02 / 03` editorial numerals; `// label`
  code-comment section eyebrows; an animated teal→cyan gradient headline accent;
  and a faint film-grain overlay. All marketing-only (the dashboard stays clean),
  pointer-events-free, and disabled on touch / `prefers-reduced-motion`.

### Added
- **Domain exceptions.** Override any policy per domain. *Always allow* keeps a
  domain reachable even when its category (or strict mode) would block it — e.g.
  "block all AI except GitHub Copilot for work." *Also block* adds your own
  domains on top of the pack. Allow wins on conflict; both lists persist with
  your other settings and are validated and normalized on the way in.
- Exceptions flow into **every export**: AdGuard (`@@||domain^`), dnsmasq
  (`server=/domain/#`) and Safari (`ignore-previous-rules`) get real allow rules
  that override a broader parent-domain block; hosts and plain lists annotate
  any exception they can't express, rather than dropping it silently.
- The live domain checker now reflects your exceptions — an allowed domain reads
  *Allowed by your exceptions*, a custom-blocked one reads *blocked by a custom
  rule*.
- `toValidDomain` validation so only plausible hostnames enter the exception
  lists; 21 new unit tests covering the engine, exports, checker, and storage.

### Honesty note
- Allow exceptions are exact/parent-domain DNS rules — they're as honest as the
  rest of the pack. Where a format can't express an allow rule (hosts, plain),
  the export says so instead of pretending.

## 2.0.0 — 2026-06-13

Aegis is now a policy engine for intentional digital boundaries, not just a blocker.

### Added
- **Policy modes.** Choose a value — Strict no-AI, Focus, Child-safe, School exam,
  Workplace compliance, Creative tools allowed, Research allowed/chat blocked — and
  Aegis sets the rules. Manual tuning shows as a "Custom" policy. Your choice persists.
- **Explainability.** Every domain check now answers *why*: which service, which
  category, exact vs. parent-domain match, and strict-only status.
- **Trust metadata.** Every service carries a breakage-risk label (low/medium/high),
  a last-verified date, and side-effect notes for domains that overlap non-AI tools.
- **Public Catalog page** (`/catalog`) — searchable, every rule in the open, with
  stewardship stats. The "maintained garden", not a black box.
- **Philosophy page** (`/philosophy`) — the reframe, and an honest line on what is
  enforced today (block) versus the roadmap (warn, delay, schedule, rituals — these
  need an always-on agent).

### Changed
- New claim: "Decide where AI is allowed in your life." Home reframed around values.
- The Protection page leads with policy modes; the rule tester is now an explainer.

### Honesty note
- Warn/Delay/Schedule friction levels and notification-driven rituals are intentionally
  **not** shipped as toggles, because a static blocklist cannot enforce them. They are
  on the roadmap behind the active agent (e.g. the iOS Network Extension).

## 1.4.0 — 2026-06-13

### Changed
- The dashboard is now four focused pages with working sidebar navigation:
  Setup (guided three-step onboarding with inline sign-in), Protection
  (category toggles with expandable service lists and the rule tester),
  Blocklists (export formats with per-format guidance), and Account.
- Each dashboard page fits a single screen; the marketing footer no longer
  renders inside the app.
- Your category, strict mode, and format choices now persist across visits.

### Removed
- The illustrative "example activity" panel — real controls only.

## 1.3.0 — 2026-06-12

### Added
- Support, Changelog, and Security are now pages on the site itself instead of
  GitHub links; the changelog page renders this file directly.
- Wider desktop layout so the site fills modern screens.

## 1.2.0 — 2026-06-12

### Added
- Installable PWA: web app manifest plus an offline service worker, so the
  dashboard installs to a home screen and loads without a connection.
- `GET /api/export` — authenticated, audit-logged rule downloads for licensed
  accounts, built for automation (curl, router cron jobs, Shortcuts).
- The marketing site is now multi-page: a compact home plus dedicated
  /features, /pricing, and /faq pages with per-route titles and descriptions.

### Changed
- Domain matching now uses a suffix trie (O(labels) per lookup instead of a
  linear rule scan), keeping the tester and exports instant at any pack size.

## 1.1.0 — 2026-06-11

### Added
- iOS rule data is now generated from the shared rule pack (`RulePackData.generated.swift`),
  so web and iOS can never drift apart.
- Live domain checker on the landing page — runs entirely in the browser.
- `/.well-known/security.txt` (RFC 9116) and this changelog.

## 1.0.0 — 2026-06-11

### Rule pack 2026.06.11
- Expanded from 45 to 73 services (118 default domains, 126 strict): added DeepSeek, Qwen, Kimi,
  Pi, Manus, Janitor AI, QuillBot, Grammarly (strict), Genspark, Andi, iAsk, Komo, Lovable, Bolt,
  v0, Devin, Tabnine, Augment, Sourcegraph (strict), Sora, Luma, Pika, Kling, Hailuo, HeyGen,
  Black Forest Labs, Krea, Recraft, Civitai, Adobe Firefly, Google Labs, NotebookLM, Azure OpenAI,
  xAI API, Cohere, Groq, Together, Fireworks, Cerebras, OpenRouter, Vertex AI (strict),
  Ollama (strict), LM Studio (strict).

### Added
- Marketing landing page with pricing, FAQ, and live coverage stats.
- Privacy Policy, Terms of Service, and Refund Policy pages.
- Checkout return flow that polls entitlement until the Stripe webhook lands.
- Automatic license revocation on Stripe refunds and disputes.
- Durable cross-instance rate limiting backed by Postgres.
- Server-only audit log of license activations, refunds, and revocations.
- Structured JSON API logging with secret/PII redaction and request IDs.
- `/api/health` liveness endpoint for uptime monitoring.
- Content-Security-Policy and HSTS headers on all responses.
- Vitest test suite (39 tests) and GitHub Actions CI with npm audit and gitleaks.
- Dependabot updates for npm and GitHub Actions.
- SEO metadata, robots.txt, SPA routing, immutable CDN caching for assets.
- Source-available LICENSE.

### Security
- Webhook idempotency hardened against duplicate-delivery races.
- Payment intents recorded on licenses so refunds map without trusting client input.
