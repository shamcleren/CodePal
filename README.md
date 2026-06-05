<h1 align="center">
  <img src="docs/assets/icon.png" width="56" alt="CodePal icon" valign="middle" />
  <span valign="middle">CodePal</span>
</h1>

<p align="center"><strong>A local AI coding control tower for heavy agent users — sessions, usage, work review, and diagnostics in one floating macOS panel.</strong></p>

<p align="center">
  <img src="https://img.shields.io/badge/platform-macOS-blue" alt="platform macOS" />
  <img src="https://img.shields.io/github/v/release/shamcleren/CodePal?label=version&color=green" alt="version" />
  <img src="https://img.shields.io/badge/license-MIT-yellow" alt="license MIT" />
  <img src="https://img.shields.io/github/stars/shamcleren/CodePal?style=flat&label=stars" alt="GitHub stars" />
  <br/>
  <a href="https://github.com/shamcleren/CodePal/releases"><strong>Download from Releases</strong></a>
  ·
  <a href="https://shamcleren.github.io/CodePal/"><strong>Product page</strong></a>
  ·
  <a href="./README.zh-CN.md">简体中文</a>
</p>

---

## Why CodePal

Running multiple AI coding agents means your attention is constantly split:

- one session is running in Cursor while another waits in a terminal
- token and cost signals are scattered across model providers and local logs
- finished work is buried inside transcripts instead of becoming a daily review
- integration health is spread across hooks, config files, terminals, and desktop clients

CodePal pulls that into one local panel that stays visible while you work, then turns the observed history into usage analytics and daily operations memory.

## Non-Intrusive by Design

CodePal is a dashboard, not a middleman. The agents you already use stay in charge of approval, execution, and output — CodePal just watches.

- **Native flow untouched.** Approval prompts, tool calls, and decisions still happen inside Claude Code / Cursor / Codex / CodeBuddy. CodePal never blocks, gates, or rewrites them.
- **Visibility-only default.** If CodePal is closed, crashing, or mid-update, your session keeps running exactly as if CodePal weren't installed. Every integration is additive.
- **Gracefully degradable.** All hooks fail open. The worst case is a missed status update in the dashboard — never a stuck agent.

## Preview

![CodePal Dashboard](docs/assets/hero-main.png)

<p align="center">
  <a href="docs/assets/codepal-demo.mp4"><strong>Watch the scripted walkthrough video</strong></a>
  ·
  <a href="docs/index.html"><strong>Open the static product page</strong></a>
</p>

| Usage Analytics | Daily Work Review |
|:---:|:---:|
| ![CodePal Analytics](docs/assets/analytics-overview.png) | ![CodePal Work Review](docs/assets/work-review.png) |

## What You Get

- **Unified session view**: active, waiting, completed, errored, and restored sessions across supported agents in one list.
- **Focused activity timeline**: replies, tool calls, status changes, and low-noise assistant/tool markers without transcript clutter taking over the row.
- **Per-session usage footer**: requests, input, output, cache, context pressure, and estimated cost on expanded sessions.
- **Token usage analytics**: model, agent, project, token-type, cache, cost, and trend views, backed by local history and HTML reports.
- **Daily Work Review**: recent sessions grouped by day and project so finished, running, and waiting work can be reviewed quickly.
- **Work health and Attention signals**: waiting sessions, context pressure, unrecovered failures, and follow-up needs rise to the top.
- **Session history persistence**: normalized activity history stored locally and restored across app restarts.
- **Local Provider Gateway**: connect supported desktop clients to third-party providers while keeping real provider tokens inside CodePal.
- **Capability-gated local operations**: notifications, click-to-navigate, terminal message delivery, integration repair, and local action surfaces stay user-triggered.
- **Bilingual UI**: English and Simplified Chinese, following your system language by default.

## Supported Agents

| Agent | Session | Usage |
|:---|:---:|:---:|
| **Cursor** | ✅ | ✅ |
| **Claude Code** | ✅ | ✅ |
| **Codex** | ✅ | ✅ |
| **CodeBuddy** | ✅ | ✅ |
| **GoLand / PyCharm*** | ✅ | ✅ |

\* GoLand and PyCharm flow through the shared CodeBuddy JetBrains plugin path.

## Privacy Boundary

CodePal is local-first and monitoring-first:

- it reads local agent session/transcript logs only for supported integrations
- it does not upload prompts, transcripts, or repository contents to a CodePal cloud backend
- it does not become an approval interceptor or autonomous scheduler
- outbound actions are bounded, capability-gated, and explicitly user-triggered

See [Privacy and Data Boundaries](docs/support/privacy-and-data.md) for details.

## Install

1. Open [Releases](https://github.com/shamcleren/CodePal/releases).
2. Download the latest `.dmg` or `.zip` for macOS.
3. Move `CodePal.app` into `Applications`.
4. Launch — connected agents are picked up automatically.

Release builds are signed and notarized by Apple. No security prompt on open.

## What's Next

- **Deeper Session Operations**: richer capability manifests, preflighted local action logs, export, resume, and list-level management.
- **Work item and CLI operation flow**: turn observed sessions into actionable handoff, dry-run, execution, and follow-up records.
- **Manual LLM reports when useful**: daily, weekly, and monthly reports from deterministic local facts, with redaction controls before anything leaves the app.
- **Free local control tower first**: make the individual workflow strong enough for daily use before revisiting shared ops visibility, billing, or cloud sync.

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
- [docs/index.html](docs/index.html) — static GitHub Pages product page
- [design/codepal-icon-redesign](design/codepal-icon-redesign) — refreshed app and macOS menu bar icon source artwork
- [promo/remotion-codepal](promo/remotion-codepal) — Remotion source for the short demo video

</details>

## License

MIT
