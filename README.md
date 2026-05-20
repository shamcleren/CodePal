<h1 align="center">
  <img src="docs/assets/icon.png" width="56" alt="CodePal icon" valign="middle" />
  <span valign="middle">CodePal</span>
</h1>

<p align="center"><strong>One floating panel for all your AI coding agents — sessions, activity, and usage always in view.</strong></p>

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

Running multiple AI coding agents means your attention is constantly split:

- one session is running in Cursor
- another is waiting for approval in a terminal
- usage data is scattered across different tools
- recent activity is buried inside different tools

CodePal pulls it all into one floating panel that stays visible while you work.

## Non-Intrusive by Design

CodePal is a dashboard, not a middleman. The agents you already use stay in charge of approval, execution, and output — CodePal just watches.

- **Native flow untouched.** Approval prompts, tool calls, and decisions still happen inside Claude Code / Cursor / Codex / CodeBuddy. CodePal never blocks, gates, or rewrites them.
- **Visibility-only default.** If CodePal is closed, crashing, or mid-update, your session keeps running exactly as if CodePal weren't installed. Every integration is additive.
- **Gracefully degradable.** All hooks fail open. The worst case is a missed status update in the dashboard — never a stuck agent.

## Preview

![CodePal Dashboard](docs/assets/hero-main.png)

## What You Get

- **Unified session view**: active, waiting, completed, and errored sessions across all agents in one list
- **Focused activity timeline**: see what each agent is doing — replies, tool calls, and status changes — without the noise
- **Token usage analytics**: per-model token usage, cache hit rates, and estimated costs across all agents, with daily trends and HTML reports
- **Session history persistence**: full activity history stored locally and restored across app restarts
- **One-click integration repair**: fix supported local agent configurations from inside the app
- **Local provider gateway**: connect Claude Desktop and Codex Desktop to third-party models through CodePal while keeping provider tokens out of client configs and preserving existing default models
- **Bilingual UI**: English and Simplified Chinese, following your system language by default

## Supported Agents

| Agent | Session | Usage |
|:---|:---:|:---:|
| **Cursor** | ✅ | ✅ |
| **Claude Code** | ✅ | ✅ |
| **Codex** | ✅ | ✅ |
| **CodeBuddy** | ✅ | ✅ |
| **GoLand / PyCharm*** | ✅ | ✅ |

\* GoLand and PyCharm flow through the shared CodeBuddy JetBrains plugin path.

## Install

1. Open [Releases](https://github.com/shamcleren/CodePal/releases).
2. Download the latest `.dmg` or `.zip` for macOS.
3. Move `CodePal.app` into `Applications`.
4. Launch — connected agents are picked up automatically.

Release builds are signed and notarized by Apple. No security prompt on open.

## What's Next

- **Personal AI work memory**: session reviews, daily digests, and local reports that explain what happened across agents
- **Workflow health**: waiting time, error recovery, quota pressure, context pressure, and observability-confidence signals
- **Sustained value before scale**: prove the individual local-first workflow before adding team sharing, billing, or cloud sync

See [docs/planning/roadmap-next.md](docs/planning/roadmap-next.md) for the full planning direction.

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

**Sessions not showing up**
Make sure the corresponding agent (Cursor / Claude Code / Codex / CodeBuddy) is actually running a session. Use the in-app diagnostics page to verify the integration path is healthy.

## Privacy and Support

- [Privacy and Data Boundaries](docs/support/privacy-and-data.md)
- [Support Scope](docs/support/support-scope.md)
- [Troubleshooting](docs/support/troubleshooting.md)
- [Report an Issue](https://github.com/shamcleren/CodePal/issues/new/choose)

## Development

<details>
<summary>Internal docs</summary>

- [AGENTS.md](AGENTS.md) — agent coding conventions
- [docs/architecture/design-overview.md](docs/architecture/design-overview.md) — architecture overview
- [docs/context/current-status.md](docs/context/current-status.md) — current status
- [docs/README.md](docs/README.md) — doc map
- [design/codepal-icon-redesign](design/codepal-icon-redesign) — refreshed app and macOS menu bar icon source artwork

</details>

## License

MIT
