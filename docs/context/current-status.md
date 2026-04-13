# Current Status

## Repository State

- Repository: `shamcleren/CodePal`
- Local path: `/Users/renjinming/code/my_porjects/shamcleren/CodePal`
- Stack: CodePal desktop shell + React + TypeScript + electron-vite + Vitest + Tailwind CSS
- Bootstrap status: complete
- Minimum acceptance baseline last refreshed on 2026-04-13:
  - `npm test`
  - `npm run lint`
  - `npm run build`
- Extended validation last fully refreshed on 2026-04-13:
  - `npm run test:e2e`
  - `npm run dist:mac`
- Focused post-release validation on 2026-04-13 also covered the expanded-session scroll regression:
  - `npx playwright test -c playwright.e2e.config.ts tests/e2e/codepal-session-expand-scroll.e2e.ts`
  - `npx playwright test -c playwright.e2e.config.ts tests/e2e/codepal-history-pagination.e2e.ts`
- Repository now also includes a minimal GitHub Actions CI workflow for `lint + test + build`
- Repository now also includes a separate macOS GitHub Actions workflow for Electron E2E runs on `main` and manual dispatch
- Release workflow validates macOS updater assets, including `latest-mac.yml`, dmg / zip artifacts, and blockmap files
- v1.0.3 release work is complete; release-facing docs should now treat v1.0.3 as the current shipped baseline rather than pending work

## What Already Exists

### App Shell

- CodePal desktop main process, preload bridge, tray, and floating window shell
- Renderer monitoring panel with status bar, session rows, recent-activity hover details, a conditional update status button, and a full settings drawer for integrations, display, usage, maintenance, and support
- Shared session and payload types in `src/shared/`

### Monitoring Flow

- 接入源 -> 主进程 -> ingress -> session store -> renderer
- 默认使用本机端口接收事件
- 也支持通过本机 socket 路径接收事件

### Current Phase Focus

- Phase 1 product validation is now explicitly dashboard-first
- Main UI prioritizes session/activity/usage visibility, not control-loop visibility
- Existing pending-action/control code remains in-repo, but is no longer the primary user-facing path
- Cursor remains available in-repo and continues to calibrate usage plus dashboard connection flow
- GoLand and PyCharm now feed the shared monitoring/dashboard path through the shared CodeBuddy JetBrains plugin watcher/framework, including usage visibility; other JetBrains IDEs may reuse the same framework later, but they are outside the current V1 calibrated / accepted scope

### Current Adapters

- Codex session-log adapter now reads `~/.codex/sessions/**/*.jsonl` and maps recent active session files into the shared session model
- Cursor normalizer plus executable hook bridge remain in-repo for ongoing calibration
- CodeBuddy now has both hook normalization and local transcript watching under `~/.codebuddy/projects/**/*.jsonl`, so assistant replies and tool activity can enter the shared dashboard timeline; state payloads may identify sessions with `session_id` / `sessionId` or `conversation_id` / `conversationId`
- GoLand and PyCharm integrate through the shared CodeBuddy JetBrains plugin watcher/framework rather than separate adapters, and they now participate in the same usage-visible baseline; other JetBrains IDEs may reuse the same framework, but they are not part of the current V1 calibrated / accepted scope
- Cursor and Codex activity flow now normalize into shared `ActivityItem[]` session activity records before render
- Claude Code now also feeds the shared monitoring model by reading `~/.claude/projects/**/*.jsonl`, including user/assistant/tool activity plus first-pass token usage
- CodeBuddy transcript watching now also feeds the shared monitoring model by reading `~/.codebuddy/projects/**/*.jsonl`, including user / assistant / tool activity for the first confirmed transcript shape
- CodeBuddy CN app `ui_messages.json` watching also suppresses JSON-only follow-up completion payloads while preserving real follow-up questions and `conversationId` metadata
- Cursor and Codex now both have shared fixture-backed calibration baselines under `tests/fixtures/cursor/` and `tests/fixtures/codex/`, and those samples are exercised through adapter plus ingress / watcher tests
- Timeline and row presentation are now aligned to a dashboard-first baseline:
  - unified message / tool / sideband visual hierarchy
  - lower-noise suppression for duplicate or low-information rows
  - correlated Codex tool-call / tool-result recovery where upstream metadata allows it
  - stronger `running` / `waiting` row distinction plus lightweight running motion
  - flat session ordering by `lastUserMessageAt`, then `updatedAt`
- In-memory session history still uses dashboard-oriented retention windows instead of accumulating forever:
  - `running` / `waiting`: retained
  - `completed` / `idle` / `offline`: 24 hours
  - `error`: 48 hours
- Full normalized session history is now also persisted locally in `~/Library/Application Support/codepal/history.sqlite`:
  - default retention: 2 days
  - default storage cap: 100 MB
  - full history is read on demand in the existing expanded session details view
  - clearing persisted history only removes CodePal-managed SQLite history, not upstream logs
- Expanded session rows now keep the outer session list pinned to the expanded row bottom while the details panel grows, so opening a lower row does not leave the newest details below the visible viewport

### Integration Settings

- Main process diagnostics now expose the current CodePal listener endpoint, executable entrypoint, and per-agent integration health (`active` / `legacy_path` / `repair_needed` / `not_configured`)
- UI can write or repair user-level hook config for:
  - `Codex` via `~/.codex/config.toml` `notify = [...]` (live hook entry groundwork; session-log monitoring remains in place)
  - `Cursor` via `~/.cursor/hooks.json`
  - `CodeBuddy` via `~/.codebuddy/settings.json`
- Writes are idempotent and create a backup before overwriting an existing file
- Invalid or incompatible existing config structures are reported back to the UI instead of being force-overwritten
- Main process now also carries a dedicated usage aggregation path separate from session timeline state
- Renderer top bar now uses a compact quota-first usage strip
- Usage strip now supports `compact` / `detailed` density, with reset times either shown inline or exposed by hover title
- Claude Code usage / quota visibility is implemented through two sources:
  - transcript/session-log token usage from `~/.claude/projects/**/*.jsonl`
  - statusLine-derived `rate_limits` snapshots, retained as last-known local quota data when Claude CLI provides them
- CodeBuddy usage now has its own网页登录 + cookie-backed sync path for `CodeBuddy Code(app)` monthly quota, separate from the internal aggregate quota page
- Settings layout is now grouped into:
  - `接入与诊断`
  - `面板显示`
  - `用量与登录`
  - `维护与历史`
  - `支持与诊断`
- Settings navigation now favors short labels and section summaries instead of long repeated explanations
- Main panel now exposes actionable update states through a conditional update button; idle / up-to-date states do not permanently occupy header space
- The Maintenance update panel remains the detailed update control surface

### Release Build

- A macOS release build can be produced via `npm run dist:mac`
- Release artifacts include dmg, zip, blockmap files, and `latest-mac.yml`
- Signed / notarized distribution is the expected public release path when Apple credentials are configured
- v1.0.3 release assets are treated as shipped; future release work should preserve updater metadata and signing / notarization verification rather than re-describing v1.0.3 as pending
- Current local unit / lint / build / E2E verification is green on 2026-04-13

### Pending Action Loop

- `approval`
- `single_choice`
- `multi_choice`

`approval` actions still round-trip through the hook path with explicit `allow / deny` semantics. They are no longer treated as generic option payloads internally, while `single_choice` and `multi_choice` continue to use option-value responses.

End-to-end path for tool hooks:

`renderer -> preload -> main -> action_response line` → connect to the `responseTarget.socketPath` stored on that pending action (or env fallback socket when no target is set).

Same `sessionId` may have multiple pending actions at once; each keeps its own optional `responseTarget`, so concurrent blocking hooks receive only their matching `actionId` line.

**Pending lifecycle cleanup (Phase 1, bounded):**

- Duplicate `action_response` payloads for the same `actionId` are rejected after the first successful handling (first-win).
- CodePal removes pending cards when an explicit per-action close signal arrives from the upstream flow.
- When no close signal arrives, pending cards can expire out of the actionable UI after a timeout.
- This is intentional **bounded stale-pending cleanup** for the panel; it is **not** a guarantee of perfect cross-surface consistency with every IDE or hook process.

## Confirmed Product Decisions

- Phase 1 is about unified monitoring first
- Header should only keep high-frequency, actionable information
- Default panel should feel like a usable dashboard, not a control console
- Hover should reveal more context without forcing deep navigation
- Tool identity should use logo-like markers or letter badges
- `text_input` belongs to Phase 2, not Phase 1
- “Do everything in the current window” is not a Phase 1 hard promise

## Important Files

- `README.md`: current repo-level overview and commands
- `AGENTS.md`: session startup expectations and guardrails
- `src/main/`: CodePal desktop main process, ingress, IPC Hub, session store
- `src/renderer/`: monitoring UI
- `src/adapters/`: external event normalization
- `src/shared/`: shared session and response payload types
- `src/main/hook/`: executable hook entry and bridge modules

## Validation Commands

Minimum acceptance validation for the current handoff:

```bash
npm test
npm run lint
npm run build
```

Extended validation commands:

```bash
npm run test:e2e
npm run dist:mac
```

## Known Gaps

- Codex integration currently focuses on session/activity visibility; structured pending-action write-back is not part of the current primary UX
- Cursor full hook-event calibration is still being expanded beyond the current normalized subset; unknown payloads should continue to be pushed down into adapter/normalizer work instead of renderer-side guessing
- GoLand and PyCharm should stay on the shared CodeBuddy JetBrains plugin watcher/framework path; other JetBrains IDEs may reuse the same framework, but they are not part of the current V1 calibrated / accepted scope
- Claude Code has visible token usage plus statusLine-derived quota snapshots when upstream `rate_limits` are present; the remaining gap is the lack of a separate provider-authoritative live quota/reset source
- CodeBuddy still needs broader real-payload and transcript-shape calibration beyond the current normalized subset, and the separate internal aggregate quota source is still being polished in-product
- CodePal-owned app, docs, packaged macOS, and tray icon assets now use the refreshed centered monitoring-panel mark; third-party agent icon normalization remains future polish
- CodePal -> codeagent message sending is still missing; current product is intentionally stronger on monitoring than on active conversation control
- GitHub Project creation is blocked until `gh auth refresh -s project,read:project` is completed

## Delivery Baseline

### Stable Now

- CodePal Phase 1 is a unified monitoring panel first, not a full multi-agent control console
- Main app shell, tray, floating panel, separate settings window, and local packaging flow are already usable
- Shared session model plus `ActivityItem[]` timeline model are already the renderer-facing baseline
- Cursor and Codex both feed the shared monitoring surface; Cursor does so through hook ingress, Codex currently does so through session-log watching
- GoLand and PyCharm session presence and usage visibility now also feed the shared monitoring surface through the shared CodeBuddy JetBrains plugin watcher/framework
- Supported in-app structured actions remain in the codebase, but are no longer the primary UI path:
  - `approval`
  - `single_choice`
  - `multi_choice`
- Integration diagnostics and repair flow are already in place for Cursor and CodeBuddy user-level hook config
- Cursor dashboard login and spend sync are already in place, including session-expired handling
- Claude Code token usage and statusLine `rate_limits` snapshots are already visible in the shared usage surface when available
- CodeBuddy IDE/app monthly quota login and sync are now also in place through the settings panel, including session-expired handling
- Header usage display, update status visibility, usage density switching, compact settings navigation, and settings regrouping are already in place
- Session ordering and expiration now follow dashboard-oriented defaults
- Persisted session history is now available across app restarts, while the main list remains summary-first
- Expanded session details preserve bottom visibility for lower rows while keeping the internal history timeline scroll behavior intact

### Explicitly Deferred

- ACP / `acpx` common capability extraction
- freeform `text_input`
- a general CodePal -> codeagent free-text message channel
- deep IDE / terminal pane navigation promises
- moving control-loop UX back onto the main dashboard path

### Deferred But Planned

These items are not part of the current accepted V1 baseline, but they still belong to the broader product direction:

- outbound `send message` / CodePal -> agent message delivery when session ownership and delivery semantics are stable enough
- ACP / `acpx` style common capability extraction once the current per-agent monitoring and action model is mature enough to justify it
- richer observability coverage beyond the current session/activity/usage baseline, including source health, ingestion reliability, and stronger debugging signals for adapter behavior
- deeper cross-agent control-loop support only after the dashboard-first monitoring path is validated

## Next-Step Pointer

For release-facing and forward-looking work, use:

- `docs/context/2026-04-13-post-v1.0.3-handoff.md` for the immediate uncommitted handoff and recommended next development task
- `docs/release-notes-v1.0.3.md` for release-facing summary
- `docs/roadmap-next.md` for forward-looking prioritization
- `docs/release-checklist.zh-CN.md` for the final operator-facing release checklist
