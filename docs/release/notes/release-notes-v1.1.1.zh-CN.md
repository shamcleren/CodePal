## CodePal v1.1.1 Candidate

基于 v1.1.0 的补丁版。这一版把 v1.1.0 中声明为"仅 UI 脚手架 / best-effort 激活"的两个 Tier 1 能力补齐：通过在 hook 层捕获终端元数据，send-message 和跳转都能落在正确的终端/pane，而不是再开一个新窗口。

### 新增

- **终端元数据捕获（hook 层）** — agent wrapper 脚本在 exec hook-cli 之前读取 `$TTY`（`ps -o tty= -p $PPID`）、`$TERM_PROGRAM`、`$ITERM_SESSION_ID`、`$TMUX` / `$TMUX_PANE`、`$GHOSTTY_RESOURCES_DIR` 等环境变量；`sendEventLine` 统一在出 IPC 前把 `TerminalContext` 盖在每条事件的 `meta.terminal` 上；`SessionRecord.terminalContext` 按字段合并，避免临时丢失某个 env 把之前采集到的信息清空。
- **Send Message（按能力门控的终端投递）** — 回复输入框只在 session 有确定投递通道时才渲染：
  - `tmux`：`tmux [-S socket] send-keys -t <pane> -l <text>` + `Enter`
  - `Ghostty`：AppleScript activate + `System Events` keystroke + 回车（best-effort，投到最前窗口）
  - 其他终端：输入框**完全不渲染**（不留 disabled 残影）。
  - `codepal:send-message` IPC 路径改走新的 `TerminalTextSender`，错误通过原有的 `codepal:send-message-result` 通道暴露（`no_reply_capability` / `tmux send-keys failed` / `session_not_found` 等）。
- **精确跳转（按终端分派）** — `SessionJumpService` 在 `open -a` fallback 之前，先按 `jumpTarget` 上的字段走专用策略：
  - `tmux`：`tmux [-S socket] switch-client -t <pane>` + `select-window`
  - `iTerm2`：AppleScript 遍历 windows/tabs/sessions，按 session id 选中
  - `Terminal.app`：AppleScript 按 `tty` 匹配已有 tab 并选中（不开新窗口）
  - `Ghostty`：best-effort `activate`（Ghostty 目前没有可脚本化的 per-tab 接口）
  - 最终 fallback 仍是 `open -a`。
- Claude Code 和 Codex 的 Notification hook 现在会从 env 里读取 terminal context，把 `tty` / `terminalSessionId` / `tmuxPane` / `tmuxSocket` 写进 jumpTarget，让上面的精确跳转链路端到端可用。

### 变更

- `package.json` 升到 `1.1.1`。
- `SessionRecord.hasInputChannel` 字段移除 —— 输入框是否显示改由共享 `canReply(session)` 判定（`tmuxPane` 存在，或 `app === "ghostty"` 且有 `terminalSessionId`）。
- `SessionHistoryTimeline` 仅在 `(running | waiting) && canReply(session)` 时渲染输入框。
- `SessionMessageInput` props 精简：由父组件决定是否渲染，自身不再关心 `hasInputChannel`，也不再显示"未连接到 …"占位文案。

### 移除

- `--codepal-hook keep-alive` 子命令和 `keepAliveHook` 模块 —— 这条原先的占位入站通道被终端投递取代。`ipcHub.sendMessageToSession` 仍保留在 hub 上供未来 IPC fallback 使用，但不再接入 UI 发送链路。
- 会话 store 的 `setInputChannel`，以及 `main.ts` 里 `onConnectionRegistered` / `onConnectionLost` 的连线。
- 两个依赖 keep-alive 的 e2e 用例（`codepal-keepalive.e2e.ts`、`codepal-send-message.e2e.ts`）—— 它们测的就是已被移除的通道。
- `sendMessage.placeholder.disconnected`（中英）文案，因不再可达。

### 范围说明

- **Terminal.app / iTerm2 / Warp / kitty / WezTerm 的 send-message 仍未交付** —— 这些终端没有稳定的文本注入面；在这些环境下输入框会直接隐藏，而不是灰掉。
- Ghostty 投递是 **best-effort**：Ghostty 当前没有 per-tab AppleScript，CodePal 只能激活应用然后向最前窗口发 keystroke。首次触发会有 macOS 自动化权限提示。
- Codex / CodeBuddy 的审批覆盖范围与 v1.1.0 相同 —— 仍受上游能力限制。
- Claude `allow` + 精确跳转 + 按终端投递的端到端手测在 `docs/superpowers/specs/2026-04-21-open-island-capability-alignment-design.md` 中作为 T1.1 跟踪，发版前必须通过。

### 验证

- `npm test`
- `npm run lint`
- `npm run build`
- `npm run test:e2e`
- `npm run dist:mac`
- T1.1 手测清单（tmux + Terminal.app + iTerm2 + Ghostty），对应 Tier 1 设计文档

### 发版备注

- `package.json` 已升到 `1.1.1`。
- 本文档先作为 T1.1 手测期间的 v1.1.1 release notes 草稿。
