## CodePal v1.1.8

这是替换 v1.1.7 的热修版本。v1.1.7 的 macOS app bundle 在更新后可能无法通过 Gatekeeper 签名校验，导致应用打不开。

### 重点变化

- **修复更新后无法打开**：发布流程不再用会破坏 Electron app 签名资源的方式 staple `.app` bundle。
- **更安全的公证流程**：zip 和 dmg 都会提交 Apple notarization，只对 dmg 做 staple。
- **发布校验更强**：release hook 会在 notarization/staple 后再次执行 `codesign --verify`，并在 dmg 变化后刷新 updater metadata。
- **分析历史回填不阻塞启动**：Claude / Codex 历史导入改为窗口就绪后再后台启动，并在 JSONL 批次之间让出事件循环，避免大历史库拖住应用打开。
- **包含 v1.1.7 的分析改进**：Claude / Codex 历史用量补齐、可读 Top Sessions、更长分析保留策略，以及更清楚的 Analytics 摘要卡片。

### 验证

- 本地完整验证已完成
- 已新增 Analytics E2E 覆盖持久化 token usage 的真实渲染
- 已产出签名并公证的 macOS 包
