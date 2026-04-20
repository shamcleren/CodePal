## CodePal v1.1.0 Candidate

This is the first minor release after the v1.0.x monitoring baseline. It pushes CodePal from pure monitoring into lightweight interaction and proactive awareness, following the four-track plan in `docs/roadmap-next.md`.

### Added

- **macOS notifications and sounds** — native notifications and optional sound cues for high-value session transitions (completed, waiting for decision, error, resumed after long idle), with per-state defaults designed to avoid duplicate-notification storms.
- **Allow / approval expansion** — blocking `allow / deny` approvals now round-trip end-to-end for Cursor and Claude Code:
  - Cursor approval flow continues through the existing PreToolUse hook path.
  - Claude Code `PreToolUse` is now wired through the blocking-hook bridge, and the user's decision is returned via Claude Code's `permissionDecision` protocol (`allow` / `deny`) with a CodePal-authored reason.
  - Integration diagnostics and repair now include `PreToolUse` in the Claude Code required-entry set so missing approval hooks are surfaced as `repair_needed` instead of silently regressing.
  - Codex remains bounded by upstream — its `notify` hook is completion-only, not a real approval surface.
  - CodeBuddy still displays heuristic external-approval notices where possible, because upstream `permission_prompt` payloads do not yet include a structured `pendingAction` or a decision write-back channel.
- **Send message (CodePal → agent)** — structured message delivery from CodePal to a running agent session, scoped to agents that expose a real input channel. The first agent with full support is Claude Code, through a new keep-alive hook subcommand that maintains bidirectional communication with the agent process. Session rows that have an active input channel now expose a `SessionMessageInput` composer with local echo and waiting feedback.
- **Click-to-navigate / IDE jump** — external approval and related session events now carry shared jump-target metadata (agent, app name, workspace path, session id, fallback behavior), so clicking through from an approval surface can activate the originating IDE or terminal window instead of context-switching manually.

### Changed

- `package.json` now reports `1.1.0`.
- Integration diagnostics treat Claude Code as configured only when `SessionStart`, `UserPromptSubmit`, `PreToolUse`, `Notification`, `Stop`, and `SessionEnd` are all pointing at the CodePal hook binary.
- Renderer timeline now integrates `SessionMessageInput` with local echo so user-originated messages appear immediately alongside upstream activity.

### Scope boundaries

- Codex approval integration is **not** shipped in v1.1.0 and is explicitly upstream-bounded. Progress here depends on Codex exposing a real approval / permission hook with stable `sessionId` and decision write-back semantics.
- CodeBuddy approval integration is similarly bounded at the upstream payload layer. CodePal is architecturally ready to route a blocking decision, but no v1.1.0 claim is made that CodeBuddy approvals are enforced end-to-end.
- Freeform `text_input` is still deferred; send-message is limited to structured delivery into an identified running session, not arbitrary prompt injection.

### Validation

- `npm test`
- `npm run lint`
- `npm run build`
- `npm run test:e2e`
- `npm run dist:mac`

### Release Note

- `package.json` is now `1.1.0`.
- Treat this document as the working v1.1.0 release-note draft while final local testing is in progress.
