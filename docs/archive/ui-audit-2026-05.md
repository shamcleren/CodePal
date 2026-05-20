# UI Audit — 2026-05-08

CodePal 前端 UI 全面审查。覆盖主视窗（App、SessionList、SessionRow、StatusBar、HoverDetails、SessionHistoryTimeline、SessionMessageInput）和设置面板（所有 Preferences/Settings 组件），从结构、交互、可访问性三个维度提出改进项。

每项标注优先级：**Phase 1** = 立即处理，**Phase 2** = 下一小轮，**暂缓** = 不建议现在做。

---

## 主视窗

### 1. Empty state 过于简陋 [P2 → Phase 2]

**位置**: `App.tsx:861-865`

当前空会话时只显示一行半透明文字。作为 dashboard 应用，首次打开或所有 agent 离线时，应引导用户检查集成状态。

**改动**: 展示集成健康概览卡片，附带 "Go to Settings > Integrations" 链接。

---

### 2. Session row 展开后无法 Escape 收起 [Phase 1]

**位置**: `SessionList.tsx`、`App.tsx`

只有 `toggleExpanded` 点击交互，没有键盘 Escape 收起当前展开的 session。展开状态下看 timeline 时，必须精确点击 row header 才能收起。

**改动**: 在 `SessionList` 或 `App` 层监听 Escape 键，收起当前 expanded session（与 settings drawer 的 Escape 处理一致）。

---

### 3. Backgrounded row 的 opacity 过重 [Phase 2]

**位置**: `styles.css:1124-1127`

`.session-row--backgrounded` 设了 `opacity: 0.56` + `scale(0.988)`。只有 2 个 session 时，非活跃的那个几乎不可读。

**改动**: opacity 提到 0.72-0.78，去掉 scale 变换。

---

### 4. Running session pulse 动画持续消耗 GPU [Phase 2]

**位置**: `styles.css:1048-1049`

running 状态有 3.6s box-shadow pulse + 4.8s sheen opacity 双动画同时运行。3-4 个 running session 时 6-8 个 CSS 动画在后台持续跑。

**改动**:
- 添加 `@media (prefers-reduced-motion: reduce)` 禁用动画
- 把 pulse 频率降到 6-8s

---

### 5. Session message input 发送后没有视觉反馈 [Phase 1]

**位置**: `SessionMessageInput.tsx:55-61`

`handleSubmit` 调用 `onSend` 后直接清空 input，没有发送中状态。用户不知道消息是否发出，直到 3 秒后 error 才出现。

**改动**: 发送后 input 暂时 disabled + 显示 "Sending..."，直到 `onSendMessageResult` 回调。

---

### 6. Pending action "Allow All" / "Deny All" 没有确认 [Phase 1]

**位置**: `SessionHistoryTimeline.tsx:976-1003`

批量操作直接遍历所有 pending actions 逐个发送，没有二次确认。对 approval 类型（"Allow" = 执行文件操作），误触 "Allow All" 后果不可逆。

**改动**: 对 approval 类型的批量操作加确认步骤（至少一个 "Are you sure?" popover）。single_choice / multi_choice 类型可以不加。

---

### 7. External approval card "Go to tool" 无失败反馈 [P1 → Phase 1]

**位置**: `SessionHistoryTimeline.tsx:1089-1094`

点击后调用 `jumpToSessionTarget`，失败只 `console.warn`，UI 无任何提示。

**改动**: 失败时在 card 上显示 inline 错误提示。

---

### 8. Session list 没有分组或排序控制 [暂缓]

所有 session 按 hook 到达顺序平铺。多种状态混杂时，用户需要扫描整个列表才能找到需要关注的 session。

**改动**: 提供按状态分组（active / waiting / completed）或排序（running > waiting > idle > completed）的选项。可以放在 SessionList header 区域。

---

### 9. Copy summary 的反馈太隐蔽 [Phase 2]

**位置**: `SessionHistoryTimeline.tsx:860-866`

复制成功后按钮文字短暂变成 "Copied"，如果用户焦点不在 footer 区域会错过。

**改动**: 用 toast 通知或 tooltip 代替内联文字变化。

---

### 10. SessionList header "Sessions" 无信息增量 [Phase 2]

**位置**: `SessionList.tsx:100`

写死 "Sessions" 文案，未使用 i18n，且只有一个 list 时不提供额外信息。

**改动**: 移除，或改为动态 session count（如 "3 active, 1 waiting"）。

---

### 11. UsageStatusStrip 纯数字缺乏视觉化 [Phase 2]

**位置**: `UsageStatusStrip.tsx`

status bar 展示每个 agent 配额百分比，但 4 个 agent 同时出现时辨识度低。

**改动**:
- 考虑用微型进度条替代纯百分比
- 或对低配额（<20%）做高亮预警

---

## 设置面板

### 12. Settings drawer 缺少 focus trap 和 aria 语义 [Phase 1]

**位置**: `App.tsx:879-909`

drawer 是 `aside` 元素，没有 `role="dialog"` 或 `aria-modal`。Tab 键可以 focus 到 drawer 后面的元素，screen reader 用户会迷失。关闭时没有 restore focus 到触发按钮。

**改动**:
- 加 `role="dialog"` + `aria-modal="true"`
- 实现 focus trap（tab 循环限制在 drawer 内）
- 关闭时 `triggerButton.focus()`

---

### 13. Overview section 的 status card 不可点击 [Phase 1]

**位置**: `App.tsx:924-948`

Overview 的 4 个 card（Listener、Gateway、Token、Attention）纯展示，点击无反应。用户自然期望点击跳转到对应 section。

**改动**:
- Listener → 跳转 Integrations
- Gateway / Token → 跳转 Provider Gateway
- Attention → 跳转 Integrations
- 加 cursor: pointer + hover 反馈

---

### 14. Provider Gateway token 输入没有显示/隐藏切换 [Phase 1]

**位置**: `ProviderGatewayPanel.tsx:161-167`

token 用 `type="password"`，没有 eye icon 切换可见性。粘贴后无法验证是否正确。

**改动**: 加 toggle 按钮切换 password/text。

---

### 15. Provider Gateway "Configure" / "Activate" / "Restore" 按钮语义不清 [P2 → Phase 2，仅加 tooltip]

**位置**: `ProviderGatewayPanel.tsx:219-248`

按钮有 4 种状态：configure → activate → active → restore。用户不清楚 Configure 和 Activate 的区别，也不清楚 Restore 恢复什么。

**改动**:
- 不合并状态机（当前对应真实配置差异）
- 仅加 tooltip / 更清晰文案说明每个状态的含义

---

### 16. Integration panel refresh 和 agent repair 没有 loading 隔离 [暂缓]

**位置**: `IntegrationPanel.tsx:109-116`

全局 refresh 按钮 disabled 时，单个 agent 的 install/repair 不受影响。但 `refreshIntegrations()` 重置整个 `integrationDiagnostics`，可能导致正在 repair 的 agent 状态闪烁。

**改动**: 全局 refresh 时如果某 agent 正在 installing，跳过该 agent 的状态更新。

---

### 17. History settings number input 没有即时验证 [Phase 2]

**位置**: `HistorySettingsPanel.tsx:127-131`

非法值（"abc"、"-5"）只在 blur 时修正为 fallback。输入过程中无视觉提示。

**改动**: 输入过程中值不在 min/max 范围内时，input border 变红。

---

### 18. Notification preferences 缺少批量操作 [暂缓]

**位置**: `NotificationPreferencesPanel.tsx:62-74`

4 个状态 toggle 在一个 card 里，没有 "全选/全不选"。

**改动**: 加 "Toggle all" 按钮。

---

### 19. Update panel "Skip version" 按钮位置不安全 [Phase 1]

**位置**: `UpdatePanel.tsx:95-104`

Skip 和 Download 并排，Skip 只是 secondary 变体。快速点击时容易误触。

**改动**: Skip 放到 release notes 下方，或用更弱的 link 样式，和 Download 按钮拉开视觉距离。

---

### 20. Settings drawer 关闭后状态不重置 [Phase 1]

**位置**: `App.tsx:553-555`

`closeSettingsDrawer` 只设 `settingsOpen = false`，不清除 feedback/error。下次打开可能看到 stale feedback。

**改动**: 关闭 drawer 时清除各 panel 的 feedback 和 error 状态。

---

### 21. Settings drawer 内容区溢出处理不一致 [暂缓]

**位置**: `styles.css:263-266`

`.settings-content` 设了 `overflow: hidden`，但各 section 内部又各自 `overflow-y: auto`。usage section（4 个 quota panel）和 advanced section（双列布局）内容容易被截断但没有滚动提示。

**改动**: `.settings-content` 改为 `overflow-y: auto`，让整个内容区统一滚动。

---

### 22. Settings nav 窄屏 active 状态不可见 [Phase 2]

**位置**: `styles.css:876-879`

窄屏下 nav 变成 grid，active 状态的蓝色渐变背景在小卡片上几乎不可见。

**改动**: 窄屏 active 状态加左侧或底部高亮条。

---

## 代码结构

### 23. App.tsx 状态爆炸 [降级为技术债]

**位置**: `App.tsx:64-103`

30+ 个 useState 平铺在顶层。Claude/Cursor/CodeBuddy 三套 quota 逻辑几乎完全对称但各写一遍（load/refresh/clear × 3 = 9 个函数）。每加一个 agent 就要复制一套 state + handler。

**改动**: 抽出 `useAgentQuota(agentId)` 自定义 hook，或把 quota/gateway 状态收敛到 useReducer。

---

### 24. SessionMessageInput 样式硬编码 [Phase 1]

**位置**: `styles.css:2417-2482`

send message input 用了 `#0f172a`、`#1e293b`、`#334155`、`#2563eb` 等硬编码颜色，没有用 CSS 变量。与整体 design system 不一致。

**改动**: 统一使用 `var(--bg-elevated)`、`var(--border)`、`var(--accent)` 等变量。

---

## 执行建议

### Phase 1 — 立即处理（一个 PR）

安全性和基础可用性，风险可控，收益明显。

| # | 项目 | 预估 |
|:---:|:---|:---:|
| 6 | 批量 Allow/Deny 确认（仅 approval 类型） | 0.5d |
| 12 | Settings drawer focus trap + dialog 语义 | 0.5d |
| 2 | Escape 收起 session | 0.5d |
| 5 | Message input 发送中反馈 | 0.5d |
| 7 | Go to tool 失败 inline 反馈 | 0.5d |
| 13 | Overview card 可点击跳转 | 0.5d |
| 14 | Token 输入显示/隐藏切换 | 0.5d |
| 19 | Skip version 按钮位置调整 | 0.5d |
| 20 | 关闭 drawer 清除 feedback/error | 0.5d |
| 24 | Message input 样式变量化 | 0.5d |

### Phase 2 — 下一小轮

低风险体感优化，可独立提交。

| # | 项目 | 备注 |
|:---:|:---|:---|
| 1 | Empty state 引导 | 保持简洁，不做大卡片堆 |
| 3 | Backgrounded opacity 调整 | 0.72-0.78，去掉 scale |
| 4 | Running pulse 动画优化 | prefers-reduced-motion + 降频 |
| 15 | Gateway 按钮加 tooltip | 不合并状态机，只补说明文案 |

### 降级 / 暂缓

| # | 项目 | 原因 |
|:---:|:---|:---|
| 8 | 分组/排序控制 | 设计偏向按最近相关性平铺，加排序增加主面板复杂度 |
| 15 | Configure/Activate 合并 | 当前状态机对应真实配置差异，不宜直接合并 |
| 16 | Refresh/repair loading 隔离 | 需先复现闪烁再做，否则过度状态管理 |
| 18 | 通知批量操作 | 便利性小，不急 |
| 21 | Settings overflow 统一 | 测试明确断言 `overflow: hidden`，需先确认布局意图 |
| 23 | App.tsx 状态重构 | 降级为技术债，等新增 agent 时再抽 hook/reducer 更划算 |
