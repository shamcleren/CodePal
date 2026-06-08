# CodePal v1.3.11

This hotfix fixes the final macOS release upload step and carries forward the v1.3.10 updater / CodeBuddy fixes.

- Re-uploaded the final rebuilt zip and dmg artifacts after release metadata refresh so `latest-mac.yml` always matches the downloadable updater zip.
- Added stale updater-cache self-healing when the running app version already matches or exceeds a pending downloaded update.
- Switched CodeBuddy Code quota fetching to the token.woa quota API using the authenticated Electron browser session cookies.
- Added CodeBuddy cache-hit token parsing for DeepSeek / OpenAI-compatible usage payloads so Analytics cache-hit rates populate correctly.
