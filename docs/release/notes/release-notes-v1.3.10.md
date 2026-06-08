# CodePal v1.3.10

This hotfix focuses on updater self-healing and CodeBuddy quota compatibility.

- Added stale updater-cache self-healing when the running app version already matches or exceeds a pending downloaded update.
- Kept the updater UI aligned with the installed app version so completed installs do not continue to prompt for reinstall.
- Switched CodeBuddy Code quota fetching to the token.woa quota API using the authenticated Electron browser session cookies.
- Preserved compatibility with the previous CodeBuddy quota payload shape and migrated the default CodeBuddy Code quota endpoint.
