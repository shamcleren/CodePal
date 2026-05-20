## CodePal v1.0.5 Candidate

这是 v1.0.4 之后的 patch 级跟进版本。范围只覆盖 icon polish 和本地测试构建体验。

### 修复

- 重新设计 app icon，改成更简洁的深色底、绿色 `C` 标记和蓝色伙伴点，让它在 macOS 小尺寸下更清楚。
- 放大并简化 macOS 菜单栏 template 图标的 mask，让状态栏图标和旁边图标更接近。
- tray template 现在导出为 38x38 @2x PNG，打包后的菜单栏 glyph 大约按 19pt 渲染。

### 变更

- 新增 `npm run dist:mac:dir`，用于快速生成 `release/mac-arm64/CodePal.app`，不打 dmg / zip，也不走签名和 notarization。
- macOS 打包配置改为直接使用源 PNG icon，让 electron-builder 在本地和正式构建时都能稳定生成 app bundle 的 `.icns`。

### 验证

- `npm test -- src/main/tray/createTray.test.ts src/main/tray/iconAssets.test.ts`
- `npm run test:e2e`
- `npm run lint`
- `npm run dist:mac:dir`
- `git diff --check`

### 发版备注

- `package.json` 当前已经是 `1.0.5`。
- 本文档先作为最终本地测试期间的 v1.0.5 release notes 草稿。
