## CodePal v1.1.4

两条主线：把 Claude Code 的三个衍生 agent（Qoder / Qwen / Factory）接入 CodePal 的观测面板；修掉主界面两处长期不爽的体验问题。

### 新增：Qoder / Qwen / Factory（Claude Code 衍生 agent）

作为 CC fork，它们与 Claude Code 共用同一套 hook 协议，CodePal 仅做配置路径与事件 tag 上的适配：

- **按 agent 注入 hook**：检测到用户本地存在 `~/.qoder` / `~/.qwen` / `~/.factory` 目录时，才会自动在对应 `settings.json` 写入 hook，避免为没装过这些 CLI 的用户凭空创建配置。
- **事件隔离**：每个 agent 的 activity id、approval title、notification type、project-dir 回退环境变量（`QODER_PROJECT_DIR` 等）都按 tag 区分，面板里三家不会互相覆盖。
- **与 Claude 的差异**：衍生 agent 不写 `statusLine` 块，也不依赖 `statusLineWrapper`（节流/状态线功能按需单独做）。
- **显示偏好**：`Display › Agents` 里新增三个独立开关，默认显示，可单独关闭。

### 改进：主界面会话体验

- **滚轮加载历史无感化**。移除 220ms 人为可见下限与两段式 buffered-page 切换，prefetch 返回即原地 append，同时在 setState 之前抓取滚动锚点并在下一次 commit 里还原 —— 上滑翻旧消息过程中视窗不再被往下顶，也不会出现"数据已拿到但不显示"的停顿。
- **打开会话定位到最新**。新增 `ResizeObserver` 监听 details 容器，只要 `shouldStickToBottomRef` 还处于贴底状态，就在内容高度每次增长时把 `scrollTop` 重新对齐到 `scrollHeight`。这样哪怕 `HoverDetails` 因为测量节点高度、字体延迟加载等原因在 paint 之后继续扩张，最新消息也不会再被挤出视口。

### 验证

- `npm test`（75 files, 685 tests）
- `npm run lint`
- 集成测试新增 `integrationService.test.ts` 中三家 fork agent 的 install / inspect / idempotency 覆盖
