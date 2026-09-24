#!/bin/bash
# SessionStart hook for Claude Code on the web: install exact locked
# dependencies so `npm run verify` (rules, lint, typecheck, tests, build) works
# as soon as the session starts. Local sessions are left alone.
set -euo pipefail

if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "${CLAUDE_PROJECT_DIR:-$(dirname "$0")/../..}"

# npm ci installs exactly what package-lock.json pins (the same command CI
# runs). --no-audit/--no-fund keep the output quiet; `npm run audit:deps` is
# the explicit audit gate.
npm ci --no-audit --no-fund
