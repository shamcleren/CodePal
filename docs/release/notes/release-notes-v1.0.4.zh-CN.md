## CodePal v1.0.4 Candidate

这是 v1.0.3 之后的 patch 级跟进版本。范围集中在视觉细节和 payload 归一化可靠性，不扩大产品功能边界。

### 修复

- macOS 菜单栏 template 图标按 Retina 比例渲染，避免状态栏图标看起来过宽或发虚。
- 展开靠下的 session 时，外层列表会保持展开行底部可见，详情面板增长时不再把最新内容留在视窗外。
- CodeBuddy 状态 payload 现在支持用 `conversation_id` / `conversationId` 作为会话标识，不再只接受 `session_id` / `sessionId`。
- CodeBuddy CN app 的 JSON-only follow-up 完成 payload 不再进入可见 timeline，同时保留真实 follow-up question 和 `conversationId` 元数据。
- Cursor / MCP 风格工具结果现在会从 `response.result.content[].text` 提取正文，不再退回只显示工具名。

### 验证

- `npm test -- src/main/tray/createTray.test.ts src/main/tray/iconAssets.test.ts`
- `npm test -- src/adapters/codebuddy/normalizeCodeBuddyEvent.test.ts src/main/ingress/hookIngress.test.ts`
- `npm test -- src/adapters/codebuddy/normalizeCodeBuddyUiMessage.test.ts src/main/codebuddy/codebuddySessionWatcher.test.ts`
- `npm test -- src/adapters/cursor/normalizeCursorEvent.test.ts src/main/ingress/hookIngress.test.ts`
- `npm run lint`
- `npm run build`
- `git diff --check`

### 发版备注

- `package.json` 仍然是 `1.0.3`，直到明确执行版本号 bump。
- 本文档先作为本地测试期间的 v1.0.4 release notes 草稿。
