# Roadmap Next

## 文档目的

这份文档记录 v1.1.11 已发基线之后的产品方向。

它不是按日期排死的承诺清单，而是帮助后续判断：先做什么、为什么、顺序应该怎样。

## 当前基线

CodePal 现在已经不是单一的悬浮 session 列表。当前已发基线包括：

- Cursor、Claude Code、Codex、CodeBuddy，以及通过共享 CodeBuddy JetBrains 路径接入的 GoLand / PyCharm 统一监控
- 本地 session history 和按需展开的完整 timeline
- token usage analytics、历史 backfill、估算费用和 HTML reports
- macOS 原生通知、click-to-navigate、按终端能力门控的消息投递
- integration diagnostics、本地 repair、以及面向支持客户端的 Provider Gateway 设置
- 已签名 / 已公证 macOS 打包，以及 updater metadata 校验

下一阶段应该基于这些本地数据资产继续往上做，而不是过早回到泛控制台或跨 agent 拦截层。

## 规划原则

CodePal 下一阶段应该成为重度 AI coding 用户的本地工作记忆层。

也就是说：

- 保持 monitoring-first 的可信边界
- 把现有 session、usage、timeline 数据提升成“事后看得懂”的工作理解
- 衡量 workflow health 和工具摩擦，而不是给开发者打生产力分
- 在 team、billing、cloud sync 或更大控制面之前，先验证个人用户持续价值

研究来源：`docs/planning/research/deep-research-report.md`。

## Track 1: 个人 AI 工作记忆

这是下一阶段最值得先做的产品层。

目标：让 CodePal 不只在 agent 运行中有用，也能在工作结束后帮助用户看懂到底发生了什么。

近期能力：

- session review 页面：总结持续时间、主要阶段、等待 / 错误区间、模型使用、token / 成本、最终状态
- daily digest：跨 agent 展示今天跑了什么、完成了什么、卡在哪里、用量集中在哪、哪些 session 需要跟进
- 可导出的本地 HTML / Markdown 报告，并提供 prompts、路径、assistant 内容的脱敏选项
- 当 source path 可信时，按项目 / repository 分组并提供更可读的 session 标题
- 本地 retention 控制继续区分细粒度 activity history 和聚合 analytics

为什么先做：

- 直接复用现有 history SQLite、usage backfill、Analytics page 和 HTML report 基础
- 给用户一个“收工后也会打开 CodePal”的理由
- 比团队 dashboard 或远端 analytics 更符合当前本地隐私契约

## Track 2: Workflow Health

CodePal 可以进入流程质量诊断，但不要变成 bossware 或绩效打分工具。

优先信号：

- 等待时长：session 停在 waiting / idle gap 的时间
- 异常恢复：session 出错后是否恢复或完成
- session churn：重复 abort、restart、compact，或大量 subexecution 的运行
- 上下文压力：当上游有信号时，识别 context compaction、模型切换或大 token run
- 配额压力：本地用量、估算费用、last-known rate-limit snapshot
- 观测覆盖率：哪些工作 CodePal 能确信看见，哪些只是推断或可能漏掉

设计规则：

- 把这些叫作个人 workflow-health 信号
- 避免排行榜、个人生产力评分或团队绩效语言
- 区分 estimated、backfilled、inferred、real-time 数据

## Track 3: 观测可信度

在继续扩更多 agent 或平台之前，先把“这些数据有多可信”变成用户可见的一等对象。

近期工作：

- 标明 integration 是 live、backfilled、estimated、degraded 还是 unsupported
- 在 diagnostics 里展示事件投递可靠性和近期 ingestion gap
- 明确 terminal delivery 能力：tmux、WezTerm、kitty、iTerm2、Ghostty 支持；Terminal.app 和 Warp 仍不属于可靠消息投递范围
- 未知 upstream payload 继续进入 adapter calibration，不要在 renderer 里临时猜
- Provider Gateway quota 保持诚实：MiMo 没有稳定官方 quota API 前，仍然只做 dashboard/manual 边界

## Track 4: Ambient Presence

Ambient UI 应该是价值层的压缩，不是价值层的替代。

Dynamic Island / menu bar / mini presence 等形态，应该排在 session review 和 workflow-health 价值被验证之后。

适合 ambient 的信息：

- glanceable running / waiting 状态
- quota 或 rate-limit 压力
- 结束后仍需要跟进的 session
- degraded integration 状态

避免：

- 还没决定高频信号之前先做装饰性表面
- 把 approval interception 重新搬回 CodePal

## Track 5: 个人优先的付费价值

付费层应该先从个人本地价值开始。

潜在 Pro 方向：

- 更长的本地历史保留和更丰富的 analytics 范围
- 高级 session review 和 day digest
- 脱敏报告导出
- 按项目 / repository 聚合
- 更细的观测可信度诊断
- 可配置的 workflow-health 阈值和提醒

不要先做 billing 实现。先验证用户是否会长期打开 CodePal，并是否会回到 review / digest 表面。

## Track 6: 团队层后置，并重写信任模型

团队功能是后续阶段，不是下一步。

如果推进，团队第一层也应该是共享运营可见性，而不是个人生产力评分：

- 共享 degraded integration 或 quota-pressure 感知
- opt-in 的脱敏 session 摘要
- 没有个人排行榜的聚合 workflow-health 趋势
- summary 与内容级别的权限边界

team / cloud 工作在 release-ready 之前必须先更新 privacy 和 support 文档：

- 共享什么
- 谁能读
- 是否包含 prompts、路径、代码片段或 assistant 输出
- 数据存在哪里
- 如何脱敏、如何退出

## 明确后置

- freeform `text_input`
- 重新让 CodePal 成为 Claude approval 中间层
- JetBrains workspace activation 保证
- 给个人开发者打分的团队 dashboard
- 没有新隐私模型的 cloud sync 或 remote analytics
- 在 macOS 交互模型和发布链路长期稳定之前做 Windows 支持

## 决策顺序

如果规划精力有限，按这个顺序做：

1. 设计并验证 session review
2. 加 daily digest 和本地报告导出
3. 加 workflow-health 信号和观测可信度标签
4. 判断个人 Pro 价值是否足够定价
5. 再回头评估 ambient surface、team sharing、cloud sync、更大控制面和新平台
