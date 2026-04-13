# 文档索引

这个目录里的文档，建议按“你现在要解决什么问题”来读，而不是一次性全看。

## 如果你要看当前项目基线

- `docs/context/current-status.md`
  当前已经实现的行为、验证状态、已知缺口，以及实现基线。

## 如果你要看发版材料

- `docs/release-notes-v1.0.3.md`
  当前 1.0.3 版本的英文 release notes。
- `docs/release-notes-v1.0.3.zh-CN.md`
  当前 1.0.3 版本的中文 release notes。
- `docs/release-notes-v1.0.4.md`
  v1.0.4 patch candidate 的英文 release notes 草稿。
- `docs/release-notes-v1.0.4.zh-CN.md`
  v1.0.4 patch candidate 的中文 release notes 草稿。
- `docs/release-notes-v1.0.5.md`
  当前 patch 级 v1.0.5 candidate 的英文 release notes 草稿。
- `docs/release-notes-v1.0.5.zh-CN.md`
  当前 patch 级 v1.0.5 candidate 的中文 release notes 草稿。
- `docs/release-assets.md`
  README 和 GitHub Release 所需截图 / 媒体资产的英文清单。
- `docs/release-assets.zh-CN.md`
  同一份视觉资产清单的中文版本。
- `docs/macos-signing-runbook.zh-CN.md`
  给当前维护者执行 macOS 签名、notarization、DMG `staple + validate` 的中文操作清单。
- `docs/release-checklist.zh-CN.md`
  最终发版前使用的中文检查清单。
- `docs/operational-readiness-v1.0.0.zh-CN.md`
  原始 v1.0.0 readiness 阶段留下的历史检查清单。
- `docs/privacy-and-data.md`
  当前 monitoring-first 发布基线的英文隐私与数据边界说明。
- `docs/privacy-and-data.zh-CN.md`
  同一份隐私与数据边界说明的中文版本。
- `docs/support-scope.md`
  当前正式运营 v1 基线的英文支持范围说明。
- `docs/support-scope.zh-CN.md`
  当前支持范围说明的中文版本。
- `docs/troubleshooting.md`
  面向 release 用户的英文排查与诊断来源说明。
- `docs/troubleshooting.zh-CN.md`
  同一份排查文档的中文版本。

建议你按这个顺序使用：

1. 先看 `release-checklist.zh-CN.md`
2. 再看当前目标版本对应的 release notes；本轮 patch 测试优先看 `release-notes-v1.0.5.zh-CN.md`
3. 如果卡在签名、公证或 DMG 收尾校验，再看 `macos-signing-runbook.zh-CN.md`

## 如果你要看未来规划

- `docs/roadmap-next.md`
  当前 V1 发布基线之后的英文规划文档。
- `docs/roadmap-next.zh-CN.md`
  同一份规划的中文版本。

如果你只是判断“下一步该投什么”，优先看 `roadmap-next.zh-CN.md`，不要回头翻历史 handoff。

## 如果你要看上下文备注

- `docs/context/*.md`
  某些具体工作阶段留下的短期 handoff、blocker 和实现上下文。

适合在这些情况下再看：

- `current-status.md` 里明确提到了某个文件名
- 你在继续一个没有完全做完的线程
- 你需要追溯某个局部决策为什么这么做

除非 `current-status.md` 明确指过去，否则不要把这些文件当成主要产品契约。

## Superpowers 工作文档

- `docs/superpowers/specs/`
  早期设计阶段留下的 spec
- `docs/superpowers/plans/`
  从这些 spec 拆出来的执行计划

这些更像本地工作痕迹，不是当前仓库对外的正式基线。

## 视觉资源

- `docs/icon.png`
  README 使用的应用图标
- `design/codepal-icon-redesign/`
  新版 CodePal 应用图标和 macOS 菜单栏图标的源稿、预览和导出说明
- `docs/hero-main.png`
  README 和 Release 材料优先使用的主 dashboard 截图
- `docs/index.png`
  较早的主面板参考截图
- `docs/setting.png`
  设置页参考截图

如果后面继续往 `docs/` 里放图片，尽量保持命名清晰，避免混进临时草稿文件。
