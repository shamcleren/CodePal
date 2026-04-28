#!/usr/bin/env bash
# Release wrapper for macOS builds. Ensures Apple notarization credentials are
# loaded into the environment before invoking electron-builder, so the publish
# step doesn't silently skip notarization (which leaves the dmg un-stapled and
# Gatekeeper-rejected on download).
#
# Sources, in order, until the three required vars are set:
#   1. The current shell environment (already exported by the caller)
#   2. Project-local .release.env (gitignored, optional)
#   3. ~/.zshrc — covers the common case where credentials live there
#
# Required: APPLE_ID, APPLE_APP_SPECIFIC_PASSWORD, APPLE_TEAM_ID
# (or APPLE_KEYCHAIN_PROFILE, or APPLE_API_KEY + APPLE_API_KEY_ID + APPLE_API_ISSUER)
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"

has_credentials() {
  if [[ -n "${APPLE_KEYCHAIN_PROFILE:-}" ]]; then return 0; fi
  if [[ -n "${APPLE_ID:-}" && -n "${APPLE_APP_SPECIFIC_PASSWORD:-}" && -n "${APPLE_TEAM_ID:-}" ]]; then return 0; fi
  if [[ -n "${APPLE_API_KEY:-}" && -n "${APPLE_API_KEY_ID:-}" && -n "${APPLE_API_ISSUER:-}" ]]; then return 0; fi
  return 1
}

if ! has_credentials; then
  if [[ -f "$PROJECT_ROOT/.release.env" ]]; then
    echo "[release:mac] Loading credentials from .release.env"
    set -a
    # shellcheck disable=SC1091
    source "$PROJECT_ROOT/.release.env"
    set +a
  fi
fi

if ! has_credentials && [[ -f "$HOME/.zshrc" ]]; then
  echo "[release:mac] Loading credentials from ~/.zshrc"
  # Extract just the APPLE_* exports so we don't accidentally execute unrelated
  # interactive-shell logic (prompts, sourcing .p10k.zsh, etc).
  while IFS= read -r line; do
    eval "export $line"
  done < <(grep -E '^export (APPLE_ID|APPLE_APP_SPECIFIC_PASSWORD|APPLE_TEAM_ID|APPLE_KEYCHAIN_PROFILE|APPLE_API_KEY|APPLE_API_KEY_ID|APPLE_API_ISSUER)=' "$HOME/.zshrc" | sed -E 's/^export //')
fi

if ! has_credentials; then
  cat >&2 <<'EOF'
[release:mac] Missing Apple notarization credentials.

Set one of the following groups in your shell or in .release.env:
  - APPLE_KEYCHAIN_PROFILE
  - APPLE_ID + APPLE_APP_SPECIFIC_PASSWORD + APPLE_TEAM_ID
  - APPLE_API_KEY + APPLE_API_KEY_ID + APPLE_API_ISSUER

Without them the dmg is signed but not notarized, which Gatekeeper will
treat as "damaged / unidentified developer" on first download.
EOF
  exit 1
fi

if [[ -z "${GH_TOKEN:-}" ]]; then
  GH_TOKEN="$(gh auth token)"
  export GH_TOKEN
fi

cd "$PROJECT_ROOT"
npm run build
exec npx electron-builder --mac zip dmg --publish always
