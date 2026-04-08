<p align="center">
  <img src="docs/icon.png" width="56" alt="CodePal icon" valign="middle" />
  <span valign="middle"><strong><font size="7">CodePal</font></strong></span>
</p>

<p align="center"><strong>一个面向 AI 编码代理的悬浮监控面板。</strong></p>
<p align="center">把 Cursor、Claude Code、Codex、CodeBuddy 的状态放到一个窗口里，不再在 IDE、终端和网页之间来回切换。</p>

<p align="center">
  <img src="https://img.shields.io/badge/platform-macOS-blue" alt="platform macOS" />
  <img src="https://img.shields.io/badge/version-0.1.0-green" alt="version 0.1.0" />
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

## 当前支持的 Agent

| Agent | Session 监控 | 活动时间线 | 用量 |
|:---|:---:|:---:|:---:|
| **Cursor** | ✅ | ✅ | ✅ Dashboard spend |
| **Claude Code** | ✅ | ✅ | ✅ Token，用量可用时保留最近一次 quota 快照 |
| **Codex** | ✅ | ✅ | Partial |
| **CodeBuddy** | ✅ | ✅ | ✅ 月度 quota |
| **GoLand / PyCharm** | ✅ | ✅ | — |

## 安装

1. 打开 [Releases](https://github.com/shamcleren/CodePal/releases)。
2. 下载最新的 macOS `.dmg` 或 `.zip`。
3. 把 `CodePal.app` 移到 `Applications`。
4. 启动应用；如果 macOS 拦截，按系统提示手动放行即可。

当前构建仍是 unsigned / ad-hoc，首次启动时可能需要在 macOS 安全设置中手动确认。

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
- 应用内已经支持的有限审批 / 结构化选择回路

当前不打算做成：

- 一个通用的 agent 聊天入口
- 一个深度 IDE 导航层
- 一个深度终端控制台
- 一个已经签名 / 公证完成的正式 macOS 发行版

## 接下来

下一轮工作大概率会继续优先补 usage 可见性、真实 payload 校准，以及更顺滑的 macOS 发布体验。

更完整的规划方向见 [docs/roadmap-next.md](docs/roadmap-next.md)。

## 给开发者

如果你是来继续开发，而不是直接使用：

- 先读 [AGENTS.md](AGENTS.md)
- 再读 [docs/design-overview.md](docs/design-overview.md)
- 再读 [docs/context/current-status.md](docs/context/current-status.md)
- 用 [docs/README.md](docs/README.md) 作为文档索引

## License

MIT
