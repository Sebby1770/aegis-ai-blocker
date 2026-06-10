# Security Policy

## Scope

Aegis AI Blocker protects by generating local blocklists. It does not inspect private browsing content, proxy credentials, or upload browsing history.

## Secrets

Do not commit:

- Supabase service role keys
- Stripe secret keys or webhook secrets
- App Store shared secrets
- Vercel tokens

Only publishable Supabase keys belong in client-side builds.

## Reporting Issues

Open a GitHub issue with:

- impacted platform
- affected export format
- exact rule or domain
- expected and actual behavior

## Known Limits

No static blocklist can guarantee complete AI blocking forever. Domains, CDNs, embedded widgets, and first-party AI surfaces change over time.
