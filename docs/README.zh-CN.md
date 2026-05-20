# 文档索引

这个目录按用途阅读，不建议一次性全翻。

## 当前基线

- `docs/context/current-status.md`
  当前已交付行为、验证状态、已知缺口和下一步 handoff。
- `docs/architecture/design-overview.md`
  产品定位、架构分层、已交付能力边界，以及下一阶段设计方向。

## 规划

- `docs/planning/roadmap-next.md`
  v1.1.11 基线之后的英文路线图。
- `docs/planning/roadmap-next.zh-CN.md`
  同一份路线图的中文版本。
- `docs/planning/research/deep-research-report.md`
  下一阶段方向的研究来源：本地 AI coding operations memory、workflow health、个人优先付费价值，以及团队扩展边界。

## 发版

- `docs/release/notes/`
  GitHub Release 和应用内更新面板使用的 release notes。新版本按 `release-notes-vX.Y.Z.md` 放这里；release workflow 读取这个目录。
- `docs/release/release-checklist.zh-CN.md`
  正式发布前给维护者使用的操作检查清单。
- `docs/release/macos-signing-runbook.zh-CN.md`
  macOS 签名、公证、DMG 校验和 updater metadata 操作手册。
- `docs/release/macos-developer-id-setup.zh-CN.md`
  Developer ID 证书准备说明。
- `docs/release/release-assets.md`
  README 和 GitHub Release 截图 / 媒体资产清单。
- `docs/release/release-assets.zh-CN.md`
  同一份资产清单的中文版本。

## 支持

- `docs/support/privacy-and-data.md`
- `docs/support/privacy-and-data.zh-CN.md`
- `docs/support/support-scope.md`
- `docs/support/support-scope.zh-CN.md`
- `docs/support/troubleshooting.md`
- `docs/support/troubleshooting.zh-CN.md`

这些是面向发布用户的文档。只要改动 telemetry、cloud sync、team sharing、outbound control 或数据保留策略，就要先同步这里。

## 上下文与归档

- `docs/context/handoffs/`
  历史 handoff 和局部实现上下文。只有 `current-status.md` 指过去，或要继续某个旧线程时再读。
- `docs/archive/`
  不再作为主入口的历史审计和 readiness 清单。
- `docs/superpowers/specs/` 与 `docs/superpowers/plans/`
  早期实现过程留下的工作产物。可用于追溯意图，但不是当前产品契约。

## 资源

- `docs/assets/icon.png`
  README 使用的应用图标。
- `docs/assets/hero-main.png`
  README 和发版材料优先使用的主 dashboard 截图。
- `design/codepal-icon-redesign/`
  新版应用图标和 macOS 菜单栏图标的源稿、预览和导出说明。

避免继续往 `docs/` 顶层新增普通文档。稳定入口才放顶层，其余优先进入 `architecture/`、`planning/`、`release/`、`support/`、`context/` 或 `archive/`。
