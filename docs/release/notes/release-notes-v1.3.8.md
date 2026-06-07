## CodePal v1.3.8

This patch release aligns cross-agent session lifecycle states, removes legacy reply surfaces that could interfere with native agent flows, and records ACP Sessions as the next major operation-entry direction.

### Highlights

- **Aligned session lifecycle states**: completed sessions now stay `DONE` across Claude, Codex, CodeBuddy, and Cursor-style events instead of being downgraded by later idle/offline notifications.
- **Safer native-session boundary**: legacy free-text replies and pending-action response buttons are disabled so CodePal does not inject messages or approval decisions into sessions it does not own.
- **Read-only pending actions**: pending action cards remain visible for awareness, but CodePal directs users back to the original tool instead of offering Allow/Deny-style controls.
- **ACP Sessions roadmap handoff**: the roadmap now replaces the older managed CLI operation direction with CodePal-owned ACP Sessions for future operation entry points.
- **Compatibility follow-up**: DeepSeek / OpenAI-compatible usage fields remain normalized across gateway, watcher, backfill, and ingress paths.

### Validation

- `npm test`
- `npm run lint`
- `npm run build`
