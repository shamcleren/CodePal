# Cursor 审批能力集成设计

**日期**: 2026-04-15  
**范围**: Cursor Agent 的待审批操作在 CodePal 中的完整 UI 及交互  
**阶段**: v1.1.0

---

## 背景

Cursor 通过 hook 机制向 CodePal 发送 `pendingAction`（含 `responseTarget`），CodePal 的
sessionStore、IPC 路径和审批卡片 UI 代码已基本完整，但审批 UI 被 `showExperimentalControls = false`
开关挡住，且缺少：

- 发送结果反馈（loading / success / error / retry）
- 多条审批的批量操作
- 有新审批时的主动通知
- 新审批到来时自动展开会话行

本设计在现有基础上增量实现上述能力，不引入新的架构层。

---

## 目标

1. Cursor 发出待审批操作时，用户在 CodePal 内即可完成审批，无需切换回 Cursor
2. 审批结果（成功/失败）有明确反馈，失败可重试
3. 多条审批支持批量允许/拒绝
4. 有新审批时通过 macOS 系统通知主动告知用户

**不在本期范围内**: Claude Code、Codex、CodeBuddy、JetBrains 的审批支持（后续迭代）

---

## 架构

### 新增 IPC 通道：`codepal:action-response-result`

方向：main → renderer（单向，通过已有的 BrowserWindow `webContents.send`）

```typescript
type ActionResponseResult = {
  sessionId: string;
  actionId: string;
  result: "success" | "error";
  error?: string;        // 失败时的错误信息
  option: string;        // 用户选择的选项
};
```

`dispatchActionResponse` 在 socket 发送完成/失败后，通过此通道把结果推回 renderer，
renderer 据此切换卡片状态。

### 数据流

```
Cursor hook
  → hookIngress → normalizeCursorEvent（已有）
  → sessionStore.applyEvent（已有，存 pendingById）
  → broadcastSessions（已有）

renderer 收到 sessions 广播
  → SessionRow: pendingCount 0→N 时 setExpanded(true)（新增）
  → SessionHistoryTimeline: 渲染审批卡片（去掉 showExperimentalControls 门控）

notificationService（新增触发条件）
  → 检测 pendingCount 从 0 变为 N 时
  → 发 macOS 通知，activationPayload 携带 sessionId
  → 点击通知 → 已有 focus-session IPC → 窗口置前 + 展开对应会话

用户点击允许/拒绝
  → renderer: ipcRenderer.send("codepal:action-response", payload)（已有）
  → dispatchActionResponse（已有 + 新增：发送后 emit action-response-result）
  → socket 发给 Cursor（已有）

收到 action-response-result
  → success: 卡片短暂显示确认态，1s 后移除
  → error: 卡片显示错误信息 + 重试/放弃按钮
```

---

## 组件设计

### SessionRow.tsx

新增自动展开逻辑：

```typescript
const prevPendingCount = useRef(session.pendingCount ?? 0);

useEffect(() => {
  if ((session.pendingCount ?? 0) > 0 && prevPendingCount.current === 0) {
    setExpanded(true);
  }
  prevPendingCount.current = session.pendingCount ?? 0;
}, [session.pendingCount]);
```

手动折叠后不再强制重新展开（只在 0→N 时触发一次）。

### SessionHistoryTimeline.tsx

**去除门控**：移除 `showExperimentalControls` 相关逻辑，审批区块始终渲染。

**卡片内部状态**（新增，per-actionId）：

```typescript
type ActionCardState = "pending" | "sending" | "success" | "error";

// key: actionId
const [cardStates, setCardStates] = useState<Record<string, ActionCardState>>({});
const [cardErrors, setCardErrors] = useState<Record<string, string>>({});
```

**状态转换**：
- 用户点击 → `sending`，同时禁用两个按钮防重复提交
- 收到 `action-response-result` success → `success`，1000ms 后 `closed`（从 Map 删除）
- 收到 `action-response-result` error → `error`，展示错误文字
- 点击重试 → 重新 `sending`，复用同一 actionId 发送

**Allow All / Deny All 横幅**：当 `pendingActions.length > 1` 时，在卡片列表顶部显示横幅：

```
3 条待审批    [✓✓ 全部允许]  [✗✗ 全部拒绝]
```

批量操作：顺序触发各 actionId 的 `respondToPendingAction`，各自走独立状态机。

### notificationService.ts

在现有通知触发逻辑中增加 pending action 触发场景：

```typescript
// 新增触发条件（在 processDiff 或等效逻辑中）
if (prev.pendingCount === 0 && next.pendingCount > 0) {
  const count = next.pendingCount;
  fireNotification({
    title: `${agentLabel(next.tool)} · ${next.title ?? "未知会话"}`,
    body: count === 1
      ? "需要你的审批"
      : `${count} 条操作需要你的审批`,
    activationPayload: { type: "focus-session", sessionId: next.id },
  });
}
```

防抖：相同 sessionId 的 pending 通知合并（debounce 300ms），避免 Cursor 连发多条审批时轰炸。

---

## 改动文件清单

| 文件 | 改动 |
|------|------|
| `src/main/actionResponse/dispatchActionResponse.ts` | 发送完成/失败后 emit `codepal:action-response-result` |
| `src/main/main.ts` | 注册 `codepal:action-response-result` 向 renderer 转发 |
| `src/main/preload/index.ts` | 暴露 `onActionResponseResult(cb)` 给 renderer |
| `src/main/notification/notificationService.ts` | 增加 pending action 触发条件 |
| `src/renderer/components/SessionRow.tsx` | pendingCount 0→N 时自动展开 |
| `src/renderer/components/SessionHistoryTimeline.tsx` | 去门控，加 cardStates，Allow All / Deny All 横幅 |
| `src/renderer/styles.css` | 审批卡片各状态样式（sending 动画、error 红框、success 绿条）|

---

## 错误处理

| 场景 | 处理方式 |
|------|---------|
| socket 连接超时（默认 25s） | error 态，显示"连接超时"，可重试 |
| socket 连接被拒 | error 态，显示"无法连接到 Cursor"，可重试 |
| action 已过期/被 agent 关闭 | sessionStore 移除后广播，卡片自然消失 |
| 批量操作中部分失败 | 每张卡片独立状态，失败的单独显示 error |
| renderer 重连时 in-flight 状态丢失 | 重置为 pending（保守策略，用户可重新点击）|

---

## 测试策略

**单元测试**（新增/修改）：
- `dispatchActionResponse.test.ts`：验证成功/失败时 emit 正确的 result 事件
- `notificationService.test.ts`：验证 pendingCount 0→N 触发通知，N→0 不触发，同 sessionId 防抖合并
- `SessionRow.test.tsx`：验证 pendingCount 0→N 时自动展开，手动折叠后不再强制展开
- `SessionHistoryTimeline.test.ts`：验证 sending/success/error/retry 状态机转换

**E2E 测试**（扩展现有 `codepal-action-response.e2e.ts`）：
- 验证点击允许后卡片经历 sending → success → 消失
- 验证 socket 超时时卡片进入 error 态并可重试
- 验证多条审批时 Allow All 横幅出现，批量操作后全部消失

---

## 验收标准

1. Cursor 发出 pendingAction 时，CodePal 弹出 macOS 通知
2. 点击通知，CodePal 窗口置前并展开对应会话，审批卡片可见
3. 点击「允许」后卡片显示 loading，成功后 1s 消失
4. 失败时显示错误信息，点击重试可再次发送
5. 多条审批时显示「全部允许/拒绝」横幅，批量操作全部生效
6. 所有新增逻辑有对应单元测试覆盖
