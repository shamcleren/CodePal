## CodePal v1.3.4

This patch release improves Provider Gateway setup and fixes several responsiveness issues found while configuring providers.

### Highlights

- **Broader Provider Gateway support**: Provider Gateway now supports multiple configured vendors, including DeepSeek, MiniMax, Qwen, Kimi, Zhipu, SiliconFlow, OpenRouter, and custom OpenAI-compatible providers.
- **Cleaner provider configuration**: the Provider Gateway settings page now keeps everyday controls compact, with advanced provider fields, model mappings, and client connection details tucked behind expandable sections.
- **Safer provider editing**: editing Provider Gateway fields no longer freezes or blanks the renderer, and the provider edit flow is covered by an Electron e2e regression test.
- **More useful Analytics refresh**: Analytics refresh now reloads both summary data and trend data, adds monitor-friendly auto-refresh, and avoids overlapping refresh calls.
- **Codex monitoring fix**: Codex sessions backed by session-log monitoring are no longer misclassified as needing repair because of stale legacy hook/config checks.

### Validation

- `npm run lint`
- `npm test`
- `npm run build`
- `npx playwright test -c playwright.e2e.config.ts tests/e2e/provider-gateway-edit.e2e.ts`
