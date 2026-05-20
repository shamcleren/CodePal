## CodePal v1.0.3

### 改进

- 主面板增加只在可操作更新状态下出现的更新状态按钮。
- 设置页导航改为更短的分区标签和摘要，降低扫读成本。
- 设置页卡片改为更紧凑的状态优先布局，低频诊断信息收进详情区。
- 维护与支持页面调整后，更新状态和支持操作更容易找到。
- CodePal 自有的应用图标、README 图、macOS 打包图标和菜单栏图标统一为居中的监控面板标记。

### 修复

- 移除 macOS 菜单栏图标的强制缩小逻辑，改用无背景 template glyph。
- 增加图标资源自动检查，覆盖 bundled app、tray、docs 和 renderer 图标。

### 发布验证

- Release notes 保持为纯 Markdown，便于应用内更新面板直接展示。
- 发布流程继续校验 macOS updater metadata 和分发产物。
- 使用 v1.0.2 客户端验证应用内更新能发现并升级到 v1.0.3。

### 下载

- `CodePal-1.0.3-arm64.dmg`
- `CodePal-1.0.3-arm64.zip`
