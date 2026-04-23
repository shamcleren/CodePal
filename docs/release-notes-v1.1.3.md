## CodePal v1.1.3

Product direction cut: CodePal is a dashboard, not a middleman. Claude's native approval flow is back in charge — CodePal's blocking `PreToolUse` hook is removed.

### Why

v1.1.2 halved the blocking wait default from 1 hour to 2 minutes, but the underlying behavior still violated the "native flow untouched" design principle: if CodePal wasn't running, crashed, or simply wasn't looked at, Claude Code would sit idle waiting on an approval nobody would ever see. That's not a dashboard — that's a middleman that can stall real work.

### Changed

- **CodePal no longer registers Claude's `PreToolUse` hook.** Allow / deny prompts stay in Claude Code's terminal where they belong. CodePal still observes `SessionStart` / `UserPromptSubmit` / `Notification` / `Stop` / `SessionEnd` for visibility.
- **Existing `PreToolUse` entries in `~/.claude/settings.json` are stripped automatically on next CodePal launch.** If the entry happens to survive (manual edit, sync conflict), the CodePal hook CLI short-circuits to a no-op — it never writes a blocking decision to Claude.
- **README now leads with "Non-Intrusive by Design".** Native flow untouched, visibility-only default, gracefully degradable — documented so the direction is hard to lose.

### Not removed (yet)

- `pendingAction` UI, `blockingHookBridge`, `sendEventLine` handshake, and the `--codepal-hook blocking-hook` CLI path are still in the tree. They remain live for Cursor / Codex / CodeBuddy approval-style events. A follow-up release will audit cross-agent usage and either keep them as an opt-in per-agent gate or delete them.

### Validation

- `npm test` (75 files, 677 tests)
- `npm run lint`
- Manual verification of the upgrade path (v1.1.2 → v1.1.3 stripping existing PreToolUse entries) — pending on the local upgrade.
