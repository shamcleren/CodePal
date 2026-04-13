## CodePal v1.0.5 Candidate

This is a patch-level follow-up to v1.0.4. It keeps the scope limited to icon polish and local test-build ergonomics.

### Fixed

- Redesigned the app icon around a simpler dark surface, a green `C` mark, and a blue companion dot so it reads more clearly at small macOS sizes.
- Enlarged and simplified the macOS menu bar template icon mask so the status item aligns better with neighboring menu bar icons.
- Exported the tray template as a 38x38 @2x PNG so the packaged menu bar glyph renders at roughly 19pt.

### Changed

- Added `npm run dist:mac:dir` for quickly generating `release/mac-arm64/CodePal.app` without dmg / zip packaging, signing, or notarization.
- Pointed macOS packaging at the source PNG icon so electron-builder can generate the app bundle `.icns` consistently during local and release builds.

### Validation

- `npm test -- src/main/tray/createTray.test.ts src/main/tray/iconAssets.test.ts`
- `npm run test:e2e`
- `npm run lint`
- `npm run dist:mac:dir`
- `git diff --check`

### Release Note

- `package.json` now reports `1.0.5`.
- Treat this document as the working v1.0.5 release-note draft while final local testing is in progress.
