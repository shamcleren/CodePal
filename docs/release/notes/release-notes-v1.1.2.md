## CodePal v1.1.2 Candidate

Bug-fix release on top of v1.1.1 targeting the Claude Code blocking-hook flow. Addresses the "approval card disappears while Claude Code stays stuck" symptom and cleans up noisy hook stderr.

### Fixed

- **Pending action card no longer expires before the hook does.** Previously the UI TTL was derived from `responseTarget.timeoutMs` (the 10-second socket write timeout) instead of the blocking hook's wait budget, so approval cards vanished ~10 s after arrival while the hook happily kept Claude Code blocked for up to an hour. The hook now ships a dedicated `pendingLifetimeMs` alongside the event and `sessionStore` uses that for pending expiry; the socket write timeout is untouched. Default UI TTL bumped from 25 s to 120 s to match the new hook wait default.
- **Stop hook no longer surfaces `ExperimentalWarning: SQLite is an experimental feature` as stderr.** The hook wrapper now runs Electron with `NODE_NO_WARNINGS=1`, which Node silences at warning emit time. Old wrapper commands in `~/.claude/settings.json` / `~/.cursor/hooks.json` are rewritten automatically on next CodePal launch.

### Changed

- **Hook wait default lowered from 1 hour to 2 minutes.** Override with `CODEPAL_HOOK_RESPONSE_WAIT_MS` if you routinely step away. An hour of blocking was "user is never coming back" territory; 2 minutes is the upper bound on real-time decisions and degrades faster to Claude's native approval flow.

### Added

- **`sendEventLine` handshake for half-alive CodePal.** Blocking-hook senders now wait for a newline-terminated `{"ok":true}` ack from the IPC hub before trusting the event was parsed. If the hub accepts the TCP connection but never reads (hung / crashed mid-event), the hook bails out in ~1.5 s instead of holding Claude hostage for the full wait. New env `CODEPAL_HOOK_HANDSHAKE_TIMEOUT_MS` (default 1500 ms). Non-blocking status-change lines stay fire-and-forget — the hub only acks when a `responseTarget` is present.

### Not fixed (intentional)

- `codepal-hook: connect ECONNREFUSED 127.0.0.1:17371` still appears in Claude Code's terminal when CodePal is not running. That's the visibility signal for "CodePal is offline" — silencing it would hide the state from you. Can be revisited if it's more noise than signal.

### Validation

- `npm test` (75 files, 679 tests)
- `npm run lint`
- Manual verification of Claude allow flow on the new TTL + handshake — pending.
