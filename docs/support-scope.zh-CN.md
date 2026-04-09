# 支持范围说明

这份文档定义的是 CodePal v1 在发布和 issue 分流时，什么算当前正式支持范围。

## 平台范围

- 仅支持 macOS
- 当前打包发布目标是 Apple Silicon `arm64`
- 当 release 签名流程配置完成后，当前正式发布产物是已签名 / 已公证的 macOS `.zip` 和 `.dmg`

Intel macOS 构建和非 macOS 平台，当前都不属于正式运营基线。

## 当前支持的 Agent / IDE 路径

下面这些路径属于当前已经承诺的监控与用量基线：

- Cursor
- Claude Code
- Codex
- CodeBuddy
- 通过共享 CodeBuddy JetBrains 插件路径接入的 GoLand 和 PyCharm

## 当前支持边界

CodePal v1 的正式支持边界是 monitoring-first：

- session 可见性
- activity 可见性
- 在上游信号存在时的 quota / usage 可见性
- 受支持本地配置路径的集成诊断和修复
- 应用内已经存在的有限结构化 action

下面这些不属于当前正式支持承诺：

- 通用聊天控制台
- 自由文本的 CodePal -> agent 发消息能力
- 深度 IDE 导航保证
- 对所有上游工具都承诺“完全跨界面一致”
- 超出当前校准范围的其他 JetBrains IDE

## Codex 说明

Codex 当前正式支持的是基于 session 日志的监控可见性。`notify` hook 的接入基础已存在，但在当前公开 v1 基线里，Codex 还不能被描述为“已经完成实时审批闭环”。

## 哪些问题属于当前支持范围

属于当前支持范围的例子：

- 受支持集成不再出现在 session 列表里
- 受支持的 quota / 登录流程在 CodePal 里无法刷新
- settings 诊断能力出现明显回退
- 已打包应用在当前支持的 macOS 发布路径上无法启动或更新

当前不属于正式支持承诺，或只能低置信处理的例子：

- 不受支持的平台
- 不受支持的 IDE 变体
- README / roadmap 里没有写成已交付的投机能力
- 上游工具修改了未文档化 payload，且仓库尚未完成重新校准

## 提交支持问题时建议附带

- 涉及哪个 agent / IDE
- 你期望发生什么
- 实际发生了什么
- 是否稳定复现
- CodePal 设置页里复制出的诊断摘要
- 如有必要，附截图或上游日志片段
