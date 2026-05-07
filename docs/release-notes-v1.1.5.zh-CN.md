## CodePal v1.1.5

两条主线：**终端通道扩面** —— kitty / iTerm2 / WezTerm 都拿到了 jump 和 send-message，复用 tmux 的 pane-id 模式；**主面板体验抛光** —— 来自 v1.1.4 上线后的一轮 dogfood，修掉了工具调用渲染、滚动行为和升级器双开闪屏。

### 新增：kitty / iTerm2 / WezTerm 的 pane 级精确通道

tmux 的那套链路 —— hook 抓 pane id → 透过 `TerminalContext` 一路传到 `SessionJumpTarget` → jump 服务和文本注入器各取所需 —— 现在覆盖了三个新终端。

- **WezTerm**：hook wrapper 抓 `$WEZTERM_PANE`。Jump 走 `wezterm cli activate-pane --pane-id <id>`，再补一次 osascript activate 让 WezTerm 本体到最前。Send-message 拆成两次 `wezterm cli send-text`（正文 + 回车，`--no-paste` 让 CLI agent 不把消息当成一整段 bracketed paste）。
- **kitty**：`$KITTY_WINDOW_ID` 现在真的被下游用了（之前 env key 占了位但事件流里没透传）。Jump 走 `kitten @ focus-window --match id:<id>`；send-message 拆成两次 `kitten @ send-text`。需要 `kitty.conf` 里有 `allow_remote_control yes`，没开远程控制时会优雅回退到 activate-app。
- **iTerm2 send-message**：一条更干净的 AppleScript 通道 —— `tell session id "X" to write text "..."`，复用 jump 这边已经抓到的 session id。比 Ghostty 那种 `keystroke` 打到当前最前窗口的兜底干净得多。
- **`canReply` 现在覆盖 {tmux, wezterm, kitty, iTerm2, ghostty} 任一**，不需要 agent 特化逻辑。Codex / Claude / CodeBuddy / Qoder / Qwen / Factory 都能复用同一个终端通道。
- **发送优先级**：tmux > wezterm > kitty > iTerm2 > ghostty。tmux 可以跑在其他任何一种里，多个并存时 tmux pane id 是最精确的锚点。

### 修复：升级器双开导致的 GUI 闪屏

自动更新的 `quitAndInstall`（或者用户在升级期间双击 dock 图标）触发时，Electron 会让第二个 main 进程一路跑到 `app.whenReady → wireIpcHub`，等到这一步才发现 IPC 端口已被占用。用户能看到一个短暂的"已有 CodePal 在运行"对话框、一个幻影 dock 图标、还有一次额外的 GUI 闪烁。现在 single-instance lock 在 app 启动顶端就拿掉了（在 hook-CLI short-circuit 之后，所以 wrapper 子进程不受影响）—— 第二实例静默退出，第一实例收到 `second-instance` 事件并把已有窗口重新聚焦。

### 修复：v1.1.4 dogfood 暴露的主面板抛光问题

- **工具调用 JSON 不再渗透到会话标题**。当 Claude 的 `tool_result` content 是包含 `image` block 的数组（比如截图输出），CodePal 之前会把整段 stringify 当作标题和摘要使用，结果出现一长串 base64 JSON 字符串。现在 normalizer 会抽取 `text` 段、把 `image` 改写为 `[image]` 占位、其它跳过。
- **更友好的 tool_use 标题**。原来只显示孤零零的 `Bash` / `Read` / `Edit` / `WebFetch`，现在分别渲染为 `Bash: <cmd>` / `Read: <basename>` / `WebFetch: <url>`（截到 80 字符）。识别不了的输入形态退化到光的工具名。
- **设置抽屉滚动修复**。`.app-settings-drawer__content` 缺 `flex: 1`，导致内层 `.settings-section-shell` 的 `overflow-y: auto` 实际上从来没生效 —— 在小窗口下，CodeBuddy 内网版的「重新登录 / 删除登录态」按钮直接看不见也滚不到。现在 flex 链路修好了。
- **活动流高度上限**从 `min(52vh, 420px)` 提到 `min(72vh, 640px)`。长的 assistant 输出不再被压在一个小盒子里反复滚。
- **`session-row__history-peek` "加载更多" 提示** 从 `aria-hidden="true"` 改成 `role="status"` —— 之前对屏幕阅读器完全沉默。

### 修复：notarization wrapper + 公证票据 staple

- `release:mac` 现在会主动 source `.release.env` 和 `~/.zshrc`，确保 `APPLE_ID` / `APPLE_APP_SPECIFIC_PASSWORD` / `APPLE_TEAM_ID` 出现在 electron-builder 的环境里。之前 npm 脚本跑在非 zsh shell 下，凭据悄悄丢失，dmg 没 staple，Gatekeeper 把下载的安装包标记为"已损坏"。
- afterAllArtifactBuild 现在会对 `.app` 和 `.dmg` 都跑 `xcrun stapler staple`。

### CI / E2E 整顿

CI 上有 5 条 Electron E2E 一直挂着；之前看上去绿是因为它们没在 CI 跑全。现在 5 条都稳定，整套套件本地 ~30s、CI ~2m（之前是 ~3.5m + 5 条失败）。完整诊断见 PR #6，挑几个亮点：

- `sendStatusChange` 测试 helper 不再为每个事件 spawn 一整个 Electron 子进程 —— 改成同进程直接 TCP 写入 hub。action-response 套件从分钟级压到秒级。
- `launchCodePal` 默认带一个临时隔离 HOME，避免本机累积的几十 MB `history.sqlite` 把 renderer 启动顶过 heading-visible 超时。
- 两条 PreToolUse e2e 还在测 v1.1.3 之前那套已经被移除的 blocking 协议；重写为锁定 v1.1.3 的"原生流程"契约。
- pending lifecycle 过期测试改为用 `pendingLifetimeMs` 真正驱动 sweep，而不是错误地依赖 action-response 传输层 timeout。

### 验证

- `npm test`（75 files, 700 tests）
- `npm run lint`
- `npm run test:e2e`（15 tests，本地 ~30s / CI ~2m）
- `npm run dist:mac` 带 notarization → 已 staple 的 `.dmg` + `.zip` + blockmap + `latest-mac.yml`
