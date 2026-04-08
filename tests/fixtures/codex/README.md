# Codex Log Fixtures

本目录固化当前 `Codex session jsonl` 归一化所依赖的真实 / 准真实样本，目标是让 `response_item` 变体校准不再散落在 adapter 单测里。

## 设计原则

- fixture 保存的是单行 jsonl 对应的完整 entry，而不是拆开的 payload 字段。
- expectation 只描述共享 session 模型真正需要的结果。
- 本轮重点覆盖 `response_item` 的 richer 结构，不涉及 renderer 表达。

## 当前覆盖

| Fixture | 来源 | 覆盖点 |
| --- | --- | --- |
| `response-item-message-nested-content.json` | quasi-real | `message.content` 更深层嵌套文本 |
| `response-item-message-content-string.json` | quasi-real | `message.content` 子项为直接字符串内容 |
| `response-item-message-multi-segment-content.json` | quasi-real | `message.content` 多段文本时只取首个正文段作为主正文 |
| `response-item-function-call-object-arguments.json` | quasi-real | `function_call.arguments` 为对象 |
| `response-item-function-call-output-structured-output.json` | quasi-real | `function_call_output.output` 为结构化数组 |
| `response-item-function-call-output-output-over-content.json` | quasi-real | `function_call_output` 同时有 `output` 和 `content` 时优先显式 output |

## 当前结论

- `response_item.message` 不能只盯住平铺 `text`，要允许有限递归读取 `content`。
- `function_call.arguments` 和 `function_call_output.output` 既可能是字符串，也可能是对象/数组；需要统一提取或稳定 stringify。
