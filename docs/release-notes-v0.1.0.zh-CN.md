# CodePal v0.1.0 Release Notes

CodePal v0.1.0 是当前 monitoring-first 产品方向下的首个内测版本。

它提供一个悬浮桌面面板，用来把多个 AI 编码代理的状态集中到一个地方查看。

## 版本亮点

- 一个悬浮面板统一查看 Cursor、Claude Code、Codex、CodeBuddy，以及当前已校准的 GoLand / PyCharm 路径
- 单一平铺、按时间排序的 session 监控视图，`running`、`waiting`、`completed`、`error` 等状态更清晰
- 统一的 assistant / tool / system 活动时间线，并尽量压低低价值噪音
- 支持多来源 usage 可见性，包括 Cursor spend、CodeBuddy quota、Claude token usage，以及 Codex 的 first-pass usage 信号
- 应用内 integration 诊断与修复，以及 Cursor / CodeBuddy 登录态删除后重新登录

## 安装

1. 打开仓库的 `Releases` 页面。
2. 下载最新的 macOS `.dmg` 或 `.zip`。
3. 将 `CodePal.app` 移到 `Applications`。
4. 启动应用。
5. 如果 macOS 首次启动拦截，按系统提示手动放行。

当前构建仍然是 unsigned / ad-hoc 的内部版本。

## 已知但非阻断的问题

- Claude 还没有 authoritative 的实时 quota/reset 数据源。当前行为仍是 token-first，若 statusline quota 可用则保留最近一次快照。
- Cursor payload 覆盖仍在继续扩展。
- CodeBuddy payload 与 transcript shape 校准仍在继续扩展。
- GoLand / PyCharm 目前仍限制在共享 CodeBuddy JetBrains watcher 的已校准范围内。
- macOS 分发仍未签名 / 未公证。
- CodePal 仍然是 monitoring-first，而不是完整的跨 agent 控制台。

## 本版本不包含

- 自由文本 `text_input`
- 通用的 CodePal -> agent 消息通道
- 深度 IDE pane 导航承诺
- 深度终端控制
- 已签名 / 已公证的正式生产发行

## 反馈时建议附带的信息

- 涉及哪个 agent
- 问题属于 session 可见性、activity、usage，还是 settings
- 你原本预期看到什么
- CodePal 实际显示了什么
- 是否稳定复现
- 有关面板或设置页的截图

## 验证状态

已于 2026-04-08 验证：

- `npm test`
- `npm run lint`
- `npm run build`
- `npm run test:e2e`
- `npm run dist:mac`
