# Roadmap Next

## 文档目的

这份文档记录 v1.1.11 已发基线之后的产品方向。

它不是按日期排死的承诺清单，而是帮助后续判断：先做什么、为什么、顺序应该怎样。它是一份融合式路线图：原来有价值的方向继续保留，新加入的 session operations / 免费聚集用户策略会融入这些方向，而不是替换它们。

## 当前基线

CodePal 现在已经不是单一的悬浮 session 列表。当前已发基线包括：

- Cursor、Claude Code、Codex、CodeBuddy，以及通过共享 CodeBuddy JetBrains 路径接入的 GoLand / PyCharm 统一监控
- 本地 session history 和按需展开的完整 timeline
- token usage analytics、历史 backfill、估算费用和 HTML reports
- macOS 原生通知、click-to-navigate、按终端能力门控的消息投递
- integration diagnostics、本地 repair、以及面向支持客户端的 Provider Gateway 设置
- 已签名 / 已公证 macOS 打包，以及 updater metadata 校验

下一阶段应该基于这些本地数据资产继续往上做，而不是过早回到泛控制台或跨 agent 拦截层。

## 产品定位

CodePal 应该成为重度 AI coding 用户的免费本地 AI coding control tower 与 operations memory。

CodePal 是：

- 本地 AI 编码工作流观察层
- 跨 agent session control surface
- 个人 AI coding worklog
- agent session operations layer
- workflow-health 诊断工具
- 每日 AI 工作复盘工具
- 免费的重度 AI coding 用户入口和聚集层

CodePal 不是：

- bossware
- 团队绩效分析工具
- approval 拦截器
- Claude Code / Cursor / Codex / CodeBuddy 的替代执行平台
- autonomous agent scheduler
- 伪装成路线图的收费 dashboard

## 规划原则

CodePal 下一阶段应该成为重度 AI coding 用户的本地 AI coding operations memory layer。

也就是说：

- 保持 monitoring-first 的可信边界
- 把现有 session、usage、timeline 数据提升成“事后看得懂”的工作理解
- 衡量 workflow health 和工具摩擦，而不是给开发者打生产力分
- 在所有可能 partial、estimated、inferred、best-effort 的数据上显示观测可信度
- 调度用户注意力，而不是调度 agent 执行
- 在 adapter capability 和 preflight 足够明确时，允许用户显式触发有边界的操作
- 在 team sharing、billing、cloud sync 或更大控制面之前，先验证免费的个人持续价值

研究来源：`docs/planning/research/deep-research-report.md`。

## 免费增长约束

中期和长期规划都不应该被变现牵引。

当前产品决策应该优化：

- 重度 AI coding 用户的日常打开率
- 长期本地信任
- 围绕 session review 和 day digest 的使用习惯
- 用户主动推荐给其他开发者
- 社区贡献 adapter、template、schema 和 troubleshooting knowledge

不要把下一阶段路线设计成 Pro / Team / Enterprise 打包。未来可以存在商业化可能性，但它不是当前产品主驱动。当前目标是先把 CodePal 做成足够强的免费本地控制塔，让重度用户自然聚集。

免费应该覆盖核心个人工作流：

- 免费 session history
- 免费 Session Review Card
- 免费 Day Digest
- 免费 agent usage overview
- 免费 local reports
- 免费 integration repair
- 免费 templates
- 免费 workflow-health diagnostics
- 免费 observation confidence labels
- 免费本地导出
- 免费 adapter ecosystem 和 contribution guide
- 免费社区 prompt / review templates，基于脱敏数据分享

## Track 0：Session Operations Layer

这是对现有 monitoring foundation 最近的一层行动能力增强。

目标：从 observe-only 进入 user-triggered operations，但不改变信任边界。

近期能力：

- session card action bar
- jump to terminal / IDE
- open repo
- 当存在可靠终端通道时，send structured follow-up message
- 当 adapter 暴露可靠路径时，resume session
- repair integration
- export review
- mark outcome
- close / archive session
- local action log
- action confidence
- capability-gated UI

设计规则：

- 所有 action 必须由用户明确触发
- 所有 action 都要 preflight
- 所有 action 都要检查 adapter capability
- 所有 action 都要写本地日志
- 失败原因必须让用户看得懂
- best-effort action 在执行前就要标注
- 默认不把 action 发送到云端

推荐命名：

- Session Operations Layer
- Agent Operator
- Local Agent Control Surface
- Attention Queue

避免使用 agent scheduler 这个名字。

### Capability Manifest

每个 agent adapter 都应该暴露 capability manifest，让 UI 根据能力和可信度显示操作，而不是假装所有 agent 都支持同样控制。

示例 capability：

- `observeSession`
- `observeUsage`
- `jumpToSession`
- `sendStructuredMessage`
- `resumeSession`
- `startSession`
- `stopSession`
- `repairIntegration`
- `exportTranscript`
- `estimateCost`
- `observeQuota`
- `observeContextPressure`

每个 capability 至少包含：

- support level：`supported`、`partial`、`best_effort`、`unsupported`
- source：hook、log、transcript、terminal、provider 或 manual
- confidence：high、medium 或 low
- caveats
- preflight requirements
- 用户可读 failure reasons

### Action Broker

CodePal 应该通过统一的本地 action broker 管理用户触发的操作。

Action 类型：

- `jump`
- `send_message`
- `resume`
- `open_repo`
- `repair_integration`
- `export_review`
- `mark_outcome`
- `close_session`
- `archive_session`

Broker 生命周期：

1. 用户触发 action
2. broker 读取 session state 和 adapter capability
3. broker 执行 preflight
4. 必要时展示 confidence、target 和 caveats
5. 风险较高或 best-effort action 需要用户确认
6. broker 在本地执行
7. broker 记录 local action log
8. broker 返回 success 或用户可读 failure
9. review card 和 timeline 可以纳入 action history

## Track 1：个人 AI 工作记忆

这是下一阶段最高杠杆的产品层，继续保留为主线。

目标：让 CodePal 不只在 agent 运行中有用，也能在工作结束后帮助用户看懂到底发生了什么。

近期能力：

- session review card / page：总结持续时间、主要阶段、等待 / 错误区间、模型使用、token / 成本、最终状态和 outcome
- 第一版使用确定性规则生成 summary，不依赖 LLM 总结
- LLM 总结只能作为后续增强，并且必须本地可控、可关闭、可脱敏
- daily digest：跨 agent 展示今天跑了什么、完成了什么、卡在哪里、用量集中在哪、哪些 session 需要跟进
- 可导出的本地 HTML / Markdown 报告，并提供 prompts、路径、assistant 内容的脱敏选项
- 当 source path 可信时，按项目 / repository 分组并提供更可读的 session 标题
- 本地 retention 控制继续区分细粒度 activity history 和聚合 analytics

Session review card 应包含：

- agent 类型
- repo / project
- session 开始和结束时间
- 持续时长
- completed / interrupted / idle / error 状态
- resume 事件
- context compact / compression 信号
- token 使用
- 估算 cost
- 主要 activity timeline
- 等待时间
- 用户介入次数
- jump / message / repair / export / mark-outcome 操作历史
- session outcome 标记
- 数据可信度

为什么先做：

- 直接复用现有 history SQLite、usage backfill、Analytics page 和 HTML report 基础
- 给用户一个“收工后也会打开 CodePal”的理由
- 比团队 dashboard 或远端 analytics 更符合当前本地隐私契约

## Track 2：Workflow Health

CodePal 可以进入流程质量诊断，但不要变成 bossware 或绩效打分工具。

优先信号：

- 等待时长：session 停在 waiting / idle gap 的时间
- idle time：看似活跃的工作安静了多久
- 异常恢复：session 出错后是否恢复或完成
- session churn：重复 abort、restart、compact，或大量 subexecution 的运行
- 上下文压力：当上游有信号时，识别 context compaction、模型切换或大 token run
- 配额压力：本地用量、估算费用、last-known rate-limit snapshot
- 异常 cost：相对近期个人历史的 token / cost outlier
- 未闭环工作：completed 或 idle 但没有明确 outcome 的 session
- 观测覆盖率：哪些工作 CodePal 能确信看见，哪些只是推断或可能漏掉

设计规则：

- 把这些叫作个人 workflow-health 信号
- 避免排行榜、个人生产力评分或团队绩效语言
- 区分 estimated、backfilled、inferred、real-time 数据
- 明确显示 missing data，不要用漂亮图表掩盖缺口

## Track 3：观测可信度

在继续扩更多 agent 或平台之前，先把“这些数据有多可信”变成用户可见的一等对象。

近期工作：

- 标明 integration 是 live、backfilled、estimated、degraded 还是 unsupported
- 在 diagnostics 里展示事件投递可靠性和近期 ingestion gap
- usage row、cost estimate、timeline segment、session review、digest 都要按 data source 和 confidence 标注
- 明确 terminal delivery 能力：tmux、WezTerm、kitty、iTerm2、Ghostty 支持；Terminal.app 和 Warp 仍不属于可靠消息投递范围
- 未知 upstream payload 继续进入 adapter calibration，不要在 renderer 里临时猜
- Provider Gateway quota 保持诚实：MiMo 没有稳定官方 quota API 前，仍然只做 dashboard/manual 边界

每个 confidence label 应区分：

- 数据来源
- 实时观测还是日志回填
- reported value 还是 estimated value
- 是否经过 dedupe / clean
- 是否 best-effort
- 已知缺失字段
- adapter 完整度
- terminal path 稳定性

## Track 4：Attention Queue And Ambient Presence

Ambient UI 应该是价值层的压缩，不是价值层的替代。

真正的价值层是 Attention Queue：把用户注意力引导到需要动作的 session 和 integration。Menu bar / mini presence 应该在这些信号真正有用之后再做。

Attention Queue 候选：

- running sessions
- waiting for decision 的 sessions
- idle 太久的 sessions
- errored sessions
- 应该 resume 的 sessions
- 应该 close / review 的 sessions
- 异常 token / cost 消耗
- 需要 repair 的 integrations
- AI 活动异常密集的 repos
- quota 或 context pressure

适合 ambient 的信息：

- glanceable running / waiting 状态
- needs-attention count
- quota 或 rate-limit 压力
- 结束后仍需要跟进的 session
- degraded integration 状态
- review reminder

避免：

- 还没决定高频信号之前先做装饰性表面
- 通知轰炸
- 把 approval interception 重新搬回 CodePal

## Track 5：Community And Ecosystem

这一轨用于强化免费用户聚集策略，不进入团队监控或收费 analytics。

适合的社区表面：

- community prompt templates
- session review templates
- adapter contribution guide
- report schema
- local-first export format
- workflow-health recipes
- public examples with sanitized data
- GitHub integration docs
- issue-based adapter requests
- community troubleshooting knowledge base

隐私友好的共享规则：

- 用户分享 templates、schemas、recipes 和 sanitized examples
- 不默认上传 transcript
- 不默认遥测
- 不隐藏云端 analytics pipeline
- 所有 report export 都 local-first 且支持脱敏

## Track 6：Optional Shared Ops Visibility

团队功能是后续阶段，不是下一步。

如果推进，团队第一层也应该是共享运营可见性，而不是个人生产力评分：

- 共享 degraded integration 或 quota-pressure 感知
- shared anonymized workflow issues
- shared templates
- shared adapter configs
- shared troubleshooting knowledge
- opt-in 的脱敏 session 摘要
- 没有个人排行榜的聚合 workflow-health 趋势
- summary 与内容级别的权限边界

不要做：

- 给个人开发者打分的 team admin dashboard
- AI usage ranking
- leaderboard
- manager productivity analytics
- developer surveillance

team / cloud 工作在 release-ready 之前必须先更新 privacy 和 support 文档：

- 共享什么
- 谁能读
- 是否包含 prompts、路径、代码片段或 assistant 输出
- 数据存在哪里
- 如何脱敏、如何退出

## 商业化备注

之前的“个人优先付费价值”可以保留为未来讨论，但不能牵引当前 roadmap。

如果未来重新讨论商业化，它也应该：

- 从已经被验证的个人本地价值出发
- 不把核心个人工作流放进付费墙
- 不把 free 做成阉割版
- 不把产品拉向团队监控
- 放在 daily usage 和 trust 被验证之后

不要先做 billing 实现。先验证用户是否会长期打开 CodePal，并是否会回到 review / digest / attention 表面。

## 明确后置

- 把 Pro / Team / Enterprise 包装作为路线图主驱动
- 作为通用 agent console 的 freeform `text_input`
- 重新让 CodePal 成为 Claude approval 中间层
- JetBrains workspace activation 保证
- 给个人开发者打分的团队 dashboard
- 没有新隐私模型的 cloud sync 或 remote analytics
- 在 macOS 交互模型和发布链路长期稳定之前做 Windows 支持
- auto approval
- approval interception
- auto task splitting
- auto agent selection
- auto opening multiple CLI sessions
- auto command execution
- auto result merging
- auto model switching by cost
- background autonomous execution queues

## 决策顺序

如果规划精力有限，按这个顺序做：

1. 定义 capability manifest 和 action broker primitives
2. 交付 Session Operations MVP
3. 设计并验证 session review
4. 在 review、usage、timeline、diagnostics、operations 中加入 observability-confidence labels
5. 加 daily digest 和本地报告导出
6. 加 workflow-health 信号和 Attention Queue
7. 在 attention signals 真正有用后增加 ambient presence
8. 开放 community templates、schemas 和 adapter contribution paths
9. 最后再回头评估 optional shared ops visibility、cloud sync、更大控制面、新平台或商业化包装
