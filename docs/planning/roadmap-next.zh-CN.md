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

当前 post-v1.1.11 开发基线也已经加入：

- capability manifest 和本地 action broker primitives，用于有边界的 Session Operations
- 更紧凑的 session action surface：jump、内联 message、列表层 delete placement
- footer 层级的单 session 用量统计：请求数、input、output、cache、估算费用
- 两套内置语义化视觉主题：`graphite-ops` 和 `paper-ops`，覆盖 session footer 和 Analytics 等表面

下一阶段应该基于这些本地数据资产继续往上做，而不是过早回到泛控制台或跨 agent 拦截层。

## 下个版本范围

下个版本应该从被动复盘 UI 转向可行动的工作流基础设施。

下个版本交付：

- 事项流转 MVP：
  - 从 session、状态变化、pending、error、用户触发操作中派生事项
  - 支持 `waiting`、`needs_follow_up`、`failed`、`completed`、`deferred` 等状态
  - 当 source path 可靠时，按 project / repository 分组
  - 事项标题和 next action 必须足够短，适合在主工作流里扫读
- CLI 操作流 MVP：
  - 面向目标 terminal / agent session 暴露有边界的操作表面
  - 执行前必须 preflight
  - 操作类型允许时支持 dry-run
  - 将 execute result、error、timestamp、target、source session 记录到本地 operation log
  - 操作必须由用户明确触发；不增加 autonomous scheduling 或自动执行队列
- Report Facts 层：
  - 从事项、operation log、session status、usage stats 生成确定性的日报 / 周报 / 月报 facts object
  - 包含请求数、input、output、cache、估算费用、完成 / 失败 / 待跟进数量，以及关键操作结果
  - facts object 是报告唯一支持的输入；默认不要让 LLM 直接总结原始 transcript
- 手动 LLM 报告生成：
  - Report Facts 层存在后，允许用户手动生成日报 / 周报 / 月报
  - 因为会消耗用户模型额度，所有 LLM 报告生成都必须受设置开关控制
  - 提供模型选择器，默认使用已配置模型中最便宜、且足够做总结的模型
  - 当 pricing 数据可用时，生成前展示所选模型和估算 token / cost 范围
  - 事实提取是确定性的，所以默认使用低成本模型
  - 更强模型只作为可选 deep analysis 路径，不作为默认
  - 任何后台 / 自动报告生成都必须显式 opt-in，并展示清晰的额度消耗提示
  - prompts、路径、assistant 内容、命令输出、repo 标识离开本地 app 前必须先经过脱敏控制

下个版本不做：

- 顶层 ReviewCard
- Review Page
- 只复述 session 日志的静态 Digest tab
- 主观 data-confidence badge
- 让 LLM 总结无限制原始 transcript
- autonomous CLI execution、auto approval、auto merge、auto task assignment

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
- 在数据可能 partial、estimated、inferred、best-effort 时，展示事实型 source 和 coverage
- 调度用户注意力，而不是调度 agent 执行
- 在 adapter capability 和 preflight 足够明确时，允许用户显式触发有边界的操作
- 在 team sharing、billing、cloud sync 或更大控制面之前，先验证免费的个人持续价值

研究来源：`docs/planning/research/deep-research-report.md`。

## 免费增长约束

中期和长期规划都不应该被变现牵引。

当前产品决策应该优化：

- 重度 AI coding 用户的日常打开率
- 长期本地信任
- 围绕事项流转、CLI 操作流和有用 LLM 报告的使用习惯
- 用户主动推荐给其他开发者
- 社区贡献 adapter、template、schema 和 troubleshooting knowledge

不要把下一阶段路线设计成 Pro / Team / Enterprise 打包。未来可以存在商业化可能性，但它不是当前产品主驱动。当前目标是先把 CodePal 做成足够强的免费本地控制塔，让重度用户自然聚集。

免费应该覆盖核心个人工作流：

- 免费 session history
- 免费事项流转
- 免费 CLI 操作流
- 当 LLM 生成真正有用时，免费日报 / 周报 / 月报
- 免费 agent usage overview
- 免费 local reports
- 免费 integration repair
- 免费 templates
- 免费 workflow-health diagnostics
- 在影响决策时，免费展示事实型 source / coverage 指示
- 免费本地导出
- 免费 adapter ecosystem 和 contribution guide
- 免费社区 prompt / review templates，基于脱敏数据分享

## Track 0：Session Operations Layer

这是对现有 monitoring foundation 最近的一层行动能力增强。

目标：从 observe-only 进入 user-triggered operations，但不改变信任边界。

近期能力：

- session card action bar（详情视图内）：jump to terminal / IDE
- open repo（暂缓：workspacePath 在 session 数据中极少可用；路径提取可靠后再加回）
- 当存在可靠终端通道时，send structured follow-up message（内联输入框，不在 action bar）
- 当 adapter 暴露可靠路径时，resume session
- repair integration
- export report（暂缓，等 Report Facts 和脱敏控制存在后再做）
- delete session（列表层操作，不在 action bar 内）
- local action log
- action confidence
- capability-gated UI

已从 MVP 移除：

- mark outcome — 移除：footer 用量摘要不需要手动标记；如果后续有价值，应从事项流转中推导 outcome
- close / archive session — 改名为 delete session 并移至列表层；用户不需要打开详情才能删除会话

操作放置规则：

- action bar（session 详情内）：导航和交互类操作，依赖实时会话上下文（jump、open repo、send message）
- 列表层（session 行）：破坏性或结构性操作，不需要打开详情（delete session）
- 不要把破坏性操作放在详情视图内；不要把上下文依赖的操作放在列表层

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

- `jump`（action bar）
- `send_message`（内联输入框）
- `resume`（action bar）
- `open_repo`（暂缓 — workspacePath 极少可用）
- `repair_integration`（action bar）
- `export_report`（暂缓，等 Report Facts 和脱敏控制存在后再做）
- `delete_session`（列表层）

说明：`mark_outcome`、`close_session`、`archive_session` 已从 action 类型中移除。Outcome 应自动推断，不需要手动标记。会话移除统一为列表层的 `delete_session`。

Broker 生命周期：

1. 用户触发 action
2. broker 读取 session state 和 adapter capability
3. broker 执行 preflight
4. 必要时展示 confidence、target 和 caveats
5. 风险较高或 best-effort action 需要用户确认
6. broker 在本地执行
7. broker 记录 local action log
8. broker 返回 success 或用户可读 failure
9. 事项、operation log 和后续报告可以纳入 action history

## Track 1：事项流转、CLI 操作流与报告

这是下一阶段最高杠杆的产品层，继续保留为主线。

目标：让 CodePal 在工作需要继续推进时有用，而不是只帮助用户回看发生过什么。

当前开发基线已经开始：

- 确定性单 session 用量统计只放在 expanded footer：请求数、input、output、cache、估算费用
- 大块 ReviewCard UI 不作为主表面
- footer 和 analytics 表面都走 theme-aware 颜色与字体 token，亮色和暗色主题下都保持可读

下一步增量：

- Report Facts 层：作为日报 / 周报 / 月报的确定性输入
- 事项流转：跨 agent 跟踪 waiting、needs follow-up、failed、completed、deferred
- CLI 操作流：target terminal、preflight、dry-run、execute、result、本地 action log
- 基于事项和操作日志生成 LLM 日报 / 周报 / 月报，而不是从静态指标卡片生成
- 在 report export 前提供 prompts、路径、assistant 内容、命令输出、repo 标识的脱敏选项
- 当 source path 可信时，按项目 / repository 分组并提供更可读的事项标题
- 本地 retention 控制继续区分细粒度 activity history 和聚合 analytics

footer 层级的用量摘要最多覆盖：

- 请求数
- input tokens
- output tokens
- cache tokens
- 估算费用

事项流转和 CLI 操作流应继续补齐：

- repo / project
- 当前 owner / next action
- 关联 session 和 terminal target
- preflight 状态和 dry-run 输出
- execute 结果和本地 action history
- follow-up / failed / completed 状态流转
- export 和 redaction metadata

LLM 报告规则：

- 报告只能基于 Report Facts 加被选择的 operation-log 片段生成，不能默认把无限制原始 transcript 扔给 LLM
- LLM 报告生成必须受设置开关控制，因为它会消耗用户额度
- 用户必须能选择报告模型；默认使用已配置模型中最便宜、且足够做总结的模型
- 后台报告生成必须保持 opt-in，并展示额度 / 成本提示
- 默认模型应是低成本配置模型；昂贵模型只作为 deep analysis 的 opt-in
- 下个版本报告生成应以手动触发为主，不做 scheduled / automatic 默认行为
- report prompt 离开本地 app 前必须先执行脱敏

为什么先做：

- 让 CodePal 从被动监控变成有用的本地操作交接层
- 给用户一个在工作进行中持续打开 CodePal 的理由，而不是只在收工后打开
- 为真正有用的 LLM 日报 / 周报 / 月报提供结构化底座
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

## Track 3：数据来源与覆盖透明度

在继续扩更多 agent 或平台之前，先把重要数据的来源和覆盖范围讲清楚，但不要假装 CodePal 可以给所有数据打一个通用可信度分数。

近期工作：

- 标明 integration 是 live、backfilled、estimated、degraded 还是 unsupported
- 在 diagnostics 里展示事件投递可靠性和近期 ingestion gap
- 当信息会影响用户决策时，usage row、cost estimate、timeline、事项、CLI operation、report 都要标注具体 data source
- 明确 terminal delivery 能力：tmux、WezTerm、kitty、iTerm2、Ghostty 支持；Terminal.app 和 Warp 仍不属于可靠消息投递范围
- 未知 upstream payload 继续进入 adapter calibration，不要在 renderer 里临时猜
- Provider Gateway quota 保持诚实：MiMo 没有稳定官方 quota API 前，仍然只做 dashboard/manual 边界

每个 source / coverage 指示只表达事实来源：

- 数据来源
- 实时观测还是日志回填
- reported value 还是 estimated value
- 是否经过 dedupe / clean
- 是否 best-effort
- 已知缺失字段
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

不要先做 billing 实现。先验证用户是否会长期打开 CodePal，并是否会回到事项流转、CLI 操作流、报告生成和 attention 表面。

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

1. ~~定义 capability manifest 和 action broker primitives~~ — 已完成 (v1.2.0-dev)
2. 交付 Session Operations MVP — 修订范围：
   - capability manifest：已完成
   - action broker：已完成（jump、sendMessage）
   - session action bar：仅 jump（详情视图内）
   - send message：内联输入框（已可用）
   - delete session：列表层按钮（已完成）
   - ~~open repo~~：暂缓 — workspacePath 极少可用
   - ~~mark outcome~~：移除 — 如果后续有价值，从事项流转中推导 outcome
   - ~~close session~~：替换为列表层的 delete_session
3. 把确定性单 session 统计限制在 footer 层级：
   - 请求数 / input / output / cache / 估算费用：已开始
   - 顶层 ReviewCard / Review Page：暂缓，除非它能明确驱动一个具体操作
4. 定义日报 / 周报 / 月报使用的 Report Facts schema
5. 设计并验证事项流转和 CLI 操作流
6. 基于 Report Facts 和本地操作日志增加手动 LLM 日报 / 周报 / 月报
7. 仅在会影响用户决策时展示事实型 source / coverage 指示
8. 加 workflow-health 信号和 Attention Queue
9. 在 attention signals 真正有用后增加 ambient presence
10. 开放 community templates、schemas 和 adapter contribution paths
11. 最后再回头评估 optional shared ops visibility、cloud sync、更大控制面、新平台或商业化包装
