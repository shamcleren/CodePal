# Codex Approval Handoff

## Purpose

This handoff is for the next window that will continue the real Codex approval loop work only.

Do not start ACP common-layer implementation in that window.

Before doing any more Codex approval work, read:

- `docs/context/2026-04-03-codex-notify-blocker.md`

## Current Product Baseline

- CodePal Phase 1 is already a stable unified monitoring panel with bounded structured-action handling
- Cursor approval / choice flows already round-trip through the hook path
- Codex currently contributes passive monitoring through `~/.codex/sessions/**/*.jsonl`
- Real Codex approval does not yet enter the shared pending-action loop
- Codex `notify` hook entry groundwork now exists, but current public `notify` behavior is not yet a real approval source

## Scope For The Next Window

Only close the real Codex approval loop:

1. First confirm a real Codex approval source exists beyond completion-only `notify`
2. Map the real Codex approval request into the existing canonical pending-action model
3. Let `Allow / Deny` write back to the matching Codex hook process

Out of scope:

- ACP / linked runtime / capability router work
- general prompt-send channel work
- freeform `text_input`
- a hook-only replacement for all Codex monitoring

## Working Rule

For now, treat Codex as a dual-surface integration:

- session log is the stable passive monitoring source
- `notify` is only hook-entry groundwork until Codex exposes a real approval source

Do not force log and hook into a new abstraction layer yet.

## Required Semantic Guardrails

- `sessionId` must stay stable across Codex log and Codex hook events
- do not invent anonymous Codex sessions when the hook payload lacks session identity
- keep `approval` as explicit `allow / deny`
- preserve current pending lifecycle rules:
  - open
  - consumed_local
  - cancelled / expired when upstream semantics exist
  - bounded stale-pending cleanup remains acceptable in Phase 1
- keep prompt ownership unchanged in this window; this task is approval-only

## Recommended Minimal Design

### 1. Hook Attachment

Add a Codex-specific hook entry path instead of trying to infer approvals from session jsonl.

Preferred shape:

- add a Codex hook subcommand alongside the existing hook CLI entrypoints in `src/main/hook/`
- wire Codex user-level configuration from `~/.codex/config.toml`
- keep `src/main/codex/codexSessionWatcher.ts` in place for passive session monitoring

### 2. Approval Mapping

Normalize the real Codex approval hook payload into the existing canonical `status_change` envelope.

Required mapping target:

- `tool = "codex"`
- `status = "waiting"`
- `pendingAction.type = "approval"`
- `pendingAction.options = ["Allow", "Deny"]`
- `pendingAction.id` must come from a stable Codex request/action identity
- `responseTarget` should reuse the current blocking-hook collector pattern

Do not add Codex-specific approval UI semantics in the renderer.

### 3. Write-Back

Keep CodePal's internal action-response flow unchanged:

`renderer -> main -> sessionStore -> dispatchActionResponse -> responseTarget`

The Codex-specific adaptation should live at the hook edge:

- CodePal still emits the current shared `action_response`
- the Codex hook wrapper translates the shared approval response into whatever the real Codex hook process expects on stdout / exit / local protocol

## Files To Inspect First

- `src/main/hook/runHookCli.ts`
- `src/main/hook/blockingHookBridge.ts`
- `src/main/ingress/hookIngress.ts`
- `src/main/actionResponse/dispatchActionResponse.ts`
- `src/main/codex/codexSessionWatcher.ts`
- `src/adapters/codex/normalizeCodexLogEvent.ts`
- `src/adapters/shared/eventEnvelope.ts`
- `src/shared/sessionTypes.ts`
- `docs/context/current-status.md`
- `docs/superpowers/specs/2026-04-03-acp-hook-complement-design.md`

## Current Decision Summary

- Do not start ACP now
- Do not replace Codex monitoring with hook-only in this step
- Do not make renderer-only Codex approval exceptions
- Do use the existing canonical pending-action loop and response-target routing

## Done Condition For That Window

The work is done when a real Codex approval request:

1. appears in CodePal as `pendingAction.type = "approval"`
2. renders `Allow / Deny` in the existing pending UI
3. writes the chosen decision back to the matching real Codex hook process
4. does not require ACP infrastructure or a renderer-only special case
