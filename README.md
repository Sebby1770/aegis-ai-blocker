# Aegis AI Blocker

Aegis AI Blocker is a one-time-purchase blocker prototype for known AI services. It ships as:

- a React/Vite web dashboard
- a SwiftUI iOS app
- generated DNS/blocklist exports
- Supabase schema for lifetime license ownership

Important: no static app can honestly block “all AI” forever. Aegis blocks the curated services in its rule pack and is designed to update that pack as new AI services appear.

![Dashboard concept](design/aegis-dashboard-concept.png)

## Features

- Category toggles for AI Chat, AI Search, AI Coding, Image/Video AI, and AI APIs
- Strict mode for broader hosted-model providers
- Domain tester
- Export formats:
  - AdGuard/uBlock DNS filters
  - hosts file
  - dnsmasq
  - plain domain list
  - Safari content blocker JSON
- iOS SwiftUI app with the same category model and share/copy export flow
- Supabase tables and RLS policies for profiles, devices, rule snapshots, and lifetime licenses

## Web App

```bash
npm install
npm run dev
```

Build and verify:

```bash
npm run verify
```

Generate blocklist artifacts:

```bash
npm run generate:rules
```

Generated files are written to `rules/generated/`.

## iOS App

The iOS project is generated with XcodeGen.

```bash
xcodegen generate --spec ios/project.yml
open ios/AegisAIBlocker.xcodeproj
```

The app builds for iOS Simulator. For true device-wide iOS blocking, a production app needs Apple Network Extension capabilities or a managed DNS provider. Without those entitlements, iOS can still manage and share rule exports.

## Lifetime Purchase Path

The intended paid model is one purchase, lifetime access:

- Web: Stripe Checkout with a lifetime price.
- iOS: StoreKit non-consumable product `ai_blocker_lifetime`.
- Backend: Supabase `lifetime_licenses` table after signed payment verification.

Never let the client create its own license row. Stripe/App Store webhook handlers should verify payment server-side before inserting license state.

## Deployment

The web app includes `vercel.json` and can be deployed as a static Vite project.

```bash
vercel
```

Required production env vars depend on which backend/payment pieces you enable. Start from `.env.example`.

## Repository Layout

```text
src/                  Web app source
src/data/             Shared AI service rule pack
rules/generated/      Generated blocklists
ios/                  SwiftUI iOS project source and XcodeGen spec
supabase/schema.sql   Backend tables and RLS policies
docs/architecture.md  Product architecture notes
design/               Generated visual concept reference
```
