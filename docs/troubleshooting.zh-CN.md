# 常见问题与排查

## macOS 首次启动拦截

打开：

- 系统设置
- 隐私与安全性

手动允许 CodePal 一次，然后重新启动应用。

## 看不到 Session

先检查：

- 上游工具里是否真的有活跃会话
- CodePal 设置页里该集成是否显示为健康
- 对应的上游 session 日志路径是否存在

当前主要监控路径包括：

- `~/.codex/sessions/`
- `~/.claude/projects/`
- `~/.codebuddy/projects/`

## Cursor 或 CodeBuddy 的 quota 登录看起来断开

quota / usage 流程使用的是 CodePal 内部的隔离登录窗口。即使你已经在日常浏览器登录过，也可能仍需要在 CodePal 弹窗里再登录一次，才能安全读取隔离登录态。

如果刷新仍失败：

1. 打开 CodePal 设置
2. 清除对应登录态
3. 通过 CodePal 弹窗重新登录
4. 如需反馈问题，先复制诊断摘要

## 更新流程失败

如果应用内更新下载或安装失败：

1. 在 CodePal 设置里复制诊断信息
2. 先回退到 GitHub Releases 手动下载最新安装包
3. 反馈问题时附上复制出的诊断信息和你的 macOS 版本

## 本地诊断来源在哪里

CodePal 当前主要通过这些来源提供诊断：

- 应用内 diagnostics / support 摘要
- 本地 settings 文件
- 上游 session 和集成配置路径

重要本地路径：

- CodePal 设置：`~/Library/Application Support/codepal/settings.yaml`
- Codex sessions：`~/.codex/sessions/`
- Claude Code 日志：`~/.claude/projects/`
- CodeBuddy 日志：`~/.codebuddy/projects/`
- Cursor hooks 配置：`~/.cursor/hooks.json`
- CodeBuddy hooks 配置：`~/.codebuddy/settings.json`
- Codex notify 配置：`~/.codex/config.toml`

CodePal 当前公开 v1 基线里，还没有单独承诺一个“持久化的专用 app log 文件”。所以现阶段的正式支持路径，是优先使用应用内复制出的诊断摘要，再结合上面这些上游本地文件一起排查。

## 提交 bug 时建议附带

- 涉及哪个 agent / IDE
- 你期望发生什么
- 实际发生了什么
- 是否稳定复现
- CodePal 设置页里复制出的诊断摘要
- 如有帮助，再补截图或上游日志片段
