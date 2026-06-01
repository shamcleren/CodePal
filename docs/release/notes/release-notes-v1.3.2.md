## CodePal v1.3.2

This patch release republishes the v1.3.1 monitoring and usage-alignment work from a clean CI baseline. It keeps the user-facing behavior the same as v1.3.1, with release validation tightened so GitHub Actions matches the local verification path.

### Highlights

- **Clean release baseline**: v1.3.2 is cut from the follow-up commit that fixes the remote CI failures seen on the v1.3.1 tag.
- **Timezone-stable usage tests**: Work Review and Analytics usage assertions now use the same local-day bucket semantics as the app, so UTC CI and local Asia/Shanghai runs agree.
- **E2E coverage check hardened**: the Analytics source-coverage assertion now accepts English casing differences from the rendered UI.
- **Same app fixes as v1.3.1**: session noise filtering, unified token / cost formatting, simplified Analytics, 30-day Work Review coverage, and aligned daily usage totals are preserved.

### Validation

- `npm run lint` - clean
- `TZ=UTC npm test` - all non-skipped tests passing
- `npm run build` - successful
- `npm run test:e2e` - 17 Playwright tests passing
