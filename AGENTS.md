# CodePal Agent Guide

This repository continues to rely on the global superpowers workflow installed on this machine.

## Start Every Session

1. Invoke `superpowers:using-superpowers` before doing other work.
2. Read `README.md`.
3. Read `docs/architecture/design-overview.md`.
4. Read `docs/context/current-status.md`.
5. For larger changes, read `docs/README.md` and any additional docs under `docs/context/` before editing code.

## Project Goal

CodePal is a floating local operations panel for multiple IDEs and AI agents. The shipped V1 baseline is monitoring-first: unified session visibility, activity timelines, usage analytics, local history, integration diagnostics, and bounded structured actions where upstream paths already support them.

## Current Phase

- Bootstrap complete
- CodePal desktop app builds and tests successfully
- v1.1.0 through v1.1.11 are shipped; current shipped baseline is v1.1.11
- Cursor, Claude Code, Codex, CodeBuddy, and GoLand / PyCharm feed the shared monitoring and usage surfaces within the current calibrated scope
- Provider Gateway, Analytics, session history persistence, notifications, click-to-navigate, and capability-gated terminal message delivery are implemented
- CodePal no longer presents Claude PreToolUse as a dashboard approval loop; agent-native approval remains the source of truth

## Commands

Run these from the repository root:

```bash
npm ci
npm run dev
npm test
npm run test:e2e
npm run lint
npm run build
```

## Guardrails

- Keep Phase 1 focused on unified monitoring first.
- Do not add `text_input` unless requirements explicitly move to Phase 2.
- Prefer simple adapters and shared types over one-off renderer-only logic.
- When changing event flow, keep `src/shared/`, `src/main/ingress/`, and `src/main/session/` aligned.
- Do not vendor the superpowers skill library into this repo; keep only project-local guidance here.

## Next Priorities

- Build the next product layer around personal AI work memory: session reviews, daily digests, and local exportable reports
- Add workflow-health signals such as waiting time, error recovery, quota pressure, context pressure, and observability confidence
- Keep team, billing, cloud sync, and broader control loops behind proof of sustained individual value and an updated privacy model
