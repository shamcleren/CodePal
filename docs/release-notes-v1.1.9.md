## CodePal v1.1.9

This hotfix fixes a startup regression for users updating from an older local history database.

### Highlights

- **Fixed startup after analytics migration**: legacy `history.sqlite` files now add the new token usage source columns before creating indexes that depend on them.
- **Startup no longer half-opens on history errors**: if history persistence cannot initialize, CodePal keeps the app window and IPC listener available for the current launch while history is disabled.
- **Clearer startup failure logging**: uncaught main startup failures now write an explicit `[CodePal] startup failed` log instead of leaving only a gateway listener behind.
- **Regression coverage for old local data**: tests now cover the old token usage schema and history-disabled IPC fallback.

### Validation

- Reproduced the 1.1.8 failure with a real legacy `history.sqlite` copy
- Verified the migrated real local database restores sessions and opens IPC
- Full local unit, lint, build, and E2E validation completed
