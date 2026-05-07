## CodePal v1.1.5

Two fronts: **terminal channels grew up** — kitty / iTerm2 / WezTerm now have working jump and send-message, on the same pane-id pattern tmux uses — and **dashboard polish** from a v1.1.4 dogfood pass cleaned up tool-call rendering, scroll behavior, and updater double-spawn.

### Added: pane-precise terminal channels for kitty, iTerm2, WezTerm

The pattern from tmux — capture pane id at hook time, carry it through `TerminalContext`, expose it on `SessionJumpTarget`, consume it in both the jump service and the text sender — now applies to three more terminals.

- **WezTerm**: `$WEZTERM_PANE` is captured by the hook wrapper. Jump runs `wezterm cli activate-pane --pane-id <id>` and follows up with osascript activate so WezTerm itself comes to the front. Send-message uses two `wezterm cli send-text` execs (text + carriage return, `--no-paste` so CLI agents don't see it as one bracketed-paste blob).
- **kitty**: `$KITTY_WINDOW_ID` is now populated downstream (the env key was reserved earlier but ignored). Jump runs `kitten @ focus-window --match id:<id>`; send-message splits text and Enter into two `kitten @ send-text` calls. Requires `allow_remote_control yes` in `kitty.conf` — falls through to activate-app cleanly when remote control is off.
- **iTerm2 send-message**: a stable per-session AppleScript channel (`tell session id "X" to write text "..."`), reusing the session id we already capture for the jump side. Cleaner than the Ghostty `keystroke`-against-frontmost-window fallback.
- **canReply now returns true for any of {tmux, wezterm, kitty, iTerm2, ghostty}** — no agent-specific code needed. Codex / Claude / CodeBuddy / Qoder / Qwen / Factory all benefit by sharing the terminal channel.
- **Sender precedence**: tmux > wezterm > kitty > iTerm2 > ghostty. tmux can run inside any of the others, and the tmux pane id is the most specific anchor when multiple are present.

### Fixed: updater double-spawn flicker

When the auto-updater's `quitAndInstall` fired (or the user double-clicked the dock icon during an upgrade), Electron let a second main process boot all the way through `app.whenReady → wireIpcHub` before noticing the IPC port was already bound. Users saw a brief "已有 CodePal 在运行" dialog, a phantom dock icon, and an extra GUI flash. Now CodePal takes the single-instance lock at the top of app startup (after the hook-CLI short-circuit, so wrapper subprocesses still pass through) — second instance quits silently, first instance focuses its existing window.

### Fixed: dashboard polish from v1.1.4 dogfood

- **Tool-call JSON no longer leaks into session titles.** When Claude's `tool_result` content was an array containing an `image` block (e.g. screenshot output), CodePal stringified the whole thing and that JSON ended up as the session title and summary. Now the normalizer extracts text segments, rewrites image blocks as `[image]`, and drops the rest.
- **Friendlier tool-use titles.** Bare `Bash` / `Read` / `Edit` / `WebFetch` are now rendered as `Bash: <cmd>` / `Read: <basename>` / `WebFetch: <url>` (truncated to 80 chars). Falls back to the bare tool name when the input shape isn't recognised.
- **Settings drawer scroll fixed.** `.app-settings-drawer__content` was missing `flex: 1`, so the inner section's `overflow-y: auto` never engaged — the CodeBuddy 内网版 login controls were unreachable on smaller windows. Now flexes correctly.
- **Activity stream height lifted** from `min(52vh, 420px)` to `min(72vh, 640px)`. Long assistant outputs no longer scroll inside a tiny box.
- **`session-row__history-peek` "loading more" badge** moved from `aria-hidden="true"` to `role="status"` — the screen-reader copy was completely silent before.

### Fixed: notarization wrapper + ticket stapling

- `release:mac` now sources `.release.env` and `~/.zshrc` to make sure `APPLE_ID` / `APPLE_APP_SPECIFIC_PASSWORD` / `APPLE_TEAM_ID` are present in electron-builder's environment. Earlier the npm script ran in a non-zsh shell and credentials silently dropped, leaving the dmg un-stapled and Gatekeeper-rejected.
- After-all-artifact step now runs `xcrun stapler staple` on both the `.app` and the `.dmg`.

### CI / E2E hygiene

Five Electron E2E tests were failing on CI; the green test count was a coincidence of test ordering on a fresh runner. All five are now stable, and the suite as a whole runs in ~30s locally and ~2m on CI (was ~3.5m + 5 failures). See PR #6 for the full diagnosis. Highlights:

- `sendStatusChange` test helper no longer spawns a full Electron child for every event — it does the same TCP write inline. Cuts the action-response suite from minutes to seconds.
- `launchCodePal` now defaults to an isolated temp HOME so an accumulated multi-tens-of-MB local `history.sqlite` can't push renderer bootstrap past the heading-visible timeout.
- Two PreToolUse e2e tests still asserted the pre-v1.1.3 blocking-PreToolUse contract; rewritten to lock the v1.1.3 native-flow contract.
- Pending-lifecycle expiry test now correctly drives the sweep via `pendingLifetimeMs` instead of mistakenly relying on the action-response transport timeout.

### Validation

- `npm test` (75 files, 700 tests)
- `npm run lint`
- `npm run test:e2e` (15 tests, ~30s local / ~2m CI)
- `npm run dist:mac` with notarization → stapled `.dmg` + `.zip` + blockmaps + `latest-mac.yml`
