# 发布检查清单

这份清单是给当前维护者使用的最终发布前检查表。

它不是路线图，也不是 release notes。它的目标只有一个：

在真正发一个版本出去之前，快速确认哪些事已经完成，哪些事还不能跳过。

## 当前建议的使用方式

发版前，按下面顺序过一遍：

1. 先过工程验证
2. 再过发布资产
3. 再过文档与 release 页面
4. 如果本次要做正式可信分发，再过签名 / notarization

## A. 工程验证

这些是发版前的最小基线：

- [ ] `npm run lint`
- [ ] `npm test`
- [ ] `npm run build`

这些是当前仓库已经建议保留的扩展验证：

- [ ] `npm run test:e2e`
- [ ] `npm run dist:mac`

如果是通过 GitHub 流程发版，还应确认：

- [ ] GitHub Actions `CI` workflow 最近一次为绿色
- [ ] GitHub Actions `E2E` workflow 最近一次为绿色，或你明确接受本次跳过的理由

## B. 发布资产

当前最重要的发布资产不是设置页，而是 dashboard 主图。

建议至少确认：

- [ ] `docs/hero-main.png` 已更新为当前推荐截图
- [ ] README 中主图已指向 `docs/hero-main.png`
- [ ] 截图没有敏感账号信息、路径或不该暴露的内容

可选项：

- [ ] `docs/settings-focus.png` 已准备好，并且它确实提供额外价值
- [ ] `docs/codepal-demo.gif` 已准备好，并且时长控制在 10 到 15 秒

## C. README 与 Release 页面

发版前至少确认：

- [ ] `README.md` 已对齐当前产品状态
- [ ] `README.zh-CN.md` 已对齐当前产品状态
- [ ] `docs/release-notes-v0.1.0.md` 可直接用于 GitHub Release
- [ ] `docs/release-notes-v0.1.0.zh-CN.md` 可直接用于中文说明

特别注意：

- [ ] 不要把还没做完的 roadmap 内容写成已交付能力
- [ ] 不要保留已经过时的“当前限制”描述

## D. 当前版本边界确认

发版前要确认你自己接受这些边界仍然存在：

- [ ] CodePal 仍然是 monitoring-first，不是完整控制台
- [ ] Claude quota 仍然不是 authoritative live source，而是 token-first + last-known snapshot
- [ ] Cursor / CodeBuddy payload 校准仍在继续扩展
- [ ] Windows 还不在当前交付范围内

如果这些边界发生变化，先改文档，再发版。

## E. macOS 内测分发

如果本次仍然是当前的内部测试发布，只需要确认：

- [ ] `npm run dist:mac` 产物已生成
- [ ] `release/` 中 `.zip` / `.dmg` 可正常产出
- [ ] 你知道本次仍然是 `unsigned / ad-hoc`
- [ ] README / release notes 没有错误地把它写成“已签名 / 已公证”

## F. macOS 正式可信分发

只有当你准备把“unsigned / ad-hoc”正式拿掉时，才需要完整检查这一节。

- [ ] `Developer ID Application` 证书已可见
  - 验证命令：`security find-identity -v -p codesigning`
- [ ] `npm run dist:mac` 产物不再回退到 ad-hoc
- [ ] `codesign --display --verbose=4` 确认签名身份正确
- [ ] notarization 已提交并通过
- [ ] 最终产物已 `staple`
- [ ] `spctl` / `codesign --verify` 本机验证通过
- [ ] README / release notes / current-status 已去掉 `unsigned / ad-hoc` 表述

如果这一节有任意一项没完成，就不要把它叫“正式签名版”。

## G. 发布后回收

发版结束后，建议顺手完成：

- [ ] 更新 release notes 中真正发出的版本描述
- [ ] 更新 `docs/context/current-status.md` 的验证状态
- [ ] 如果本次修掉了已知 gap，同步修改对应文档
- [ ] 把本次不做的内容明确留在 roadmap，而不是散落在聊天记录里

## 当前最重要的现实判断

在今天这个项目状态下：

- 工程验证、README、Release 文案、CI / E2E 入口，已经基本收齐
- 最大剩余阻塞仍然是 `Developer ID + notarization`

所以如果你正在判断“下一个最值得投入的发布工作是什么”，答案仍然是：

1. 拿到 `Developer ID Application`
2. 跑通签名
3. 跑通 notarization
4. 再把分发表述从 `unsigned / ad-hoc` 升级
