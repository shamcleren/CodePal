## CodePal v1.3.7

This patch release restores safer opt-in Provider Gateway setup, improves startup safety, and polishes the light theme Work Review experience.

### Highlights

- **Safer Provider Gateway setup**: Claude Desktop, Claude CLI, and Codex configuration now use explicit client setup paths with backup/restore behavior instead of startup-side mutation.
- **Startup safety hardening**: CodePal avoids automatic integration repairs at launch and records startup failures more defensively, so monitoring can recover without rewriting third-party config unexpectedly.
- **Clearer Provider Gateway settings**: the Provider Gateway page now exposes active provider state, Claude CLI setup, copyable config paths, and richer e2e coverage for edit and restore flows.
- **Work Review light-theme polish**: Paper Ops now gives daily Work Review tabs distinct surfaces, borders, hover, and active states so day separation stays visible.
- **System appearance option**: Display preferences now include a Follow system theme option that tracks macOS light/dark appearance.
- **Updated pricing sync**: the model pricing catalog and maintenance docs are refreshed for the current pricing baseline.

### Validation

- `npm test -- src/shared/appSettings.test.ts src/renderer/components/DisplayPreferencesPanel.test.tsx src/renderer/App.test.tsx src/renderer/styles.test.ts`
- `npm run lint`
- `npm test`
- `npm run build`
- `npm run test:e2e`
- `git diff --check`
