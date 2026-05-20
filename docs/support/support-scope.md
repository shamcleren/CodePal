# Support Scope

This document defines what CodePal v1 treats as in-scope support for release and issue triage.

## Platform

- macOS only
- current packaged release target: Apple Silicon (`arm64`) builds
- current release artifacts are produced as signed and notarized macOS `.zip` and `.dmg` packages when release signing is configured

Intel macOS builds and non-macOS platforms are not part of the current officially operated release baseline.

## Supported Agent and IDE Paths

These paths are part of the current monitoring and usage baseline:

- Cursor
- Claude Code
- Codex
- CodeBuddy
- GoLand and PyCharm through the shared CodeBuddy JetBrains plugin path

## Support Boundary

CodePal v1 is officially monitoring-first. The supported baseline is:

- session visibility
- activity visibility
- quota and usage visibility where upstream signals exist
- integration diagnostics and repair for supported local config paths
- bounded structured actions already present in the app

The following are outside the current support promise:

- a general-purpose chat console
- freeform outbound CodePal-to-agent text input
- deep IDE navigation guarantees
- perfect cross-surface state consistency across every upstream tool
- unsupported JetBrains IDEs beyond the currently calibrated GoLand and PyCharm path

## Codex-Specific Note

Codex is currently supported for monitoring through session-log visibility. Notify-hook groundwork exists, but Codex is not currently documented as having a completed live approval loop in the public v1 baseline.

## What Makes An Issue In-Scope

Examples of issues that are in-scope:

- a supported integration stops appearing in the session list
- a supported quota/login flow no longer refreshes in CodePal
- settings diagnostics clearly regress
- the packaged app fails to launch or update on the supported macOS release path

Examples that are currently out-of-scope or lower-confidence:

- unsupported platforms
- unsupported IDE variants
- speculative roadmap features not described as shipped behavior
- upstream tools changing undocumented payloads in ways that have not yet been recalibrated

## Reporting Guidance

When reporting a support issue, include:

- the agent or IDE involved
- what you expected
- what actually happened
- whether the issue is stable or intermittent
- copied diagnostics from CodePal settings when available
- screenshots or upstream log excerpts when relevant
