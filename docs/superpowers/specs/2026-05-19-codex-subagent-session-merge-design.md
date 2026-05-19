# Codex 子执行会话归并设计

**日期**: 2026-05-19  
**范围**: Codex session-log 监控、主列表 session 摘要、子执行 activity 展示  
**阶段**: v1.1.x dashboard polish

---

## 背景

CodePal 的主列表是用户的注意力入口。它应该展示“用户正在推进的会话”，而不是把 agent 内部的工具执行、sandbox 执行、guardian/subagent 检查当成并列会话。

真实 Codex 日志里会出现两类容易分散注意力的信号：

1. `response_item.function_call_output` 输出类似 `Chunk ID: ccc62d...`，它本质是工具调用结果。
2. Codex 会为 guardian / sandbox / subagent 类工作写独立 session log，`session_meta.payload.thread_source` 可能是 `subagent`，`session_meta.payload.source` 也可能是 `{ "subagent": { "other": "guardian" } }`。

当前代码已经有 Codex subagent 合并雏形，但主列表仍可能把 `Chunk ID` 工具输出提升成整行标题或摘要；当子执行日志缺少被识别的 parent 关系时，也会以独立 session 出现在列表中。

---

## 目标

1. Codex guardian / sandbox / subagent 这类内部执行默认归并到同一工作目录、相近时间窗口内的主干 user session。
2. 工具调用输出保留在展开 timeline / activity 中，但不抢占主列表的会话标题。
3. 主列表标题优先表达用户意图：最近用户消息 > 稳定标题 > 有意义的 assistant 摘要 > 回退标题。
4. 保持 Phase 1 的 dashboard-first 边界，不引入完整多层 sub-agent 控制台。
5. 用真实 Codex 日志形状补 fixture / unit tests，防止回归。

---

## 非目标

- 不做完整 `sub_agent` 树状 UI。
- 不新增自由文本 `text_input`。
- 不改变 Codex 原生日志结构，也不要求 Codex 提供显式 parent session id。
- 不把所有工具输出隐藏；展开详情仍应可看到工具调用和结果。

---

## 语义决策

### Session

主列表 session 表示用户可感知的一轮工作上下文。Codex `thread_source: "user"` 的 session 是主干 session。

### Subexecution

`thread_source: "subagent"` 或 `source.subagent` 存在时，视为 subexecution。它默认不是主列表的一等 session，而是父 session 的 activity。

### Tool Output

`response_item.function_call_output` 是工具结果。它可以影响 session `updatedAt`，可以进入 expanded timeline，但不应该成为主标题。它也不应该在缺少用户消息时直接把整行变成 `Chunk ID...`。

---

## 设计

### 1. Codex adapter 归一化 subexecution meta

`normalizeCodexLogEvent` 在 `session_meta` 上输出更明确的 meta：

- `codex_thread_source`: 来自 `payload.thread_source`
- `codex_subagent_kind`: 来自 `payload.source.subagent.other`
- `source`: 保留现有 `subagent:<kind>` 或普通 source 字符串
- `cwd`: 保留工作目录

判定 subexecution 时接受任一条件：

- `codex_thread_source === "subagent"`
- `codex_subagent_kind` 存在
- `source` 以 `subagent:` 开头

### 2. SessionStore 继续做轻量父子归并

复用当前 `resolveSessionTarget` 的思路：

- subexecution event 到来时，用 `cwd + 时间窗口` 查找最近的同 tool Codex user session。
- 找到则写入父 session，不新增独立 session。
- 没找到则暂存为自己的 session，避免丢事件。
- 后续 user session 到来时，可吸收同 `cwd + 时间窗口` 内已有的 subexecution-only session。

归并时间窗沿用当前 `CODEX_SUBAGENT_MERGE_WINDOW_MS = 30min`。这是保守折中：足够覆盖同一轮 agent 内部执行，又不会跨太久把不同工作混在一起。

### 3. Activity 展示保留工具信息

工具调用和结果仍作为 `ActivityItem.kind === "tool"` 保留：

- `toolPhase: "call"` 展示工具名和参数。
- `toolPhase: "result"` 展示结果正文。
- 如结果正文以 `Chunk ID:` 开头，仍可在展开详情中看到。

后续若需要更细，可以在 `ActivityItem.meta` 中标记 `subexecutionSessionId` / `subagentKind`，但本轮不需要新增 shared 类型字段。

### 4. 主列表标题和摘要避免工具结果抢焦点

主列表 row 的规则调整为：

- `titleLabel` 不使用 tool result body 作为优先回退。
- `collapsedSummary` 优先 assistant message；只有没有更好的 message / pending / approval 时，才用 tool result。
- 对 `Chunk ID: ... Wall time ... Process exited ... Original token count ... Output:` 这类 Codex shell result，主列表摘要应压缩成工具名或短标签，例如 `exec_command completed`，而不是展示长输出。
- `hoverSummary` 可以使用工具结果摘要，但仍应短，避免主列表宽度被日志格式污染。

这让用户在列表里看到“这轮用户任务”，展开后再看工具执行细节。

---

## 错误处理

| 场景 | 处理 |
|------|------|
| subexecution 没有 `cwd` | 不做归并，按原 session 保留，避免误合并 |
| 找不到父 user session | 暂存为独立 session，后续 user session 可吸收 |
| 多个父候选 | 选同 `cwd`、同 tool、时间最接近且最近更新的 user session |
| 子执行晚到且父 session 已完成 | 仍允许时间窗内归并，并更新父 session activity |
| 工具输出很长 | 展开详情保留，主列表只显示短摘要 |

---

## 测试策略

### Adapter tests

- `session_meta` 带 `thread_source: "subagent"` 时输出 `codex_thread_source`。
- `session_meta` 带 `source.subagent.other: "guardian"` 时输出 `codex_subagent_kind` 和 `source: "subagent:guardian"`。
- `function_call_output` 中 `Chunk ID` 输出仍归一化为 tool result activity。

### Session store tests

- subexecution event 在同 `cwd`、时间窗内归并到已有 user session。
- user session 后到时吸收已有 subexecution-only session。
- 不同 `cwd` 或超出时间窗时不归并。
- `source.subagent` 形状与 `thread_source: "subagent"` 形状都能触发归并。

### Renderer row tests

- Codex session 同时包含 user message 和 `Chunk ID` tool result 时，`titleLabel` 使用 user message。
- `collapsedSummary` 不直接展示 `Chunk ID: ...` 长输出。
- 展开 timeline 仍保留 tool result 正文。

---

## 验收标准

1. 截图中的 `Chunk ID: ccc62d...` 不再作为主列表的一条醒目会话标题出现。
2. 同一 CodePal 工作目录里的 Codex guardian / sandbox / subagent 执行归并到主干 session。
3. 展开主 session 后仍能看到相关工具调用和输出。
4. 主列表排序仍按用户会话意图稳定，不因内部工具结果反复跳成日志摘要。
5. `npm test -- src/adapters/codex/normalizeCodexLogEvent.test.ts src/main/session/sessionStore.test.ts src/renderer/sessionRows.test.ts` 通过。

---

## 实施边界

本设计是 Phase 1 的最小修复。它解决“内部执行分散注意力”的展示问题，但不定义完整 sub-agent 产品能力。

完整 sub-agent 模型可在后续设计中独立展开，届时再考虑：

- parent / child session 显式数据结构
- 子 agent 展开树
- 子 agent 状态聚合
- 子 agent 成本和耗时归因
- 用户是否能单独关注或过滤某个子 agent
