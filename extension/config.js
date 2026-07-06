// Shared constants for the background worker and popup.

// Canonical source for self-updating rule packs: the repo itself, over HTTPS.
// Everything fetched from here passes through sanitizePack before use.
export const REMOTE_PACK_URL =
  'https://raw.githubusercontent.com/Sebby1770/aegis-ai-blocker/main/extension/rules/pack.json'
