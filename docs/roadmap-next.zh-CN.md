# Roadmap Next

## 文档目的

这份文档记录的是当前 V1 发布基线之后的近期和中期产品方向。

它不是按日期排死的承诺清单。

它的作用是帮助后续做优先级判断：先做什么、为什么、顺序应该怎样。

## 规划原则

CodePal 仍然应该先继续夯实 monitoring-first 基线，再考虑往更强的控制层或收费层扩展。

也就是说：

- 先把当前监控体验做深做稳
- 在扩大分发前，先补发布与安装体验
- 在做收费实现前，先验证持续用户价值

## v1.1.0 功能 — 已全部交付

v1.1.0 的五个功能已全部交付。以下为各功能的交付状态。

### 1. macOS 通知与声音 — 已交付（v1.1.0）

原生 macOS 通知和可选声音提示，覆盖：session 完成、等待决策、报错、长时间空闲后恢复。设置中可按状态开关，30 秒防抖避免重复通知。通知服务作为 `sessionStore` 回调接入，所有事件路径自动获得通知能力。

### 2. ~~Allow（审批扩展）~~ — 已放弃（v1.1.3）

CodePal 移除了 Claude PreToolUse 阻塞 hook，回归纯 dashboard 定位。审批流程由各 agent 自身的 CLI 负责，CodePal 不做审批中间人。

残留的 `actionResponse/` 代码仅保留给 Cursor 被动观察，不应继续扩展。

### 3. Send Message（CodePal → Agent 发消息）— 已交付（v1.1.1，v1.1.5 扩展）

按终端能力门控的消息投递。`canReply(session)` 在 tmux、WezTerm、kitty、iTerm2、Ghostty 下返回 true；其他环境隐藏输入框。发送优先级：tmux > WezTerm > kitty > iTerm2 > Ghostty。这不是自由文本 `text_input`，范围限于向已知终端面板投递结构化消息。

### 4. 点击跳转（IDE / 终端导航）— 已交付（v1.1.1，v1.1.5 扩展）

按终端精确分派的焦点跳转。tmux: `switch-client` + `select-window`。iTerm2: AppleScript 按 session id。Terminal.app: AppleScript 按 tty。Ghostty: AppleScript activate。WezTerm: `wezterm cli activate-pane`。kitty: `kitten @ focus-window`。`open -a` 作为最终 fallback。JetBrains IDE 工作区激活明确不在支持范围内 — JetBrains session 通过共享 CodeBuddy 插件 watcher 监控，但 CodePal 不尝试聚焦 JetBrains 窗口。

### 5. Session Restore on App Update — 已交付（v1.1.0）

启动时从 SQLite 历史恢复最近 24 小时内的用户 session（上限 150 个）。`running` / `waiting` 状态标准化为 `idle`。实时 hook 事件始终优先于恢复状态。

## 接下来

v1.1.0–v1.1.10 已全部交付，近期监控工作已收尾。

### 监控深度 — 已完成（v1.1.10+）

- Claude statusLine 丰富：model id 已捕获到 quota 诊断中
- Codex 生命周期 timeline 噪音已过滤（Working、Context compacted、Turn aborted）
- 用量状态栏显示基于 model pricing 的估算费用
- 后续监控改进遇到再做，不再提前规划

## 潜在 Team / Pro 功能

收费功能应该在 CodePal 已经证明自己具备持续使用价值之后再考虑，而不是现在就急着实现。

当前更应该先验证：

- 用户是否真的会长期把应用开着
- 用户最依赖哪些监控信号
- 最强价值到底更偏个人可见性、团队可见性，还是运营控制

### 可能的免费层基础

- 核心 session 监控
- 基础 timeline 可见性
- 基础 quota / usage 可见性
- 受支持的本地 integration 修复

### 可能的 Pro / Team 方向

- 更丰富的历史 usage / quota 分析
- 更强的 observability 与可靠性视图
- 更广泛的 agent / IDE 覆盖
- 团队共享视图
- 更强的审批和 control-loop workflow
- 更高级的诊断和自动化

这些都只是方向候选，不是已经确定的 SKU。

## 更长期的扩展方向

这些方向现在值得先记下来，但仍然应该明确排在验证持续用户价值之后。

### 灵动岛 / Ambient Surface

未来一个可能方向，是在主悬浮面板之外，再做一个更轻量的 macOS 状态入口。

它可能适合承载：

- glanceable 的 running / waiting 状态
- quota 压力提示
- pending approval 提醒
- 在主面板收起时仍然保留轻量存在感

这应该被看作产品形态扩展，而不只是一个视觉小改动。

它会影响：

- 信息密度
- 通知行为
- 交互入口
- 哪些状态适合 ambient 展示，哪些状态仍应保留在完整面板

### Windows 适配

Windows 支持也是一个明确值得记录的未来方向，但它应该排在 macOS 形态成熟之后，而不是反过来抢优先级。

它的价值很清楚：

- 扩大开发者覆盖面
- 提高多 IDE 场景下的采用机会
- 降低对单一平台发布路径的依赖

但它也意味着一整套平台工作，包括：

- 打包与分发
- 系统托盘 / 窗口行为
- 本地配置路径
- hook 安装与修复流程
- 平台相关的文件系统和权限差异

更合理的姿态是：

- 把 Windows 记为真实的扩展路径
- 在 macOS 交互模型和发布链路更稳定之前，不对它做过早承诺

## 不应该过早推进的事情

这些事情虽然诱人，但不应该跳到当前基线工作前面：

- 在监控可靠性还没成熟前，强推完整跨 agent 控制
- JetBrains IDE 工作区激活 — JetBrains session 通过共享 CodeBuddy 插件 watcher 监控，但 CodePal 不尝试聚焦 JetBrains 窗口
- 在用户留存价值还没验证前，先上 billing
- 在 README 或 release 文案里堆太多投机式路线图承诺

## 决策顺序

如果规划精力有限，推荐的决策顺序是：

1. 验证持续使用模式
2. 基于真实使用证据设计 paid / team 扩展
