## CodePal v1.1.6

这版主要让监控更安静，同时补强用量分析。

### 重点变化

- **新增 Analytics 页面**：Token 用量有了独立入口，支持快捷时间范围、自定义日期、按模型拆分，以及浏览器打开的 HTML 报告。
- **Provider Gateway 设置更清楚**：设置页集中展示 gateway URL、provider/profile 状态、模型映射、token 状态和健康检查。
- **Codex session 更低噪音**：guardian / sandbox / subagent 这类内部执行会归并到最近的用户 session，`Chunk ID` 工具输出不再顶掉主列表标题。
- **Dashboard 继续抛光**：主 UI 移除批量审批按钮，设置导航更清爽，最近 session 排序更稳定。

### 验证

- 本地完整验证已完成
- 已产出签名并公证的 macOS 包
