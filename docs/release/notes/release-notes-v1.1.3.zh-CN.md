## CodePal v1.1.3

产品方向收敛：CodePal 是 dashboard，不是"中间层"。Claude 原生的审批流程重新成为唯一决策入口 —— CodePal 的 blocking `PreToolUse` hook 被移除。

### 为什么

v1.1.2 已经把 blocking 的默认等待从 1 小时降到 2 分钟，但底层行为依然违背"不改变原生流程"的设计原则：只要 CodePal 没在跑、崩了、或者用户压根没看，Claude Code 就会在一条没人会看到的审批上空等。这不是 dashboard，而是一层会把真实工作卡住的中间件。

### Changed

- **CodePal 不再注册 Claude 的 `PreToolUse` hook。** Allow / deny 的人工决策重新回到 Claude Code 自己的终端。CodePal 依然监听 `SessionStart` / `UserPromptSubmit` / `Notification` / `Stop` / `SessionEnd` 做可见性。
- **`~/.claude/settings.json` 中已有的 `PreToolUse` 条目会在 CodePal 下次启动时自动清掉。** 即使因为某些原因（手动编辑、同步冲突）还残留着，CodePal 的 hook CLI 也会在收到 PreToolUse payload 时直接 no-op，绝不会向 Claude 写入阻塞决策。
- **README 增加"无干扰、无侵入"章节。** 不改变原生流程、默认只做可见性、可优雅降级 —— 把方向明确写出来，后面就不容易偏。

### 暂未移除

- `pendingAction` UI、`blockingHookBridge`、`sendEventLine` 握手、`--codepal-hook blocking-hook` CLI 分支都还留在代码里。它们仍然被 Cursor / Codex / CodeBuddy 的审批类事件使用。后续会做一次跨 agent 的审计：要么保留为按 agent opt-in 的开关，要么一并删除。

### 验证

- `npm test`（75 files, 677 tests）
- `npm run lint`
- 升级路径（v1.1.2 → v1.1.3 自动清理 PreToolUse 条目）的手动验证 —— 在本机实际升级之前标为 pending。
