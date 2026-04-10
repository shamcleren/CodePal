# 隐私与数据边界说明

CodePal 是一个本地优先、监控优先的桌面应用。它会读取本机会话状态、活动和配额相关信号，把多个 agent 工作流汇总到一个面板里。

这份文档只说明三件事：

- CodePal 会读取什么
- CodePal 默认不会读取什么
- 什么数据会离开你的机器

## CodePal 会读取什么

当对应集成启用时，CodePal 可能读取这些本地来源：

- 本地 session / transcript 日志，例如 `~/.codex/sessions/`、`~/.claude/projects/`、`~/.codebuddy/projects/`
- 本地集成配置文件，例如 `~/.cursor/hooks.json`、`~/.codebuddy/settings.json`、`~/.codex/config.toml`，以及 CodePal 自己的 `settings.yaml`
- 通过 CodePal 内置登录窗口建立的隔离 cookie 登录态，用于受支持的 quota / usage 流程
- 在你明确完成登录后，由受支持提供方返回的本地 quota / usage 响应

这些上游 session 日志里可能包含 prompt、tool call、文件路径和 assistant 输出。请把这些源文件当作敏感的本地开发数据看待。

## CodePal 默认不会读取什么

CodePal 默认不会：

- 扫描你的整个文件系统
- 读取你平时浏览器 profile 里的任意 cookies
- 把 prompt 或 transcript 正文上传到 CodePal 自己的云端
- 上传仓库内容做遥测
- 在当前 monitoring-first 基线下向上游 agent 注入自由文本消息

## 网络访问边界

当你使用受支持的 quota 或更新功能时，CodePal 可能访问：

- GitHub Releases，用于应用更新元数据和更新包下载
- Cursor dashboard 接口，前提是你已经在 CodePal 隔离登录窗口里完成登录
- CodeBuddy quota 接口，前提是你已经在 CodePal 隔离登录窗口里完成登录

CodePal 当前没有内置匿名遥测，也没有自己的远端分析管线。

## 本地存储

CodePal 会把自己的本地应用数据写在标准 Electron app data 目录 `codepal` 下，包括设置、受支持集成的隔离登录态、updater 相关状态，以及在启用历史持久化时使用的本地 SQLite 历史库。

CodePal 自己的设置文件路径是：

- `~/Library/Application Support/codepal/settings.yaml`

当启用本地历史持久化时，CodePal 还会写入：

- `~/Library/Application Support/codepal/history.sqlite`

这个 SQLite 文件里保存的是 CodePal 归一化后的 session activity 历史，以及一小部分用于排查的精简事件字段。它不是上游工具的 source of truth，并且会受到 CodePal 自己的保留天数和容量上限约束。

上游集成的数据仍然保留在各自工具自己的目录里。CodePal 会读取这些路径，但不会取代它们的 source of truth 地位。

## 敏感数据提醒

- 上游 session 日志可能包含敏感 prompt、代码片段和内部路径
- CodePal 的本地历史库也可能在配置的保留窗口内保存这些上游流程归一化后的 prompt、assistant 回复、tool activity 和文件路径
- quota 登录态保存在 CodePal 自己管理的隔离浏览器分区里，而不是你日常浏览器 profile
- “复制诊断信息”会尽量只输出状态摘要，不包含 cookie 或 transcript 正文，但你在对外发送前仍应自行复查

## 如何删除 CodePal 本地数据

如果你想清掉 CodePal 自己管理的本地状态：

1. 退出 CodePal
2. 删除 `~/Library/Application Support/codepal/`
3. 如果你不再需要 CodePal 集成，再分别移除或修复各上游工具里的 hook / 配置文件

应用内的“清空持久化历史”只会删除 CodePal 自己的 SQLite 历史数据。它不会清掉当前内存里的 session 摘要，也不会删除上游 transcript / session log 文件。

删除 CodePal app data 目录，并不会删除 Cursor、Claude Code、Codex 或 CodeBuddy 自己产出的 session 日志。

## 当前边界

这份文档描述的是当前 v1 monitoring-first 基线。如果后续 CodePal 增加 telemetry、云同步或更强的 outbound control 流程，这份文档应先更新，再把这些能力视为正式可发布能力。
