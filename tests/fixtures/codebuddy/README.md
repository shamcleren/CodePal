# CodeBuddy Payload Fixtures

本目录固化本轮 `CodeBuddy CLI / hook payload` 与 transcript watcher 校准所使用的真实 / 准真实样本，并明确字段兼容矩阵，避免后续继续靠零散 `if/else` 猜字段。

## 设计原则

- `official-doc`：直接取自 CodeBuddy 官方 hooks / SDK 文档的字段形状。
- `quasi-real`：来自当前 CodePal 已接入的 CodeBuddy 状态更新假设，用于保证现有主链路不回退。
- fixture 只保留校准所需的最小字段，不把超长原始 payload 全量复制进仓库。
- 兼容矩阵明确区分“首选字段”和“降级字段”，后续 normalizer / ingress 测试都以这里为准。
- transcript `.jsonl` fixture 只保留第一批已确认会进入 dashboard 的记录类型：`message(user/assistant)`、`function_call`、`function_call_result`。

## 兼容矩阵

| Fixture | 来源 | 会话标识 | 状态信号 | 任务信号 | 时间信号 | Hook 标识 | 备注 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `agent-session-update-state-current-task.json` | quasi-real | `session_id` | `state` | `current_task` | `timestamp` | `hook_event_name=AgentSessionUpdate` | 当前已支持主链路；ingress 也接受裸 `AgentSessionUpdate` |
| `agent-session-update-status-message.json` | quasi-real | `sessionId` | `status` | `message` | `ts` | `tool=codebuddy` | 覆盖 camelCase 与 `message` 兜底 |
| `agent-session-update-conversation-id.json` | quasi-real | `conversation_id` | `state` | `current_task` | `timestamp` | `source=codebuddy` | 覆盖只带 conversation id 的真实状态更新形状 |
| `hook-session-start-source-startup.json` | official-doc | `session_id` | `hook_event_name=SessionStart -> running` | `source=startup` | 无，回退 `Date.now()` | `hook_event_name=SessionStart` | 官方 `source` 表示启动来源，不应覆盖厂商路由标识 |
| `hook-notification-permission-prompt.json` | official-doc | `session_id` | `notification_type=permission_prompt -> waiting` | `message` | 无，回退 `Date.now()` | `hook_event_name=Notification` | 代表等待用户授权 |
| `hook-notification-idle-prompt.json` | official-doc | `session_id` | `notification_type=idle_prompt -> idle` | `message` | 无，回退 `Date.now()` | `hook_event_name=Notification` | 代表空闲提醒，不应误判为等待授权 |
| `hook-user-prompt-submit.json` | official-doc | `session_id` | `hook_event_name=UserPromptSubmit -> running` | `prompt` | 无，回退 `Date.now()` | `hook_event_name=UserPromptSubmit` | 用户提交新指令，进入执行态 |
| `hook-post-tool-use-write-result.json` | quasi-real | `session_id` | `hook_event_name=PostToolUse -> running` | `tool_name` | 无，回退 `Date.now()` | `hook_event_name=PostToolUse` | 当存在结果字段时，应优先渲染为 tool result |
| `hook-post-tool-use-response-result-output.json` | quasi-real | `session_id` | `hook_event_name=PostToolUse -> running` | `tool_name` | 无，回退 `Date.now()` | `hook_event_name=PostToolUse` | `response.result.output` 也应提取为可读 tool result，而不是整段 JSON |
| `hook-pre-tool-use-write.json` | official-doc | `session_id` | `hook_event_name=PreToolUse -> running` | `tool_name` | 无，回退 `Date.now()` | `hook_event_name=PreToolUse` | `tool_input` 仅保留排查所需的摘要字段 |
| `hook-session-end-other.json` | official-doc | `session_id` | `hook_event_name=SessionEnd -> offline` | `reason` | 无，回退 `Date.now()` | `hook_event_name=SessionEnd` | 会话结束不等于任务完成，状态应偏向 `offline` |

## 当前结论

- `session_id/sessionId/conversation_id/conversationId` 都可以作为 CodeBuddy 状态类 payload 的会话标识。
- `status/state/agent_status` 仍是最高优先级的显式状态字段。
- 当显式状态字段缺失时，需要允许从 `hook_event_name` 和 `notification_type` 推导受限状态集合；`Notification` 缺少细分类型时默认按 `waiting` 降级，而不是误判为 `offline`。
- `task/current_task/message/prompt/tool_name/reason/source` 需要建立分层优先级，而不是仅靠 `message` 宽松兜底。
- 当 `PostToolUse` 带有明确结果字段时，应优先进入 shared timeline 的 `tool/result`，而不是退化成普通状态 note。
- `timestamp` 之外至少要兼容 `ts`；若两者都没有，统一回退到 `Date.now()`。
- `source` 在 CodeBuddy 官方 payload 中可能表示事件来源，例如 `startup`，不能再单独承担“这是 CodeBuddy 事件”的路由职责。
