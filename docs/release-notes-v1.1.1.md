## CodePal v1.1.1 Candidate

Patch release on top of v1.1.0 that lands the two Tier 1 capabilities previously scoped out as "UI scaffolding only" / "best-effort activation". v1.1.1 closes those gaps via terminal metadata capture at hook time, so send-message and jump land in the correct place rather than opening a new window.

### Added

- **Terminal metadata capture (hook layer)** — agent wrapper scripts now read `$TTY` (via `ps -o tty= -p $PPID`), `$TERM_PROGRAM`, `$ITERM_SESSION_ID`, `$TMUX` / `$TMUX_PANE`, `$GHOSTTY_RESOURCES_DIR`, and sibling env vars before handing off to the hook CLI, and `sendEventLine` stamps the resulting `TerminalContext` onto every outgoing event's `meta.terminal`. `SessionRecord.terminalContext` is merged field-by-field so transient env drops do not clobber the last good snapshot.
- **Send message — capability-gated terminal delivery** — the reply composer now renders only when the session has a concrete delivery channel:
  - `tmux`: `tmux [-S socket] send-keys -t <pane> -l <text>` + `Enter`
  - `Ghostty`: AppleScript activate + `System Events` keystroke + Return (best-effort on frontmost window)
  - Other terminals: the input is hidden entirely rather than rendered in a disabled state.
  - The IPC path (`codepal:send-message`) now routes through the new `TerminalTextSender` and surfaces errors like `no_reply_capability`, `tmux send-keys failed`, `session_not_found` on the existing `codepal:send-message-result` channel.
- **Precise jump — per-terminal dispatch** — `SessionJumpService` now dispatches on populated `jumpTarget` fields before falling back to `open -a`:
  - `tmux`: `tmux [-S socket] switch-client -t <pane>` + `select-window`
  - `iTerm2`: AppleScript walks windows/tabs/sessions and selects by session id
  - `Terminal.app`: AppleScript matches a tab by `tty` and selects it without opening a new window
  - `Ghostty`: best-effort `activate` (no per-tab AppleScript surface available)
  - `open -a` remains the final fallback.
- Claude Code and Codex notification hooks now populate the extended jumpTarget fields (`tty` / `terminalSessionId` / `tmuxPane` / `tmuxSocket`) from env so precise focus is routable end-to-end.

### Changed

- `package.json` now reports `1.1.1`.
- `SessionRecord.hasInputChannel` removed — input gating is now driven by the new shared `canReply(session)` helper (`tmuxPane` present, or `app === "ghostty"` with a known `terminalSessionId`).
- `SessionHistoryTimeline` shows the composer only when `(running | waiting) && canReply(session)` — no disabled residual.
- `SessionMessageInput` props simplified: the parent gates rendering, so the component no longer carries `hasInputChannel` or the "not connected to …" placeholder.

### Removed

- `--codepal-hook keep-alive` subcommand and the `keepAliveHook` module — the previous placeholder inbound channel is superseded by terminal-level delivery. `ipcHub.sendMessageToSession` is preserved on the hub as a future IPC fallback but no longer wired into the UI send path.
- `setInputChannel` on the session store and the `onConnectionRegistered` / `onConnectionLost` wiring in `main.ts`.
- The two keep-alive-coupled e2e specs (`codepal-keepalive.e2e.ts`, `codepal-send-message.e2e.ts`) — they exercised the now-removed channel.
- `sendMessage.placeholder.disconnected` i18n keys (zh-CN + en) — no longer reachable.

### Scope boundaries

- Send-message on **Terminal.app / iTerm2 / Warp / kitty / WezTerm** remains not delivered — those terminals do not expose a reliable text-injection surface. The reply composer is hidden on these, not shown disabled.
- Ghostty delivery is **best-effort**: Ghostty does not expose per-tab AppleScript today, so CodePal activates the app and keystrokes into the frontmost window. First use will prompt for macOS Automation permission.
- Codex and CodeBuddy approval coverage is unchanged from v1.1.0 — still upstream-bounded.
- Manual verification of Claude `allow` end-to-end on the new wrapper + precise jump + per-terminal send is tracked as T1.1 in `docs/superpowers/specs/2026-04-21-open-island-capability-alignment-design.md` and must pass before publish.

### Validation

- `npm test`
- `npm run lint`
- `npm run build`
- `npm run test:e2e`
- `npm run dist:mac`
- T1.1 manual checklist (tmux + Terminal.app + iTerm2 + Ghostty) per the Tier 1 spec

### Release Note

- `package.json` is now `1.1.1`.
- Treat this document as the working v1.1.1 release-note draft while T1.1 manual verification is in progress.
