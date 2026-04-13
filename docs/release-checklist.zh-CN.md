# 发布检查清单

这份清单是给当前维护者使用的最终发布前检查表。

它不是路线图，也不是 release notes。它的目标只有一个：

在真正发一个版本出去之前，快速确认哪些事已经完成，哪些事还不能跳过。

## 当前建议的使用方式

发版前，按下面顺序过一遍：

1. 先过工程验证
2. 再过发布资产
3. 再过文档与 release 页面
4. 如果本次要做正式可信分发，再过签名 / notarization / 自动收尾校验

## A. 工程验证

这些是发版前的最小基线：

- [ ] `npm run lint`
- [ ] `npm test`
- [ ] `npm run build`

这些是当前仓库已经建议保留的扩展验证：

- [ ] `npm run test:e2e`
- [ ] `npm run dist:mac`
  - 预期已自动串起 app notarization、最终 DMG notarization，以及 app 级别 `codesign` / notarization 校验

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
- [ ] 本次版本的 `docs/release-notes-vX.Y.Z.md` 可直接用于 GitHub Release
- [ ] release notes 使用 Markdown 正文，不要把 HTML 片段直接暴露给应用内更新面板
- [ ] release notes 中的下载文件名与实际版本号一致

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

## E. macOS 当前测试分发

如果本次仍然还是签名前的测试分发，只需要确认：

- [ ] `npm run dist:mac` 产物已生成
- [ ] `release/` 中 `.zip` / `.dmg` 可正常产出
- [ ] `release/` 中包含 `.zip.blockmap` / `.dmg.blockmap`
- [ ] `release/` 中包含 `latest-mac.yml`
- [ ] GitHub Release assets 中包含 `.zip` / `.dmg` / blockmap / `latest-mac.yml`
- [ ] 从上一稳定版客户端执行应用内更新检查，能发现本次版本
- [ ] 主界面更新按钮会在发现更新、下载中、已下载或失败时出现，无更新时不常驻
- [ ] 设置页已完成实机视觉检查：接入、显示、用量、维护、支持都没有明显过满或过空
- [ ] macOS 菜单栏 tray icon 尺寸正常，暗色 / 亮色模式下清晰可见
- [ ] 本次明确使用了 `CODEPAL_SKIP_RELEASE_FINISH=1`，或你接受本次不走正式收尾校验
- [ ] 你知道本次仍然处于签名前测试分发状态
- [ ] README / release notes 没有错误地把它写成“已签名 / 已公证”

## F. macOS 正式可信分发

只有当你准备把“签名前测试分发”正式升级成可信正式分发时，才需要完整检查这一节。

- [ ] `Developer ID Application` 证书已可见
  - 验证命令：`security find-identity -v -p codesigning`
- [ ] `npm run dist:mac` 产物不再回退到 ad-hoc，并且自动收尾脚本没有报错
- [ ] `codesign --display --verbose=4` 确认签名身份正确
- [ ] notarization 已提交并通过
- [ ] 最终 `.dmg` 已 `notarytool submit --wait` 并返回 `Accepted`
- [ ] `codesign --verify` 与 app 级别 notarization 校验通过
- [ ] README / release notes / current-status 已去掉签名前测试分发表述

如果这一节有任意一项没完成，就不要把它叫“完整 1.0.0 正式签名版”。

## G. 发布后回收

发版结束后，建议顺手完成：

- [ ] 更新 release notes 中真正发出的版本描述
- [ ] 更新 `docs/context/current-status.md` 的验证状态
- [ ] 如果本次修掉了已知 gap，同步修改对应文档
- [ ] 把本次不做的内容明确留在 roadmap，而不是散落在聊天记录里

## 当前最重要的现实判断

在今天这个项目状态下：

- 工程验证、README、Release 文案、CI / E2E 入口，已经基本收齐
- 正式发布主要取决于 Apple notarization 队列是否及时返回 `Accepted`

所以如果你正在判断“下一个最值得投入的发布工作是什么”，答案仍然是：

1. 保持 `Developer ID Application` 和 notary 凭据可用
2. 跑通 `npm run dist:mac`
3. 等 notarization 返回 `Accepted`
4. 再把分发表述升级成正式签名版
