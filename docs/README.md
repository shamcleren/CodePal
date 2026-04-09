# Docs Guide

Use this directory by purpose rather than trying to read everything in one pass.

## If You Need The Current Baseline

- `docs/context/current-status.md`
  Current shipped behavior, validation status, known gaps, and implementation baseline.

## If You Need Release-Facing Material

- `docs/release-notes-v1.0.0.md`
  English release notes for the current 1.0.0 release target.
- `docs/release-notes-v1.0.0.zh-CN.md`
  Chinese release notes for the current 1.0.0 release target.
- `docs/release-assets.md`
  Asset checklist for README and GitHub Release screenshots / media.
- `docs/release-assets.zh-CN.md`
  Chinese version of the same asset checklist.
- `docs/macos-signing-runbook.zh-CN.md`
  Chinese maintainer runbook for macOS signing, notarization, and DMG `staple + validate`.
- `docs/operational-readiness-v1.0.0.zh-CN.md`
  Chinese checklist for what still needs to be in place before treating `1.0.0` as a fully operated release.

## If You Need Future Planning

- `docs/roadmap-next.md`
  English planning notes for what should come after the current V1 release baseline.
- `docs/roadmap-next.zh-CN.md`
  Chinese planning notes for the same roadmap direction.

## If You Need This Guide In Chinese

- `docs/README.zh-CN.md`
  Chinese version of this document map.

## Context Notes

- `docs/context/*.md`
  Short-lived handoff notes, blockers, and implementation context from specific work windows.

Use these when:

- a filename is referenced from `current-status.md`
- you are continuing a partially finished thread
- you need the rationale behind a narrow decision

Do not treat these files as the primary product spec unless `current-status.md` points you there.

## Superpowers Working Docs

- `docs/superpowers/specs/`
  Design docs created during earlier design passes
- `docs/superpowers/plans/`
  Execution plans created from those design docs

These are local working artifacts, not the current product contract. They can be useful for tracing why a change happened or recovering implementation intent, but they should not be treated as repository-facing baseline docs.

## Visual Assets

- `docs/icon.png`
  App icon used in the repository README
- `docs/hero-main.png`
  Primary dashboard screenshot for README and release-facing material
- `docs/index.png`
  Older main panel reference screenshot
- `docs/setting.png`
  Settings reference screenshot

If you add more images, keep README-facing assets easy to identify and avoid leaving unnamed scratch files here.
