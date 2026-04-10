# CodePal v1.0.0 Release Notes

CodePal v1.0.0 是当前 monitoring-first 产品方向下首个完成签名与公证的正式公开版本说明。

它提供一个悬浮桌面面板，用来把多个 AI 编码代理的状态集中到一个地方查看。

## 版本亮点

- 一个悬浮面板统一查看 Cursor、Claude Code、Codex、CodeBuddy，以及当前经由共享 CodeBuddy JetBrains 插件路径接入的 GoLand / PyCharm
- 单一平铺、按时间排序的 session 监控视图，`running`、`waiting`、`completed`、`error` 等状态更清晰
- 统一的 assistant / tool / system 活动时间线，并尽量压低低价值噪音
- 支持当前所有已接入来源的 usage 可见性
- 应用内 integration 诊断与修复，以及 Cursor / CodeBuddy 登录态删除后重新登录
- 双语桌面 UI，支持 `system` / `en` / `zh-CN`

## 安装

1. 打开仓库的 `Releases` 页面。
2. 下载最新的 macOS `.dmg` 或 `.zip`。
3. 将 `CodePal.app` 移到 `Applications`。
4. 启动应用。
5. 如果 macOS 首次启动仍有提示，按系统提示手动放行一次后即可继续。

## 已知后续跟进项

- Claude 还没有 authoritative 的实时 quota/reset 数据源。当前行为仍是 token-first，若 statusline quota 可用则保留最近一次快照。
- Cursor payload 覆盖仍在继续扩展。
- CodeBuddy payload 与 transcript shape 校准仍在继续扩展。
- GoLand / PyCharm 当前仍走共享 CodeBuddy JetBrains 插件路径，而不是单独的原生适配器。
- CodePal 仍然是 monitoring-first，而不是完整的跨 agent 控制台。

## 本版本不包含

- 自由文本 `text_input`
- 通用的 CodePal -> agent 消息通道
- 深度 IDE pane 导航承诺
- 深度终端控制
- 超出当前 monitoring-first v1 基线的更大范围产品扩展

## 反馈时建议附带的信息

- 涉及哪个 agent
- 问题属于 session 可见性、activity、usage，还是 settings
- 你原本预期看到什么
- CodePal 实际显示了什么
- 是否稳定复现
- 有关面板或设置页的截图

## 验证状态

已于 2026-04-09 验证：

- `npm test`
- `npm run lint`
- `npm run build`
- `npm run test:e2e`
- `npm run dist:mac`
- Apple notarization 状态：`Accepted`
- DMG staple：`validated`
