<h1 align="center">
  <img src="docs/icon.png" width="56" alt="CodePal icon" valign="middle" />
  <span valign="middle">CodePal</span>
</h1>

<p align="center"><strong>一个面向 AI 编码代理的悬浮监控面板。</strong></p>
<p align="center">把 Cursor、Claude Code、Codex、CodeBuddy 的状态放到一个窗口里，不再在 IDE、终端和网页之间来回切换。</p>

<p align="center">
  <img src="https://img.shields.io/badge/platform-macOS-blue" alt="platform macOS" />
  <img src="https://img.shields.io/badge/version-1.0.0-green" alt="version 1.0.0" />
  <img src="https://img.shields.io/badge/license-MIT-yellow" alt="license MIT" />
  <br/>
  <a href="https://github.com/shamcleren/CodePal/releases"><strong>前往 Releases 下载</strong></a>
  ·
  <a href="./README.md">English</a>
</p>

---

## 为什么是 CodePal

AI 编码工作流很容易变得割裂：

- 一个 session 正在 Cursor 里运行
- 另一个 session 在终端里等待审批
- quota 和 usage 藏在浏览器 dashboard
- 最近活动分散在不同工具界面里

CodePal 的目标，就是把这些状态收拢成一个可持续挂在桌面的监控面板。

## 界面预览

![CodePal Dashboard](docs/hero-main.png)

## 你能得到什么

- **统一 session 视图**：活跃、等待、完成、异常会话放在同一列表
- **可读的活动流**：突出 assistant、tool、system 的关键信号，压制低价值噪音
- **quota / usage 感知**：持续看到 token 和额度压力
- **低摩擦接入**：可以直接在应用内修复受支持的本地接入配置
- **双语界面**：支持英文、简体中文和跟随系统语言

## 当前支持的 Agent

| Agent | Session | 用量 |
|:---|:---:|:---:|
| **Cursor** | ✅ | ✅ |
| **Claude Code** | ✅ | ✅ |
| **Codex** | ✅ | ⚠️ |
| **CodeBuddy** | ✅ | ✅ |
| **GoLand / PyCharm** | ✅ | — |

不同来源的 usage 覆盖深度仍有差异；真正还需要关心的边界放在下方说明和 release notes 里。

## 安装

1. 打开 [Releases](https://github.com/shamcleren/CodePal/releases)。
2. 下载最新的 macOS `.dmg` 或 `.zip`。
3. 把 `CodePal.app` 移到 `Applications`。
4. 启动应用；如果 macOS 拦截，按系统提示手动放行即可。

当前距离更完整的 1.0.0 发布口径，主要还差 macOS 签名 / 公证这一道正式分发流程。

## 适合谁

- 同时运行多个 code agent 的开发者
- 想把审批状态、最近活动、配额压力放到一个窗口里的人
- 不想频繁在 IDE、终端、网页之间切换的人

## 当前版本边界

CodePal v1 刻意保持 monitoring-first。

当前重点是：

- 统一监控
- session / activity 可见性
- quota / usage 可见性
- 双语桌面 UI（`system` / `en` / `zh-CN`）
- 应用内已经支持的有限审批 / 结构化选择回路

在更干净的 1.0.0 发布标准下，当前主要剩余工作是：

- macOS 签名与 notarization
- 在现有绿色构建基础上完成最终发布可信度收口

当前仍不打算做成：

- 一个通用的 agent 聊天入口
- 一个深度 IDE 导航层
- 一个深度终端控制台
- 一个已经签名 / 公证完成的正式 macOS 发行版

## 接下来

近期优先级主要是：

- 完成 macOS 签名 / 公证并降低安装摩擦
- 在当前仍不完整的数据源上继续补 usage / quota 可见性
- 扩大已支持 agent 的真实 payload 校准范围
- 继续打磨 diagnostics、空状态和降级状态表达

更完整的规划方向见 [docs/roadmap-next.zh-CN.md](docs/roadmap-next.zh-CN.md)。

## 给开发者

如果你是来继续开发，而不是直接使用：

- 先读 [AGENTS.md](AGENTS.md)
- 再读 [docs/design-overview.md](docs/design-overview.md)
- 再读 [docs/context/current-status.md](docs/context/current-status.md)
- 用 [docs/README.md](docs/README.md) 作为文档索引

## License

MIT
