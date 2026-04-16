# 从 CodePal 发消息给 Agent 设计

**日期**: 2026-04-16  
**范围**: 用户在 CodePal 浮动窗口中向运行中的 code agent 发送文本消息  
**阶段**: v1.1.0

---

## 背景

CodePal 当前与 agent 的通信是单向的：agent 通过 hook CLI 将事件推送到 CodePal。唯一的反向通道是审批响应（`dispatchActionResponse`），但该通道是临时的——每次 blocking hook 创建一个短命 socket，响应一次后销毁。

用户希望在 CodePal 中直接给 agent 发送指令（如"继续"、"改用 TypeScript"、"先跑测试"），而无需切回 IDE 或终端。

---

## 目标

1. 用户可以在 CodePal 中向 running/waiting 状态的 agent 发送文本消息
2. 发送后在 timeline 中本地回显用户消息
3. Agent 处于 waiting 状态时，输入框视觉上引导用户注意
4. 无 keep-alive 连接时优雅降级（disabled 状态）

**Agent 优先级**: CodeBuddy → Claude Code → Codex → Cursor

**不在本期范围内**: 多行输入、快捷指令、文件/图片发送

---

## 架构

### 传输机制：IPC Hub keep-alive 双向通道

复用现有 IPC Hub（`createIpcHub`），将 agent 侧 hook CLI 从 fire-and-forget 改为 keep-alive 长连接，使其成为双向通道。

**现有机制**: agent hook CLI 连接 IPC Hub → 发一行 JSON → 断开。

**改造后**: hook CLI 连接后保持长连接，持续发送事件行。IPC Hub 可以通过同一连接回写消息给 agent。

### 数据流

```
用户在 CodePal 输入框输入消息，按 Enter
  → renderer: ipcRenderer.send("codepal:send-message", { sessionId, text })
  → main: 从 IPC Hub 连接注册表查找 session 对应的 keep-alive 连接
  → main: 通过该连接写入 JSON line: { type: "user_message", sessionId, text, timestamp }
  → agent 侧 hook 进程收到消息，注入 agent stdin
  → agent 处理后推新事件到 CodePal（已有流程）

timeline 本地回显:
  → renderer 在发送时立即插入一条本地 UserMessage 到 timeline 底部
  → 如果写入失败，在输入框处显示错误提示（3s 后消失）
```

### 新增 IPC 通道

| 通道 | 方向 | 用途 |
|------|------|------|
| `codepal:send-message` | renderer → main | 发送用户消息到 agent |
| `codepal:send-message-result` | main → renderer | 发送结果反馈（success/error） |

---

## IPC Hub keep-alive 改造

### 连接注册表

`createIpcHub` 新增 per-session 连接注册表：

```typescript
// key: sessionId, value: 活跃的 socket 连接
type InputChannelRegistry = Map<string, net.Socket>;
```

- 当收到一个事件行且解析出 `sessionId` 后，将该连接注册到表中
- 当连接断开时，从表中移除
- 同一 sessionId 的新连接覆盖旧连接

### sendMessageToSession

```typescript
function sendMessageToSession(
  sessionId: string,
  text: string,
): { ok: true } | { ok: false; error: string }
```

查表找到连接，写入一行 JSON。连接不存在或写入失败时返回 error。

### 消息格式（CodePal → agent）

```json
{"type":"user_message","sessionId":"xxx","text":"请用 TypeScript 重写","timestamp":1713225600000}
```

### 连接生命周期

- **建立**: agent hook 首次发送事件时
- **维持**: hook 进程存活期间，持续发送事件行
- **断开**: agent 会话结束 / hook 进程退出 / 网络断开
- **状态同步**: SessionRecord 新增 `hasInputChannel: boolean`，由 IPC Hub 根据连接表状态维护，通过 `broadcastSessions` 推送到 renderer

---

## Agent 侧 Hook CLI 改造

### 通用模式

现有 hook CLI 发完事件即断开。改为：

1. 启动后保持与 IPC Hub 的连接
2. 持续发送事件行（现有行为不变）
3. 同时监听连接上的回写数据
4. 收到 `{"type":"user_message",...}` 后，注入 agent 的 stdin

具体注入方式因 agent 而异，在各 agent 适配任务中定义。

### 适配优先级

1. **CodeBuddy**: 优先适配
2. **Claude Code**: 第二优先
3. **Codex**: 第三优先
4. **Cursor**: 第四优先

---

## 组件设计

### SessionMessageInput（新增组件）

独立组件，渲染在 `SessionHistoryTimeline` 的 timeline 区域底部（footer 之前）。

**显示条件**: `session.status === "running" || session.status === "waiting"`

**UI 规格**:
- 单行 `<input>` + 发送按钮
- Enter 发送，发送后清空输入框
- placeholder:
  - `hasInputChannel && status === "running"` → `"发消息给 {agent}..."`
  - `hasInputChannel && status === "waiting"` → `"Agent 正在等待你的输入..."`
  - `!hasInputChannel` → `"未连接到 {agent}"` + disabled 状态
- waiting 状态时输入框边框使用蓝色（`#2563eb`）+ 呼吸动画
- 发送失败时输入框下方显示红色错误文字，3s 后自动消失

### SessionHistoryTimeline 改动

- 在 pending actions 区域之后、footer 之前渲染 `<SessionMessageInput />`
- 传入 `session`、`onSendMessage` 回调

### 本地回显

- 发送成功后在 timeline 底部插入一条临时条目：
  ```typescript
  { id: nanoid(), kind: "message", source: "user", body: text, timestamp: Date.now() }
  ```
- 存储在组件本地 state（`localUserMessages: ActivityItem[]`），不写入 `persistedItems`
- 当 agent 推来新事件包含相同文本时，去重（复用现有 `sameRenderableHistoryItem` 逻辑）

---

## 改动文件清单

| 文件 | 改动 |
|------|------|
| `src/main/ingress/ipcHub.ts` | 连接注册表 + `sendMessageToSession` + keep-alive 支持 |
| `src/main/session/sessionStore.ts` | `hasInputChannel` 字段维护 |
| `src/main/main.ts` | 注册 `codepal:send-message` IPC handler，转发结果 |
| `src/main/preload/index.ts` | 暴露 `sendMessage` + `onSendMessageResult` |
| `src/renderer/codepal.d.ts` | 新增 API 类型声明 |
| `src/shared/sessionTypes.ts` | SessionRecord 新增 `hasInputChannel` |
| `src/renderer/components/SessionMessageInput.tsx` | 新增输入框组件 |
| `src/renderer/components/SessionHistoryTimeline.tsx` | 集成输入框 + 本地回显 |
| `src/renderer/styles.css` | 输入框样式 + waiting 呼吸动画 |
| `src/renderer/i18n.tsx` | 新增 i18n key |
| `src/main/hook/codebuddyHook.ts` | keep-alive 改造 |
| `src/main/hook/claudeHook.ts` | keep-alive 改造 |
| `src/main/hook/codexHook.ts` | keep-alive 改造 |
| `src/main/hook/cursorHook.ts` | keep-alive 改造 |

---

## 错误处理

| 场景 | 处理方式 |
|------|---------|
| 无 keep-alive 连接 | 输入框 disabled，placeholder 提示"未连接到 {agent}" |
| 连接存在但写入失败 | 返回 error，输入框下方显示错误，3s 消失 |
| 连接断开（agent 退出） | 移除注册表条目，`hasInputChannel` → false，输入框自动切为 disabled |
| 消息发送后 agent 未响应 | 不处理——消息是 fire-and-forget，agent 自行决定如何处理 |
| 多条消息快速发送 | 不限流，逐条写入连接 |

---

## 测试策略

**单元测试**:
- `ipcHub.test.ts`: 连接注册/注销、`sendMessageToSession` 成功/失败/无连接
- `sessionStore.test.ts`: `hasInputChannel` 状态随连接注册/注销变化
- `SessionMessageInput.test.tsx`: 渲染条件、placeholder 切换、发送回调、disabled 状态、错误显示
- `SessionHistoryTimeline.test.ts`: 本地回显插入、去重

**E2E 测试**:
- 模拟 keep-alive 连接建立 → 输入框可用 → 发送消息 → 本地回显出现
- 模拟连接断开 → 输入框切为 disabled

---

## 验收标准

1. 展开一个 running/waiting 状态的会话，底部出现输入框
2. 输入文本按 Enter，消息通过 keep-alive 连接发送到 agent
3. 发送后 timeline 底部立即显示用户消息回显
4. Agent 处于 waiting 状态时，输入框蓝色边框 + 呼吸动画
5. 无 keep-alive 连接时，输入框 disabled 并提示"未连接到 {agent}"
6. 发送失败时显示错误提示，3s 后消失
7. 按 CodeBuddy → Claude Code → Codex → Cursor 顺序完成各 agent 适配
