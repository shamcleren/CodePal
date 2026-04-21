## CodePal v1.1.0 Candidate

这是 v1.0.x 监控基线之后的第一个 minor 版本。它按 `docs/roadmap-next.zh-CN.md` 的四条主线，把 CodePal 从纯监控推向轻量交互和主动感知。

### 新增

- **macOS 通知与声音** — 为关键 session 状态切换提供原生通知和可选声音（完成、等待决策、报错、长时间静默后恢复活动），默认策略避免同一状态抖动重复通知。
- **Allow / 审批扩展** — `allow / deny` 真 blocking 审批在 Cursor 和 Claude Code 上完整闭环：
  - Cursor 审批继续走原有的 PreToolUse hook 路径。
  - Claude Code `PreToolUse` 现在也接入 blocking hook bridge，用户的决定通过 Claude Code 的 `permissionDecision`（`allow` / `deny`）协议回写给上游，并附 CodePal 写入的 reason。
  - 接入诊断与修复流程把 `PreToolUse` 纳入 Claude Code 必需项集合，缺失时会直接报 `repair_needed`，不再静默回退。
  - Codex 仍受上游限制 —— 它的 `notify` hook 只是完成通知，不是真正的审批源。
  - CodeBuddy 仍然只以启发式方式展示 external approval 提示，因为上游 `permission_prompt` payload 目前既不带结构化 `pendingAction`，也没有开放决策回写通道。
- **Send Message（仅 UI 脚手架）** — `SessionMessageInput`、preload、共享类型和 IPC 通道已经就位，hook CLI 也埋好了 `--codepal-hook keep-alive` 子命令的骨架。输入框在 session 行旁可见，但 Claude Code / Codex / CodeBuddy 目前都没有向 CodePal 开放稳定的入站通道，v1.1.0 中消息**无法端到端**送达 agent。能力门控的终端回写（tmux / Ghostty）计划在 v1.1.x 补丁里跟进。
- **点击跳转（元数据 + best-effort 激活）** — External approval 和相关 session 事件现在都带上共享的 jump-target 元数据（agent、app 名称、工作区路径、session id、降级行为）。当前点击走 `open -a <appName> <workspacePath>` 做 best-effort 激活，可能开的是新窗口而不是聚焦原会话。按终端类型精确定位（Terminal.app / iTerm2 / Ghostty / tmux）延后到 v1.1.x 补丁。

### 变更

- `package.json` 升到 `1.1.0`。
- 接入诊断现在只有在 `SessionStart`、`UserPromptSubmit`、`PreToolUse`、`Notification`、`Stop`、`SessionEnd` 六项都指向 CodePal hook 可执行文件时，才把 Claude Code 视为 `active`。
- 渲染端 timeline 集成 `SessionMessageInput`，带本地回显，用户发出的消息会立刻与上游活动并列显示。

### 范围说明

- Codex 审批**未**进入 v1.1.0，明确受上游能力约束。后续进展取决于 Codex 是否开放真正的 approval / permission hook，并提供稳定的 `sessionId` 与决策回写语义。
- CodeBuddy 审批同样被上游 payload 层卡住。CodePal 这边已经具备路由 blocking 决策的能力，但 v1.1.0 不声明 CodeBuddy 审批已经端到端生效。
- Send-message 在 v1.1.0 **只是 UI 脚手架**，没有可达的 agent 入站通道，请不要把它当作可用的回复界面。
- 点击跳转在 v1.1.0 是 **best-effort 激活**，精确聚焦已存在的终端 / IDE 会话延后到 v1.1.x 补丁。
- 自由文本 `text_input` 仍然延后；send-message 真正可用之后，也只限定在向已识别的运行中 session 投递结构化消息，不做任意 prompt 注入。

### 验证

- `npm test`
- `npm run lint`
- `npm run build`
- `npm run test:e2e`
- `npm run dist:mac`

### 发版备注

- `package.json` 当前已经是 `1.1.0`。
- 本文档先作为最终本地测试期间的 v1.1.0 release notes 草稿。
