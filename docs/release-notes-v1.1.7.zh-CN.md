## CodePal v1.1.7

这版发布 v1.1.6 首次切版后补上的用量分析改进。

### 重点变化

- **Claude / Codex 历史用量补齐**：Analytics 可以从本地 Claude 和 Codex JSONL 日志导入已有 token 历史。
- **Top Sessions 更可读**：详细 HTML 报告现在优先展示第一条用户消息摘要，并把缩短后的 session id 放在次级位置，不再用一长串 UUID 当主标题。
- **分析数据保留更长**：详细活动历史继续按天数窗口保留，token 分析数据可以保留更久或永久保留。
- **Analytics 摘要卡片更清楚**：主要 Agent / 主要模型改成主次两行信息，紧凑视图里不再挤成一行。

### 验证

- 本地完整验证已完成
- 已产出签名并公证的 macOS 包
