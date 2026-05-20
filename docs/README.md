# Docs Guide

Use this directory by purpose rather than trying to read everything in one pass.

## Current Baseline

- `docs/context/current-status.md`
  Current shipped behavior, validation status, known gaps, and next handoff.
- `docs/architecture/design-overview.md`
  Product framing, architecture layers, shipped capability boundaries, and next-stage design direction.

## Planning

- `docs/planning/roadmap-next.md`
  Current roadmap after the v1.1.11 baseline.
- `docs/planning/roadmap-next.zh-CN.md`
  Chinese version of the roadmap.
- `docs/planning/research/deep-research-report.md`
  Research source for the next-stage direction: local AI coding operations memory, workflow health, personal-first paid value, and team expansion boundaries.

## Release

- `docs/release/notes/`
  GitHub Release and in-app update notes. Keep new version notes here as `release-notes-vX.Y.Z.md`; the release workflow reads this path.
- `docs/release/release-checklist.zh-CN.md`
  Operator checklist before publishing a release.
- `docs/release/macos-signing-runbook.zh-CN.md`
  macOS signing, notarization, DMG validation, and updater metadata runbook.
- `docs/release/macos-developer-id-setup.zh-CN.md`
  Developer ID certificate setup notes.
- `docs/release/release-assets.md`
  Screenshot and media checklist for README and GitHub Release material.
- `docs/release/release-assets.zh-CN.md`
  Chinese version of the release asset checklist.

## Support

- `docs/support/privacy-and-data.md`
- `docs/support/privacy-and-data.zh-CN.md`
- `docs/support/support-scope.md`
- `docs/support/support-scope.zh-CN.md`
- `docs/support/troubleshooting.md`
- `docs/support/troubleshooting.zh-CN.md`

These are release-facing user documents. Keep them aligned before changing telemetry, cloud sync, team sharing, outbound control, or data retention behavior.

## Context And Archive

- `docs/context/handoffs/`
  Historical handoffs and narrow implementation notes. Read only when `current-status.md` points there or when continuing a specific old thread.
- `docs/archive/`
  Historical audits and readiness checklists that are no longer primary operating docs.
- `docs/superpowers/specs/` and `docs/superpowers/plans/`
  Working artifacts from previous implementation passes. Useful for intent recovery, but not the current product contract.

## Assets

- `docs/assets/icon.png`
  App icon used by the repository README.
- `docs/assets/hero-main.png`
  Primary dashboard screenshot for README and release-facing material.
- `design/codepal-icon-redesign/`
  Source artwork, previews, and export notes for the refreshed app and macOS menu bar icons.

Avoid adding new top-level docs unless they are stable entry points. Prefer `architecture/`, `planning/`, `release/`, `support/`, `context/`, or `archive/`.
