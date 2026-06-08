# CodePal v1.3.12

## Fixed

- Fixed macOS in-app update installation getting stuck after the update package was downloaded. Update installs now bypass the normal Provider Gateway suspend path so Squirrel can quit, replace the app, and relaunch CodePal.
- Added an Electron E2E assertion for CodeBuddy cache-hit analytics so cache percentages are verified against persisted usage data.

## Notes

- If you are already stuck on an older build where clicking install only closes the window, quit CodePal completely or install this version once from the DMG. Future updates from v1.3.12 onward use the fixed install path.
