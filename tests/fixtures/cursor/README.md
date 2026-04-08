# Cursor Payload Fixtures

本目录固化当前 `Cursor` hook payload 校准所依赖的真实 / 准真实样本，避免后续继续把 richer hook 形状散落在各个单测里。

## 设计原则

- `official-doc`：直接对应 Cursor 官方 hook 事件形状。
- `quasi-real`：来自当前 CodePal 已验证过的真实 / 准真实 payload 变体。
- fixture 只保留 adapter 校准所需最小字段，不复制完整冗长原始日志。
- expectation 只描述共享模型真正关心的结果：`sessionId`、`status`、`task`、`activityItems` 关键字段、必要的 `meta`。

## 当前覆盖

| Fixture | 来源 | 覆盖点 |
| --- | --- | --- |
| `hook-before-read-file.json` | official-doc | `beforeReadFile` 从结构化 `tool_input.file_path` 提取 tool call body |
| `hook-before-mcp-execution-uri.json` | quasi-real | `beforeMCPExecution` 从结构化 `tool_input.uri` 提取 tool call body |
| `hook-notification-idle-prompt.json` | official-doc | `Notification + idle_prompt` 应映射为 `idle` |
| `hook-after-mcp-execution-response-stderr.json` | quasi-real | `afterMCPExecution` 从嵌套 `response.stderr` 提取 tool result |
| `hook-after-file-edit-structured-path.json` | quasi-real | `afterFileEdit` 在缺少文本摘要时从结构化 `file_path` 生成可读编辑提示 |
| `hook-after-shell-execution-tool-result-summary.json` | quasi-real | `afterShellExecution` 从 `tool_result.summary` 提取 tool result |
| `hook-after-shell-execution-mixed-result-priority.json` | quasi-real | `afterShellExecution` 同时有 `stdout/stderr/summary` 时优先选 concise summary |
| `hook-after-shell-execution-output-over-summary.json` | quasi-real | `afterShellExecution` 同时有 `output` 和 `tool_result.summary` 时优先显式 output |
| `hook-post-tool-use-response-result-output.json` | quasi-real | `PostToolUse` 从 `response.result.output` 提取 tool result |
| `hook-status-change-usage.json` | quasi-real | `StatusChange` 携带 `usage / context / rate_limits` 时进入统一 usage 提取路径 |

## 当前结论

- Cursor tool call/result 的 richer body 提取应该优先吃结构化字段，而不是退回到 `tool_name`。
- `Notification` 必须区分 `permission_prompt` 和 `idle_prompt`，不能一律压成 `waiting`。
- 对于 richer tool result，`response/result/tool_result/stdout/stderr` 都要参与有限递归提取。
- Cursor usage 不应塞进 timeline 事件语义里，应该走独立 usage 提取路径并与 session 视图解耦。
