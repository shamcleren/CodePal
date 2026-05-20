## CodePal v1.1.11

这个版本加深了 Claude 和 Codex 的监控能力，并修复了后台 hook 启动问题。

### 重点变化

- **Claude statusLine 丰富**：现在会从 Claude Code 的 statusLine payload 中提取 model id，输出到 quota 诊断，即使没有 rate limits 数据，usage strip 也能展示 model 相关信息。
- **Codex timeline 噪音过滤**：低价值的 Codex 生命周期条目（Working、Context compacted、Turn aborted）现在会从展开的 session timeline 中隐藏。
- **状态栏估算费用**：当 model pricing 数据和 token 数量都可用时，状态栏会显示每个 agent 的估算费用（如 `$17.55`）。
- **后台 hook 修复**：agent hook 不再要求 CodePal GUI 先启动才能处理 hook 事件。

### 验证

- `npm test` — 82 个测试文件共 769 个用例，全部通过
- `npm run lint` — 无报错
- `npm run build` — 构建成功
