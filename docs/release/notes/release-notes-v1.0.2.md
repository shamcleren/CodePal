## CodePal v1.0.2

### Fixed

- Restored macOS in-app update metadata by shipping `latest-mac.yml` with releases.
- Added macOS updater blockmap assets to release uploads for reliable differential update support.
- Normalized GitHub HTML release notes into readable text in the app update panel.
- Aligned Electron E2E coverage with the wrapper-based Cursor hook installation path.

### Release Validation

- Release workflow validates that macOS updater metadata and distributable assets exist before creating a GitHub Release.
- Release assets include dmg, zip, blockmap files, and `latest-mac.yml`.
- E2E workflow covers the current Cursor wrapper hook install behavior.

### Downloads

- `CodePal-1.0.2-arm64.dmg`
- `CodePal-1.0.2-arm64.zip`
