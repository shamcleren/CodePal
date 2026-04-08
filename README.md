<h1 align="center">
  <img src="docs/icon.png" width="56" alt="CodePal icon" valign="middle" />
  <span valign="middle">CodePal</span>
</h1>

<p align="center"><strong>One floating monitoring surface for your AI coding agents.</strong></p>
<p align="center">Keep Cursor, Claude Code, Codex, and CodeBuddy visible in one place instead of hopping between IDEs, terminals, and dashboards.</p>

<p align="center">
  <img src="https://img.shields.io/badge/platform-macOS-blue" alt="platform macOS" />
  <img src="https://img.shields.io/badge/version-1.0.0-green" alt="version 1.0.0" />
  <img src="https://img.shields.io/badge/license-MIT-yellow" alt="license MIT" />
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
| **Codex** | ✅ | ⚠️ |
| **CodeBuddy** | ✅ | ✅ |
| **GoLand / PyCharm** | ✅ | — |

Usage coverage depth still differs by source. See the current scope and release notes for the boundaries that still matter.

## Install

1. Open [Releases](https://github.com/shamcleren/CodePal/releases).
2. Download the latest `.dmg` or `.zip` for macOS.
3. Move `CodePal.app` into `Applications`.
4. Launch the app and allow it in macOS Security settings if prompted.

Current builds still need final macOS signing / notarization before the polished public release flow is complete.

## Best For

- people who run multiple code agents at once
- developers who want one glanceable status panel instead of multiple tool surfaces
- users who care about approval state, recent activity, and quota pressure

## Current Scope

CodePal v1 is intentionally monitoring-first.

It is built for:

- unified monitoring
- session and activity visibility
- quota and usage awareness
- bilingual desktop UI (`system` / `en` / `zh-CN`)
- bounded approval / structured-choice handling already supported by the app

What still remains before the clean 1.0.0 release bar is primarily:

- macOS signing and notarization
- the final release packaging / trust pass on top of the already-green app build

It is still not trying to be:

- a general chat console for talking to every agent
- a full IDE navigation layer
- a deep terminal controller
- a signed / notarized production macOS distribution yet

## What's Next

Near-term priorities are:

- finish signed / notarized macOS distribution
- keep improving usage coverage where current sources are still partial
- continue real-world payload calibration across supported agents
- keep polishing diagnostics, empty states, and degraded-state messaging

See [docs/roadmap-next.md](docs/roadmap-next.md) for the current planning direction.

## Contributors

If you want to work on the project rather than use it:

- read [AGENTS.md](AGENTS.md)
- read [docs/design-overview.md](docs/design-overview.md)
- read [docs/context/current-status.md](docs/context/current-status.md)
- use [docs/README.md](docs/README.md) as the doc map

## License

MIT
