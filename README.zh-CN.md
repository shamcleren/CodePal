<h1 align="center">
  <img src="docs/icon.png" width="56" alt="CodePal icon" valign="middle" />
  <span valign="middle">CodePal</span>
</h1>

<p align="center"><strong>一个面板监控所有 AI 编码代理 — 会话、配额、活动，一目了然。</strong></p>

<p align="center">
  <img src="https://img.shields.io/badge/platform-macOS-blue" alt="platform macOS" />
  <img src="https://img.shields.io/github/v/release/shamcleren/CodePal?label=version&color=green" alt="version" />
  <img src="https://img.shields.io/badge/license-MIT-yellow" alt="license MIT" />
  <img src="https://img.shields.io/github/stars/shamcleren/CodePal?style=flat&label=stars" alt="GitHub stars" />
  <br/>
  <a href="https://github.com/shamcleren/CodePal/releases"><strong>前往 Releases 下载</strong></a>
  ·
  <a href="./README.md">English</a>
</p>

---

## 为什么是 CodePal

AI 编码工作流很容易变得割裂：

- 一个会话正在 Cursor 里运行
- 另一个会话在终端里等待审批
- 配额和用量藏在浏览器页面里
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
| **Codex** | ✅ | ✅ |
| **CodeBuddy** | ✅ | ✅ |
| **GoLand / PyCharm*** | ✅ | ✅ |

\* GoLand 和 PyCharm 当前走共享的 CodeBuddy JetBrains 插件路径，也包含用量可见性。

不同来源在上游信号来源上仍有差异，但上表这层 `session / 用量` 基线目前都已经支持。

## 安装

1. 打开 [Releases](https://github.com/shamcleren/CodePal/releases)。
2. 下载最新的 macOS `.dmg` 或 `.zip`。
3. 把 `CodePal.app` 移到 `Applications`。
4. 启动应用；如果 macOS 拦截，按系统提示手动放行即可。

正式发布构建走 `electron-builder` 原生 notarization 流程，并在结束时自动补上 DMG 的 `staple + validate` 以及 app 级别的 `codesign` / `spctl` 校验。

## 适合谁

- 同时运行多个 AI 编码代理、需要一个统一状态面板的开发者
- 关注最近活动、配额压力和会话状态的用户

## 当前版本边界

CodePal v1 刻意保持**监控优先**：统一的会话 / 活动 / 配额可见性，双语桌面 UI（`system` / `en` / `zh-CN`），以及有限的审批回路。

当前不打算做成通用聊天入口、深度 IDE 导航层或终端控制台。

## 接下来

- 补全上游数据源尚不完整的用量 / 配额可见性
- 扩大已支持 Agent 的真实 payload 校准范围
- 继续打磨诊断页、空状态和降级状态表达

更完整的规划方向见 [docs/roadmap-next.zh-CN.md](docs/roadmap-next.zh-CN.md)。

## 快速开始（开发）

```bash
git clone https://github.com/shamcleren/CodePal.git
cd CodePal
npm install
npm run dev        # 开发模式启动
npm run test       # 运行单元测试
npm run dist:mac   # 构建 .dmg / .zip（需要 Apple 签名凭据）
```

构建签名 / 公证版本前，需先设置 `APPLE_ID`、`APPLE_APP_SPECIFIC_PASSWORD` 和 `APPLE_TEAM_ID` 环境变量。

## 常见问题

**macOS 首次启动被拦截**
打开 **系统设置 → 隐私与安全性**，滚动到底部，点击 CodePal 旁边的 **仍要打开**。

**看不到 Session**
确认对应的 Agent（Cursor / Claude Code / Codex / CodeBuddy）确实有正在运行的会话。可以使用应用内诊断页检查集成路径是否正常。

## 隐私与支持

- [隐私与数据边界说明](docs/privacy-and-data.zh-CN.md)
- [支持范围说明](docs/support-scope.zh-CN.md)
- [常见问题与排查](docs/troubleshooting.zh-CN.md)
- [提交 Issue](https://github.com/shamcleren/CodePal/issues/new/choose)

## 给开发者

<details>
<summary>贡献者文档入口</summary>

- [AGENTS.md](AGENTS.md) — Agent 编码约定
- [docs/design-overview.md](docs/design-overview.md) — 架构概览
- [docs/context/current-status.md](docs/context/current-status.md) — 当前状态
- [docs/README.md](docs/README.md) — 文档索引

</details>

## License

MIT
