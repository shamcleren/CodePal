# Codex Notify Blocker Note

## Purpose

This note captures what is now confirmed about Codex `notify` integration, so future windows do not keep treating `notify` as the missing approval source.

## Confirmed State

- CodePal now has a Codex-specific executable hook entry:
  - `--codepal-hook codex`
- CodePal settings can now write a Codex `notify` command into:
  - `~/.codex/config.toml`
- CodePal still uses:
  - `~/.codex/sessions/**/*.jsonl`
  as the passive monitoring source

## What We Verified

### 1. Codex `notify` payload delivery shape

Current Codex `notify` integration should be treated as:

- program argv
- plus one JSON payload argument

It should **not** be treated as a stdin-first hook like the current Cursor / CodeBuddy hook path.

CodePal now reflects this in the Codex hook CLI path.

### 2. Current public `notify` behavior is completion-oriented

Based on the current public Codex issue/discussion trail, `notify` is currently a completion notification surface, not a real approval / permission-prompt hook surface.

Relevant references:

- [openai/codex#3247](https://github.com/openai/codex/issues/3247)
- [openai/codex#4005](https://github.com/openai/codex/issues/4005)

Practical consequence:

- do **not** assume `notify` can emit approval requests
- do **not** assume `notify` can close the CodePal approval loop

### 3. Current public `notify` payloads do not safely correlate to CodePal sessions

The current visible `notify` payload examples do not provide a stable `sessionId` / session identity that is safe to merge into CodePal's existing session model.

Practical consequence:

- do **not** invent anonymous Codex sessions from `notify`
- do **not** attach `notify` completion events to an arbitrary existing Codex session

CodePal now explicitly ignores such payloads and emits a warning instead:

- `"[CodePal Codex] unsupported notify payload ignored:"`

## What Was Implemented

- Added Codex hook CLI support in:
  - `src/main/hook/runHookCli.ts`
- Added Codex hook pipeline in:
  - `src/main/hook/codexHook.ts`
- Switched Codex hook handling to accept payload from argv when stdin is empty
- Added explicit guard:
  - if no stable `sessionId` / `session_id` exists, ignore the payload and warn
- Added Codex `config.toml` `notify = [...]` installation / detection in integration settings

## What This Means For Product Scope

At this point, Codex should still be treated as:

- passive monitoring via session log
- hook-entry groundwork via `notify`

It should **not** be described as having a completed live approval loop.

## Next Safe Step

Future Codex approval work should only resume when at least one of the following becomes available:

1. A real Codex approval / permission hook source that is separate from completion-only `notify`
2. A stable Codex payload that includes safe session identity and approval semantics
3. An upstream Codex capability explicitly documented as supporting approval interception / response

Until then, further work on "Codex approval via `notify`" is expected to produce churn rather than product progress.
