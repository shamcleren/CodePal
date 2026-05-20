# Troubleshooting

## macOS blocks the app on first launch

Open:

- System Settings
- Privacy & Security

Then allow CodePal manually once and relaunch it.

## Sessions are not showing up

Check these first:

- the upstream tool actually has an active session
- the integration is listed as healthy in CodePal settings
- the expected upstream session log path exists

Current upstream monitoring paths include:

- `~/.codex/sessions/`
- `~/.claude/projects/`
- `~/.codebuddy/projects/`

## Cursor or CodeBuddy quota login looks disconnected

Quota and usage flows use isolated login windows inside CodePal. Even if you are already logged in in your normal browser, you may still need to log in again inside CodePal so the isolated session can be read safely.

If quota refresh still fails:

1. Open CodePal settings.
2. Clear the affected login state.
3. Log in again through the CodePal popup.
4. Copy diagnostics if you need to report the issue.

## Update flow fails

If in-app update download or installation fails:

1. copy diagnostics from CodePal settings
2. fall back to the latest package on GitHub Releases
3. report the issue with the copied diagnostics and your macOS version

## Where to find local diagnostic sources

CodePal currently exposes diagnostics primarily through:

- the in-app diagnostics and support summary
- the local settings file
- upstream session and integration config paths

Important local paths:

- CodePal settings: `~/Library/Application Support/codepal/settings.yaml`
- Codex sessions: `~/.codex/sessions/`
- Claude Code logs: `~/.claude/projects/`
- CodeBuddy logs: `~/.codebuddy/projects/`
- Cursor hooks config: `~/.cursor/hooks.json`
- CodeBuddy hooks config: `~/.codebuddy/settings.json`
- Codex notify config: `~/.codex/config.toml`

CodePal does not currently document a dedicated persistent app log file as part of the public v1 support baseline. For support today, the expected path is to use copied diagnostics plus the relevant upstream local files above.

## What to include in a bug report

- affected agent or IDE
- expected behavior
- actual behavior
- whether it reproduces consistently
- copied diagnostics from CodePal settings
- screenshots or upstream log snippets when useful
