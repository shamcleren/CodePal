# Privacy and Data Boundaries

CodePal is a local monitoring-first desktop app. It reads local session state, activity, and quota-related signals so you can see multiple agent workflows in one panel.

This document explains what CodePal reads, what it does not read, and what leaves your machine.

## What CodePal Reads

CodePal can read these local sources when the corresponding integration is enabled:

- local session and transcript logs such as `~/.codex/sessions/`, `~/.claude/projects/`, and `~/.codebuddy/projects/`
- local integration config files such as `~/.cursor/hooks.json`, `~/.codebuddy/settings.json`, `~/.codex/config.toml`, and CodePal's own `settings.yaml`
- local cookie-backed login state created inside CodePal's own embedded login windows for supported quota flows
- local usage and quota responses returned by supported providers after you explicitly connect those flows

The monitored session logs may contain prompts, tool calls, file paths, and assistant output. Treat those source files as sensitive local developer data.

## What CodePal Does Not Read By Default

CodePal does not try to:

- index your full filesystem
- read arbitrary browser cookies from your normal browser profile
- send prompts or transcript bodies to a CodePal cloud backend
- upload repository contents for telemetry
- inject freeform messages into upstream agents as part of the current monitoring-first baseline

## Network Access

When you use supported quota or update features, CodePal may contact:

- GitHub Releases for app update metadata and downloads
- Cursor dashboard endpoints after you log in through CodePal's isolated login window
- CodeBuddy quota endpoints after you log in through CodePal's isolated login window

CodePal does not currently include anonymous product telemetry or a remote analytics pipeline of its own.

## Local Storage

CodePal stores local app data under the standard Electron app data directory for `codepal`, including settings, isolated auth session data for supported integrations, updater-related state, and a local SQLite history database when history persistence is enabled.

CodePal's own settings file lives at:

- `~/Library/Application Support/codepal/settings.yaml`

When local history persistence is enabled, CodePal also stores:

- `~/Library/Application Support/codepal/history.sqlite`

That SQLite database contains CodePal-normalized session activity history plus a minimized debug subset of selected event fields. It is not the upstream tools' source of truth, and it remains subject to CodePal's configured retention days and storage cap.

Upstream integration data remains in the upstream tools' own directories. CodePal reads those paths but does not become their source of truth.

## Sensitive Data Notes

- upstream session logs may include sensitive prompts, code snippets, and internal paths
- CodePal's local history database may also contain normalized prompts, assistant replies, tool activity, and file paths copied from those upstream flows within the configured retention window
- quota login state is stored in isolated CodePal-managed browser partitions, not your normal browser profile
- copied diagnostics are designed to summarize state without including cookies or transcript contents, but you should still review anything before sharing it externally

## How To Remove Local CodePal Data

If you want to clear CodePal-managed local state:

1. Quit CodePal.
2. Remove `~/Library/Application Support/codepal/`.
3. Remove or repair upstream hook/config files separately if you no longer want CodePal integrations enabled.

Inside the app, the "Clear persisted history" action only removes CodePal's own SQLite history data. It does not remove the summary sessions currently visible in memory, and it does not delete upstream transcript or session-log files.

Removing the CodePal app data directory does not delete upstream session logs produced by Cursor, Claude Code, Codex, or CodeBuddy.

## Current Limits

This document describes the current v1 monitoring-first product baseline. If CodePal later adds telemetry, cloud sync, or broader outbound control flows, this document should be updated before those changes are treated as release-ready.
