# macOS 签名与 Notarization 操作清单

这份文档是给当前维护者自己执行的 runbook，不是对外发布说明。

目标是把 CodePal 从当前的 `unsigned / ad-hoc` 内测构建，推进到：

- 已签名
- 已 notarize
- 已 staple
- 可以作为后续内置更新和正式分发的基础

## 当前现状

当前仓库已经具备这些基础：

- `npm run build` 可通过
- `npm run dist:mac` 可生成 macOS `.zip` / `.dmg`
- 产物落在 `release/`

当前仍缺少的关键能力：

- Apple Developer 签名证书接入
- notarization 流程接入
- 产物验证与发布前检查

当前仓库已经有了第一版 mac 签名骨架：

- `electron-builder.yml` 已补 `hardenedRuntime`
- 已有 `build/entitlements.mac.plist`
- 已有 `build/entitlements.mac.inherit.plist`

这意味着证书就位后，可以先直接尝试签名构建，不需要再从零搭配置入口。

## 目标完成定义

当你完成这轮工作时，至少应该满足：

1. `CodePal.app` 不是 ad-hoc 签名
2. `.dmg` 或 `.zip` 对应的 app 已通过 notarization
3. 最终产物已执行 `staple`
4. 本机可通过 `spctl` / `codesign` 基本校验
5. README / release notes 不再需要强调“unsigned / ad-hoc”

## 建议落地顺序

不要一上来就试图“一步发布成功”。按这个顺序做：

1. 先准备 Apple 证书和开发者账号材料
2. 先让本地签名成功
3. 再接 notarization
4. 再补 staple 和验证
5. 最后再调整 release 流程和文档

## 你需要准备的东西

### Apple 侧资源

你至少需要：

- 一个有效的 Apple Developer Program 账号
- 对应团队的 `Team ID`
- 一个 `Developer ID Application` 证书
- 一个可用于 notarization 的 Apple ID + app-specific password

如果你后面想走更稳定的 CI/CD，建议进一步准备：

- 专门用于发布的 Apple ID / 发布账号
- 独立的 Keychain 或至少干净的本地证书管理方式

### 本地工具

确认本机已经有：

- Xcode Command Line Tools
- `codesign`
- `xcrun`
- `notarytool`
- `spctl`

常用检查命令：

```bash
xcode-select -p
xcrun notarytool --help
codesign --version
spctl --help
```

## 第一阶段：先把签名打通

这一阶段的目标只有一个：

让 `electron-builder` 产出的 `CodePal.app` 使用 `Developer ID Application` 证书完成签名。

### 第 1 步：导入证书

把你的 `Developer ID Application` 证书导入登录 Keychain。

导入后先确认系统能看到：

```bash
security find-identity -v -p codesigning
```

你应该能看到类似：

```text
Developer ID Application: Your Name Or Org (TEAMID)
```

如果这里没有，先不要继续动仓库配置。

### 第 2 步：确认 electron-builder 的 mac 配置入口

当前仓库使用的是：

- `electron-builder.yml`

推荐最小关注项：

- `appId`
- `mac.category`
- `mac.target`
- `mac.hardenedRuntime`
- `mac.entitlements`
- `mac.entitlementsInherit`
- `mac.identity` 或由证书自动识别

这一阶段先不要急着做复杂 target，先保证一个最小可签名构建链路跑通。

### 第 3 步：补 entitlements 文件

通常你需要至少两个文件：

- `build/entitlements.mac.plist`
- `build/entitlements.mac.inherit.plist`

目标不是一次性把权限开满，而是给 Electron 正常运行所需的最小权限。

注意：

- 不要无脑复制别的项目的 entitlements
- 过宽权限会增加 notarization 和后续安全判断复杂度

### 第 4 步：先跑签名版本地构建

目标命令仍然是：

```bash
npm run dist:mac
```

但这一次你要确认产物不再是 ad-hoc。

完成后先检查 app：

```bash
codesign --display --verbose=4 "release/mac/CodePal.app"
```

如果输出里仍然是 ad-hoc，说明签名配置还没真正生效。

## 第二阶段：接 notarization

只有本地签名已经稳定后，才进入这一阶段。

### 第 5 步：准备 notarization 凭据

推荐先用 `notarytool store-credentials` 存进本机 Keychain。

示例：

```bash
xcrun notarytool store-credentials "codepal-notary" \
  --apple-id "your-apple-id@example.com" \
  --team-id "YOUR_TEAM_ID" \
  --password "app-specific-password"
```

成功后，后续提交可以直接引用这个 profile。

### 第 6 步：让构建后自动 notarize，或先手动 notarize

更稳的起步方式是先手动 notarize，一旦跑通再自动化。

先找到构建出来的 `.dmg` 或 `.zip`，然后手动提交：

```bash
xcrun notarytool submit "release/CodePal-0.1.0.dmg" \
  --keychain-profile "codepal-notary" \
  --wait
```

如果你更偏向 `.zip`，也可以对 `.zip` 提交。

这一步的目标不是优雅，而是先确认：

- 凭据可用
- 产物格式可提交
- Apple 接受当前签名内容

### 第 7 步：处理 notarization 失败

如果失败，不要立刻回头乱改很多配置。先看日志：

```bash
xcrun notarytool log <submission-id> --keychain-profile "codepal-notary"
```

优先看这些问题：

- 签名链不完整
- hardened runtime / entitlements 不匹配
- 某个二进制或嵌套 framework 未签名
- Electron 相关 helper 未被正确处理

这一阶段最容易浪费时间的方式，就是“不看日志直接猜”。

## 第三阶段：staple 和本地验证

当 notarization 已通过，再做本地收尾。

### 第 8 步：staple

对最终产物执行：

```bash
xcrun stapler staple "release/CodePal-0.1.0.dmg"
```

如果你最终发布的是 `.app` 或其他载体，也按实际产物执行对应 staple。

### 第 9 步：验证签名和 Gatekeeper

至少做这几项：

```bash
codesign --verify --deep --strict --verbose=2 "release/mac/CodePal.app"
spctl --assess --type execute --verbose=4 "release/mac/CodePal.app"
```

如果你最终是从 `.dmg` 安装后再验证，最好也验证安装后的 `Applications/CodePal.app`。

## 第四阶段：收口到仓库流程

当你已经手工跑通一次完整链路，再回到仓库做流程收口。

建议收的内容：

- 把 electron-builder 的 mac 配置正式固化
- 决定签名相关环境变量如何管理
- 决定 notarization 是本机跑还是未来接 CI
- 更新 `dist:mac` 或新增正式 release 命令
- 更新 README / release notes / current-status 里的“unsigned / ad-hoc”表述

## 推荐环境变量与本地约定

如果你后面要把流程变成更稳定的本地命令，建议统一这些输入：

- `APPLE_ID`
- `APPLE_APP_SPECIFIC_PASSWORD`
- `APPLE_TEAM_ID`
- `CSC_NAME`

如果未来改成 CI，再把这些映射成 CI secrets。

但在你第一次跑通之前，不要过早花时间做很重的 secret 管理抽象。

## 常见卡点

### 1. `security find-identity` 找不到证书

通常是：

- 证书没导入成功
- 导入到错误的 Keychain
- 当前终端环境拿不到对应 Keychain

先解决证书可见性，再看别的问题。

### 2. `codesign` 看起来成功，但其实还是 ad-hoc

通常是：

- electron-builder 没拿到正确 identity
- mac 配置没有真正生效
- helper / nested binary 没有走完整签名链

一定要用 `codesign --display --verbose=4` 去确认结果，而不是只看构建过程有没有报错。

### 3. notarization 被拒

先看 `notarytool log`，不要猜。

最常见还是：

- 签名不完整
- hardened runtime / entitlements 有问题
- 某个嵌套二进制没签好

### 4. 本机能打开，但分发出去仍有安全拦截

说明“能运行”不等于“分发链路正确”。

要检查：

- 是否真的 notarize 通过
- 是否做了 staple
- 分发出去的到底是不是经过 notarize 的那个最终产物

## 你现在最应该先做什么

如果按最小行动来排，下一步就是：

1. 导入并确认 `Developer ID Application` 证书
2. 在仓库里补 electron-builder 的 mac 签名配置
3. 加 entitlements 文件
4. 跑一次“已签名但未 notarize”的 `npm run dist:mac`
5. 用 `codesign --display --verbose=4` 确认不是 ad-hoc

只有这 5 步跑通以后，才进入 notarization。

## 后续文档同步点

当签名 / notarization 打通后，记得回头更新这些文件：

- `README.md`
- `README.zh-CN.md`
- `docs/release-notes-v0.1.0.md`
- `docs/release-notes-v0.1.0.zh-CN.md`
- `docs/context/current-status.md`

届时要把“unsigned / ad-hoc”相关表述改掉，避免文档落后于实际发布状态。
