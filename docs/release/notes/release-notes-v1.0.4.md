## CodePal v1.0.4 Candidate

This is a patch-level follow-up to v1.0.3. It focuses on visual polish and payload normalization reliability, not new product scope.

### Fixed

- Rendered the macOS menu bar template icon at Retina scale so the status item no longer appears oversized or fuzzy.
- Kept expanded session rows visible when lower rows open and their detail panels grow.
- Accepted CodeBuddy status payloads that identify sessions with `conversation_id` / `conversationId`, not only `session_id` / `sessionId`.
- Suppressed JSON-only CodeBuddy CN app follow-up completion payloads from the visible timeline while preserving real follow-up questions and `conversationId` metadata.
- Read Cursor / MCP-style tool results from `response.result.content[].text` instead of falling back to the tool name.

### Validation

- `npm test -- src/main/tray/createTray.test.ts src/main/tray/iconAssets.test.ts`
- `npm test -- src/adapters/codebuddy/normalizeCodeBuddyEvent.test.ts src/main/ingress/hookIngress.test.ts`
- `npm test -- src/adapters/codebuddy/normalizeCodeBuddyUiMessage.test.ts src/main/codebuddy/codebuddySessionWatcher.test.ts`
- `npm test -- src/adapters/cursor/normalizeCursorEvent.test.ts src/main/ingress/hookIngress.test.ts`
- `npm run lint`
- `npm run build`
- `git diff --check`

### Release Note

- `package.json` still reports `1.0.3` until the release version is intentionally bumped.
- Treat this document as the working v1.0.4 release-note draft while local testing is in progress.
