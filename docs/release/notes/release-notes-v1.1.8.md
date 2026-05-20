## CodePal v1.1.8

This hotfix replaces v1.1.7 because the macOS app bundle in that release could fail Gatekeeper signature validation after update.

### Highlights

- **Fixed macOS launch after update**: the release pipeline no longer staples the `.app` bundle in a way that invalidates Electron app code-signing resources.
- **Safer notarization flow**: zip and dmg artifacts are both submitted to Apple notarization, while only the dmg is stapled.
- **Stronger release validation**: the release hook now runs a second `codesign --verify` after notarization/staple steps and refreshes dmg updater metadata after the dmg changes.
- **Safer updater metadata**: stale `latest-mac.yml` files are regenerated for the current version before upload, and release logs redact Apple notary secrets.
- **Non-blocking analytics backfill**: Claude / Codex history import now starts after the window is ready and yields between JSONL batches, so large local histories cannot block the app from opening.
- **Includes the v1.1.7 analytics improvements**: Claude / Codex history backfill, readable Top Sessions, longer analytics retention, and cleaner Analytics summary cards.

### Validation

- Full local validation completed
- Analytics E2E coverage added for persisted token usage rendering
- Signed and notarized macOS package produced
