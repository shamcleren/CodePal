## CodePal v1.1.2 候选版

在 v1.1.1 之上的 bug fix 版本，专门修 Claude Code blocking hook 的几个问题：审批卡片"消失但 Claude Code 还卡住"的现象，以及 hook 每次执行时往 Claude Code 终端倒的那条 SQLite 警告。

### Fixed

- **Pending 卡片不再比 hook 更早过期。** 之前 UI 上 pending 的过期时长误用了 `responseTarget.timeoutMs`（socket 写回的 10 秒超时），而 hook 的阻塞等待默认是 1 小时 —— 结果卡片 10 秒就消失，但 hook 还在继续把 Claude 挂着，一挂就是一小时。现在 hook 通过新字段 `pendingLifetimeMs` 显式告诉 UI 存活时长，`sessionStore` 按它算过期；socket 写超时保持原样。默认 UI TTL 从 25 秒提高到 120 秒，和下面的新 hook wait 默认值对齐。
- **Stop hook 不再把 `ExperimentalWarning: SQLite is an experimental feature` 倒到 Claude Code 终端当错误。** Hook wrapper 现在带 `NODE_NO_WARNINGS=1` 启动 Electron，这在 Node 侧直接静默。`~/.claude/settings.json` / `~/.cursor/hooks.json` 里的旧命令会在 CodePal 下次启动时自动改写。

### Changed

- **Hook 阻塞等待默认值由 1 小时降到 2 分钟。** 需要更长（比如短暂离开工位）可以用 `CODEPAL_HOOK_RESPONSE_WAIT_MS` 覆盖。1 小时基本等价于"用户不会回来了"；2 分钟更贴合真实决策，兜底更快 —— hook 超时后就退化到 Claude 原生的审批流程。

### Added

- **`sendEventLine` 握手检测半死状态的 CodePal。** Blocking hook 发送事件后，会等 IPC hub 写回一个 newline 结尾的 `{"ok":true}` ack，再相信事件被真正消费。如果 hub 接受了 TCP 连接但从不 read（进程卡住 / 半崩）hook 会在约 1.5 秒后放弃走原生流程，而不是硬等满整个 waitMs。新 env `CODEPAL_HOOK_HANDSHAKE_TIMEOUT_MS`（默认 1500ms）。非阻塞的状态事件保持 fire-and-forget，hub 只在事件带 `responseTarget` 时才 ack，避免污染长连接 session 流。

### 保留（有意不改）

- CodePal 没在跑时，Claude Code 终端里那条 `codepal-hook: connect ECONNREFUSED 127.0.0.1:17371` 依旧会出现。这是"CodePal 离线"的可见性信号，静默掉反而会隐藏状态。如果实际更像噪声不像信号，可再评估。

### 验证

- `npm test`（75 files, 679 tests）
- `npm run lint`
- Claude allow 流程的人工验证还没跑过，列为 follow-up。
