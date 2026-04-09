<h1 align="center">
  <img src="docs/icon.png" width="56" alt="CodePal icon" valign="middle" />
  <span valign="middle">CodePal</span>
</h1>

<p align="center"><strong>Monitor all your AI coding agents in one floating panel — sessions, quotas, activity.</strong></p>

<p align="center">
  <img src="https://img.shields.io/badge/platform-macOS-blue" alt="platform macOS" />
  <img src="https://img.shields.io/github/v/release/shamcleren/CodePal?label=version&color=green" alt="version" />
  <img src="https://img.shields.io/badge/license-MIT-yellow" alt="license MIT" />
  <img src="https://img.shields.io/github/stars/shamcleren/CodePal?style=flat&label=stars" alt="GitHub stars" />
  <br/>
  <a href="https://github.com/shamcleren/CodePal/releases"><strong>Download from Releases</strong></a>
  ·
  <a href="./README.zh-CN.md">简体中文</a>
</p>

---

## Why CodePal

AI coding work gets fragmented fast:

- one session is running in Cursor
- another is waiting for approval in a terminal
- quota lives in a browser tab
- recent activity is buried inside different tools

CodePal turns that into one compact desktop panel.

## Preview

![CodePal Dashboard](docs/hero-main.png)

## What You Get

- **Unified session view**: active, waiting, completed, and errored sessions in one list
- **Readable activity flow**: assistant, tool, and system activity without the worst noise
- **Quota and usage awareness**: keep token and rate-limit signals visible while you work
- **Low-friction setup**: repair supported local integrations from inside the app
- **Bilingual UI**: English and Simplified Chinese, with system-language follow mode

## Supported Agents

| Agent | Session | Usage |
|:---|:---:|:---:|
| **Cursor** | ✅ | ✅ |
| **Claude Code** | ✅ | ✅ |
| **Codex** | ✅ | ✅ |
| **CodeBuddy** | ✅ | ✅ |
| **GoLand / PyCharm*** | ✅ | ✅ |

\* GoLand and PyCharm currently flow through the shared CodeBuddy JetBrains plugin path, including usage visibility.

Coverage still differs in how upstream signals are sourced, but the session / usage baseline above is currently supported across these paths.

## Install

1. Open [Releases](https://github.com/shamcleren/CodePal/releases).
2. Download the latest `.dmg` or `.zip` for macOS.
3. Move `CodePal.app` into `Applications`.
4. Launch the app and allow it in macOS Security settings if prompted.

Release builds use `electron-builder`'s native notarization flow and finish with automatic DMG `staple + validate` plus app-level `codesign` / `spctl` checks.

## Best For

- developers juggling multiple AI coding agents who want one glanceable status panel
- anyone who cares about recent activity, quota pressure, and session state across tools

## Current Scope

CodePal v1 is intentionally **monitoring-first**: unified session / activity / quota visibility with a bilingual desktop UI (`system` / `en` / `zh-CN`) and bounded approval handling.

It is not trying to be a general chat console, a full IDE navigation layer, or a deep terminal controller.

## What's Next

- Improve usage / quota coverage where upstream sources are still partial
- Expand real-world payload calibration across supported agents
- Polish diagnostics, empty states, and degraded-state messaging

See [docs/roadmap-next.md](docs/roadmap-next.md) for the full planning direction.

## Quick Start (Development)

```bash
git clone https://github.com/shamcleren/CodePal.git
cd CodePal
npm install
npm run dev        # launch in dev mode
npm run test       # run unit tests
npm run dist:mac   # build .dmg / .zip (requires Apple signing credentials)
```

To produce a signed and notarized build, set `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, and `APPLE_TEAM_ID` before running `dist:mac`.

## Troubleshooting

**macOS blocks the app on first launch**
Open **System Settings → Privacy & Security**, scroll to the bottom, and click **Open Anyway** next to the CodePal warning.

**Sessions not showing up**
Make sure the corresponding agent (Cursor / Claude Code / Codex / CodeBuddy) is actually running a session. Use the in-app diagnostics page to verify the integration path is healthy.

## Privacy And Support

- [Privacy and Data Boundaries](docs/privacy-and-data.md)
- [Support Scope](docs/support-scope.md)
- [Troubleshooting](docs/troubleshooting.md)
- [Report an Issue](https://github.com/shamcleren/CodePal/issues/new/choose)

## Contributors

<details>
<summary>Project docs for contributors</summary>

- [AGENTS.md](AGENTS.md) — agent coding conventions
- [docs/design-overview.md](docs/design-overview.md) — architecture overview
- [docs/context/current-status.md](docs/context/current-status.md) — current status
- [docs/README.md](docs/README.md) — doc map

</details>

## License

MIT
