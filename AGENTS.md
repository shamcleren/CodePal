# CodePal Agent Guide

This repository continues to rely on the global superpowers workflow installed on this machine.

## Start Every Session

1. Invoke `superpowers:using-superpowers` before doing other work.
2. Read `README.md`.
3. Read `docs/design-overview.md`.
4. Read `docs/context/current-status.md`.
5. For larger changes, read `docs/README.md` and any additional docs under `docs/context/` before editing code.

## Project Goal

CodePal is a floating monitoring panel for multiple IDEs and AI agents. Phase 1 focuses on unified monitoring, clear status visibility, and approval / structured-choice handling inside the panel.

## Current Phase

- Bootstrap complete
- CodePal desktop app builds and tests successfully
- Cursor / CodeBuddy upstream hook events are wired in
- Pending action loop is implemented inside the app
- External `action_response` write-back is implemented: blocking hooks inject per-event `responseTarget` sockets; main dispatches responses by matching `sessionId` + `actionId` (multiple pending actions per session are supported)

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

- Expand richer activity flow into the UI
- Calibrate real CodeBuddy hook payloads
- Add more adapters after the current protocol is stable
