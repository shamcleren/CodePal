# CodePal v1.3.9

This hotfix focuses on macOS auto-update reliability.

- Rebuilt the updater `.zip` from the final signed app bundle before notarization, blockmap generation, and `latest-mac.yml` refresh.
- Added final macOS release asset validation that extracts the updater `.zip`, mounts the `.dmg`, and verifies both app bundles with `codesign` and Gatekeeper assessment before upload.
- Hardened the release checklist so GitHub Release draft assets must be downloaded and re-validated before publishing.
