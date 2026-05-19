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
- v1.1.6 candidate validation on 2026-05-19:
  - `npm test -- src/adapters/codex/normalizeCodexLogEvent.test.ts src/main/session/sessionStore.test.ts src/renderer/sessionRows.test.ts`
  - `npm run lint`
  - `npm test`
  - `npm run build`
  - `npm run test:e2e`
  - `npm run dist:mac`
  - `git diff --check`
- v1.1.6 local macOS package completed on 2026-05-19:
  - `release/CodePal-1.1.6-arm64.dmg`
  - `release/CodePal-1.1.6-arm64.zip`
  - `release/CodePal-1.1.6-arm64.dmg.blockmap`
  - `release/CodePal-1.1.6-arm64.zip.blockmap`
  - `release/latest-mac.yml`
- v1.1.6 notarization returned `Accepted`, and the `.app` / `.dmg` staple steps completed locally.
- v1.1.7 release validation on 2026-05-19 covers the analytics-history follow-up patch:
  - `npm run lint`
  - `npm test`
  - `npm run build`
  - `npm run test:e2e`
  - `npm run release:mac`
  - `git diff --check`
- v1.1.7 macOS release artifacts:
  - `release/CodePal-1.1.7-arm64.dmg`
  - `release/CodePal-1.1.7-arm64.zip`
  - `release/CodePal-1.1.7-arm64.dmg.blockmap`
  - `release/CodePal-1.1.7-arm64.zip.blockmap`
  - `release/latest-mac.yml`
- v1.1.7 was pulled back to draft after release validation found the packaged app bundle could fail `codesign --verify` / Gatekeeper after app-level stapling wrote an invalid top-level `Contents/CodeResources` ticket.
- v1.1.8 hotfix validation on 2026-05-19 adds strict packaged-artifact gates:
  - `npm test -- src/main/history/usageBackfill.test.ts`
  - `npm run test:e2e -- tests/e2e/codepal-analytics.e2e.ts`
  - `npm run lint`
  - `npm test`
  - `npm run build`
  - `npm run test:e2e`
  - `npm run release:mac`
  - release hook verifies the build app, zip-extracted app, and dmg-mounted app with `codesign --verify`; zip/dmg app surfaces are also assessed with `spctl`.
  - release hook validates stapled DMG, refreshes dmg blockmap / `latest-mac.yml`, and rejects updater metadata whose size/hash no longer matches final artifacts.
  - release hook regenerates stale `latest-mac.yml` for the current version and redacts Apple notary secrets from release logs.
- v1.1.9 hotfix validation on 2026-05-19 covers legacy `history.sqlite` migration from the pre-`source_key` token usage schema and verifies the app can still open with history disabled when persistence startup fails.
- v1.1.10 patch validation on 2026-05-19 covers inflated analytics totals from duplicated local history imports, repeated Codex token snapshots, and Codex cached-input double counting.
- v1.0.3 through v1.1.10 are all shipped. Current shipped baseline is **v1.1.10**.
- v1.1.0 shipped: macOS notifications and sounds, session restore on app update, send-message UI scaffolding, click-to-navigate with `open -a` fallback
- v1.1.1 shipped: terminal metadata capture at hook time, capability-gated send-message (tmux / Ghostty), per-terminal precise jump dispatch
- v1.1.2 shipped: blocking-hook TTL fix, handshake for half-alive CodePal
- v1.1.3 shipped: removed Claude PreToolUse blocking hook, CodePal is now dashboard-only for Claude approval
- v1.1.4 shipped: Qoder / Qwen / Factory agent support, dashboard polish from dogfood pass
- v1.1.5 shipped: WezTerm / kitty / iTerm2 send-message and jump, updater double-spawn fix, notarization fix, E2E stability
- v1.1.6 shipped: standalone Analytics page and HTML reports, clearer Provider Gateway settings, Phase 1 dashboard polish, Codex subexecution merge/noise reduction
- v1.1.7 shipped: Claude / Codex usage backfill, longer analytics retention, readable Top Sessions, and clearer compact Analytics cards
- v1.1.8 shipped: macOS release hotfix for the v1.1.7 app bundle signature failure, plus stricter packaged-artifact validation
- v1.1.9 shipped: legacy analytics history migration startup fix, history-disabled startup fallback, and explicit startup failure logging
- v1.1.10 shipped: analytics duplicate cleanup, Codex token snapshot dedupe, and Codex cached-input accounting fix

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
- Cursor tool-result calibration now covers MCP-style `response.result.content[].text` payloads, so richer tool output does not fall back to just the tool name
- Codex subexecution logs are now treated as internal activity when possible. `thread_source: "subagent"`, `source.subagent.other`, and `source: "subagent:<kind>"` all mark guardian / sandbox / subagent work for `cwd` + 30-minute-window merge into the nearest user session.
- Timeline and row presentation are now aligned to a dashboard-first baseline:
  - unified message / tool / sideband visual hierarchy
  - lower-noise suppression for duplicate or low-information rows
  - correlated Codex tool-call / tool-result recovery where upstream metadata allows it
  - Codex `Chunk ID` / shell-result boilerplate stays in expanded timeline but does not take over the main row title or collapsed summary
  - stronger `running` / `waiting` row distinction plus lightweight running motion
  - flat session ordering by `lastUserMessageAt`, then `updatedAt`
- In-memory session history still uses dashboard-oriented retention windows instead of accumulating forever:
  - `running` / `waiting`: retained
  - `completed` / `idle` / `offline`: 24 hours
  - `error`: 48 hours
- Full normalized session history is now also persisted locally in `~/Library/Application Support/codepal/history.sqlite`:
  - detailed session/activity retention defaults to 30 days
  - token usage analytics retention defaults to forever
  - old `retentionDays` settings are migrated to the nearest supported detail-retention preset
  - automatic max-size trimming has been removed; the settings UI shows current DB size and keeps clear actions explicit
  - full history is read on demand in the existing expanded session details view
  - clearing persisted history only removes CodePal-managed SQLite history, not upstream logs
- Expanded session rows now keep the outer session list pinned to the expanded row bottom while the details panel grows, so opening a lower row does not leave the newest details below the visible viewport
- The post-v1.0.3 patch candidate currently includes:
  - refreshed brighter app icon artwork
  - Retina-scale and larger-mask macOS menu bar template icon rendering
  - CodeBuddy `conversation_id` / `conversationId` session identity support
  - CodeBuddy CN app follow-up JSON cleanup
  - Cursor MCP-style `response.result.content[].text` tool-result extraction
  - fast unsigned `.app` generation through `npm run dist:mac:dir`

### Integration Settings

- Main process diagnostics now expose the current CodePal listener endpoint, executable entrypoint, and per-agent integration health (`active` / `legacy_path` / `repair_needed` / `not_configured`)
- Provider Gateway settings now expose:
  - active provider/profile
  - provider base URL
  - token configured/missing state without revealing the token
  - Claude-side model names and upstream model mappings
  - per-model health check results
  - Claude Desktop and Codex Desktop local client setup actions
- UI can write or repair user-level hook config for:
  - `Codex` via `~/.codex/config.toml` `notify = [...]` (live hook entry groundwork; session-log monitoring remains in place)
  - `Cursor` via `~/.cursor/hooks.json`
  - `CodeBuddy` via `~/.codebuddy/settings.json`
- Writes are idempotent and create a backup before changing an existing file; Provider Gateway client setup appends/updates its own entries, and explicit switch actions save prior defaults before changing the active client provider
- Invalid or incompatible existing config structures are reported back to the UI instead of being force-overwritten
- Codex diagnostics treat healthy session-log monitoring as the active path and suppress stale legacy `~/.codex/hooks.json` incompatibility warnings, because current Codex monitoring no longer depends on that legacy file
- Main process now also carries a dedicated usage aggregation path separate from session timeline state
- Usage analytics now backfills local Claude / Codex token history from `~/.claude/projects/**/*.jsonl` and `~/.codex/sessions/**/*.jsonl`; imported rows are keyed by source so startup rescans are idempotent. The backfill starts only after the renderer is ready and uses a cooperative async scanner so large local histories do not block app launch.
- Analytics now has a standalone renderer page with `today` / `7d` / `30d` presets, custom date ranges, compact model / agent breakdowns, and self-contained detailed HTML report generation.
- Usage reports show Top Sessions by readable first-user-message summaries with a shortened session id fallback instead of leading with opaque UUIDs.
- Renderer top bar now uses a compact quota-first usage strip
- Usage strip now supports `compact` / `detailed` density, with reset times either shown inline or exposed by hover title
- Claude Code usage visibility is implemented through two sources:
  - transcript/session-log token usage from `~/.claude/projects/**/*.jsonl`
  - statusLine-derived `rate_limits` snapshots, retained as last-known local rate-limit data when Claude CLI provides them and hydrated back into the usage strip on app startup
- Settings layout is now grouped into:
  - `Overview`
  - `Provider Gateway`
  - `Agent Integrations`
  - `Preferences`
  - `Advanced`
- Settings navigation now favors short labels and section summaries instead of long repeated explanations
- Main panel now exposes actionable update states through a conditional update button; idle / up-to-date states do not permanently occupy header space
- The Maintenance update panel remains the detailed update control surface

### Release Build

- A macOS release build can be produced via `npm run dist:mac`
- A faster local unsigned `.app` test build can be produced via `npm run dist:mac:dir`
- Release artifacts include dmg, zip, blockmap files, and `latest-mac.yml`
- Signed / notarized distribution is the expected public release path when Apple credentials are configured
- v1.0.3 release assets are treated as shipped; future release work should preserve updater metadata and signing / notarization verification rather than re-describing v1.0.3 as pending
- Current v1.1.10 local unit / lint / build verification is green on 2026-05-19.

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
- `src/main/gateway/`: local provider gateway, token store, health checks, Codex Responses adapter, and desktop client setup writers
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

- Provider Gateway currently supports the MiMo provider through an Anthropic-compatible upstream and a Codex Responses-to-Anthropic adapter. Broader provider types such as OpenAI-compatible, Bedrock, and Vertex remain future profile/adapter work.
- Codex Gateway support is a protocol bridge for `/v1/responses`; advanced Codex tool-call parity depends on what upstream MiMo exposes through the Anthropic-compatible messages API and needs further real-session calibration.
- Codex integration currently focuses on session/activity visibility; structured pending-action write-back is not part of the current primary UX
- Cursor full hook-event calibration is still being expanded beyond the current normalized subset; unknown payloads should continue to be pushed down into adapter/normalizer work instead of renderer-side guessing
- GoLand and PyCharm should stay on the shared CodeBuddy JetBrains plugin watcher/framework path; other JetBrains IDEs may reuse the same framework, but they are not part of the current V1 calibrated / accepted scope
- Claude Code has visible token usage plus statusLine-derived quota snapshots when upstream `rate_limits` are present; provider-authoritative MiMo quota is not implemented because the official MiMo docs expose dashboard usage, compatible inference APIs, and RPM/TPM rate limits, but no stable account quota/reset API endpoint
- MiMo provider quota should stay dashboard/manual until MiMo publishes an official account usage or remaining-quota API. The official sources checked on 2026-05-19 were `https://www.mimo-v2.com/docs/faq`, `https://www.mimo-v2.com/docs/pricing`, and `https://www.mimo-v2.com/docs`
- CodeBuddy still needs broader real-payload and transcript-shape calibration beyond the current normalized subset
- CodePal-owned app, docs, packaged macOS, and tray icon assets now use the refreshed centered monitoring-panel mark; third-party agent icon normalization remains future polish
- CodePal → codeagent structured message delivery is **capability-gated terminal delivery**. The composer renders only when the session has a concrete delivery channel: tmux, WezTerm, kitty, iTerm2, or Ghostty. Terminal.app and Warp still lack a reliable supported text-injection surface.
- CodePal no longer presents Claude PreToolUse as a dashboard approval loop. Agent-native approval remains the source of truth; Codex remains blocked by upstream (`notify` hook is completion-only), and CodeBuddy still only supports heuristic external-approval display because upstream `permission_prompt` payloads do not yet include a structured `pendingAction` or a decision write-back channel.
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
- Integration diagnostics and repair flow are already in place for all supported agents
- Claude Code token usage and statusLine `rate_limits` snapshots are already visible in the shared usage surface when available, including last-known cached rate-limit snapshots after restart
- Token analytics are now available on a standalone Analytics page, including persisted Claude / Codex token records, daily trends, model breakdowns, custom ranges, and HTML reports.
- Header usage display, update status visibility, compact settings navigation, and settings regrouping are already in place
- Provider Gateway is a first-class settings feature: CodePal can run a local gateway on `127.0.0.1:15721`, manage provider token presence separately from client configs, expose mapped MiMo models, health-check upstream mappings, and provide reversible Claude Desktop / Codex Desktop switch actions with restart guidance
- Session ordering and expiration now follow dashboard-oriented defaults
- Persisted session history is now available across app restarts, while the main list remains summary-first
- Expanded session details preserve bottom visibility for lower rows while keeping the internal history timeline scroll behavior intact

### Explicitly Deferred

- ACP / `acpx` common capability extraction
- freeform `text_input`
- moving control-loop UX back onto the main dashboard path

### v1.1.0–v1.1.10 Release Track

v1.1.0 through v1.1.10 are shipped. See individual release notes for details:

- `docs/release-notes-v1.1.0.md` — macOS notifications, session restore, send-message UI scaffolding, click-to-navigate (open -a)
- `docs/release-notes-v1.1.1.md` — terminal metadata capture, capability-gated send-message (tmux / Ghostty), per-terminal jump dispatch, keep-alive cleanup
- `docs/release-notes-v1.1.2.md` — blocking-hook TTL fix, sendEventLine handshake
- `docs/release-notes-v1.1.3.md` — removed Claude PreToolUse blocking hook, dashboard-only for Claude approval
- `docs/release-notes-v1.1.4.md` — Qoder / Qwen / Factory agent support, dashboard polish
- `docs/release-notes-v1.1.5.md` — WezTerm / kitty / iTerm2 send-message and jump, updater double-spawn fix, notarization fix
- `docs/release-notes-v1.1.6.md` — Analytics page, Provider Gateway settings, dashboard polish, Codex subexecution merge
- `docs/release-notes-v1.1.7.md` — Claude / Codex usage backfill, analytics retention, readable Top Sessions
- `docs/release-notes-v1.1.8.md` — macOS launch hotfix and stricter release artifact validation
- `docs/release-notes-v1.1.9.md` — legacy analytics history migration startup fix and history-disabled startup fallback
- `docs/release-notes-v1.1.10.md` — analytics duplicate cleanup, Codex token snapshot dedupe, and cached-input accounting fix

## Next-Step Pointer

For release-facing and forward-looking work, use:

- `docs/context/2026-05-07-provider-gateway-handoff.md` for the Provider Gateway / MiMo / Claude Desktop / Codex Desktop handoff
- `docs/release-notes-v1.1.10.md` for the v1.1.10 release
- `docs/roadmap-next.md` for forward-looking prioritization (Tier 2 agent/terminal expansion, monitoring depth, product polish)
- `docs/release-checklist.zh-CN.md` for the final operator-facing release checklist
