## CodePal v1.3.3

This patch release tightens the session timeline and Analytics dashboard after the v1.3 usage-alignment work.

### Highlights

- **Quieter session timelines**: tool calls now attach to the previous assistant message as a compact marker, keeping the session flow focused on conversation.
- **More accurate model display**: Codex model metadata now follows the latest observed session context and records whether the model came from live event metadata, history, or token usage.
- **Sharper Analytics trends**: daily trends can group by project or token type, with clickable series toggles and localized legend actions.
- **Cleaner summary cards**: Analytics hero metrics now use rounded compact values so large numbers stay readable in narrow cards.

### Validation

- `npm test`
- `npm run lint`
- `npm run build`
