# 发版视觉资产

这份文档定义了当前 CodePal 发版时推荐准备的截图和媒体资产。

目标是让 README 和 GitHub Releases 更像产品页面，而不是内部工程说明。

## 优先顺序

1. `docs/hero-main.png`
2. `docs/settings-focus.png`（可选）
3. `docs/codepal-demo.gif`（可选）

不要一开始就做 GIF。先把 dashboard 主图收干净。

## 1. 主图

目标文件：`docs/hero-main.png`

用途：

- README 顶部主截图
- GitHub Release 页首张截图

建议展示：

- 顶部 usage strip
- 只保留 2 到 4 条 session
- 至少有一条明显的 `running` 或 `waiting` session
- 留出足够活动细节，让人一眼看出这是监控产品

建议避免：

- 很长的历史 session 列表
- 大量重复的 idle / completed 行
- 明显噪音或低价值文本
- 敏感本地内容

建议截图方式：

- 用真实感足够但经过整理的数据
- 裁出主面板上半部分最能体现产品价值的区域
- 保持一定宽度，保留悬浮面板的整体感觉
- 尽量使用干净的深色背景，避免桌面杂乱元素干扰

## 2. 设置页聚焦图

目标文件：`docs/settings-focus.png`

用途：

- README 可选的第二张截图
- GitHub Release 页可选辅助截图

优先级：

- 明显低于 dashboard 主图
- 只有在它确实能帮助解释诊断、接入或登录态修复时才值得加

建议展示：

- integration diagnostics
- usage settings
- Cursor / CodeBuddy 登录态刷新或删除操作入口

建议避免：

- 大片没有信息价值的空区域
- 折叠以下太多低优先级细节
- 敏感账号信息

建议截图方式：

- 比完整设置页窗口裁得更紧
- 视觉中心放在最有价值的操作区
- 保证标签在 GitHub 页面里无需放大也能看清

## 3. 演示 GIF

目标文件：`docs/codepal-demo.gif`

状态：

- 当前版本可选

用途：

- 只有在两张静态图还不足以表达产品时再加

建议流程：

1. 打开 CodePal
2. 展示主面板中的活跃 session
3. 展开一个 session
4. 打开 Settings
5. 刷新或删除一个受支持的登录态

约束：

- 控制在 10 到 15 秒左右
- 不要录成长篇全功能 walkthrough
- 不要有太碎的鼠标移动或过于忙乱的画面
- 以“快速理解产品”为目标，而不是完整覆盖所有功能

## 截图原则

- 优先选择稳定样例数据，而不是杂乱的真实现场。
- 用户相关信息要模糊或替换。
- 在 GitHub README 的显示尺寸下仍要可读。
- 不要让用户必须先解读一张复杂表格，才能理解产品。
- 如果“更完整”和“更清晰”冲突，优先“更清晰”。

## README 中的摆放顺序

建议顺序：

1. `hero-main.png`
2. `settings-focus.png`，但前提是它确实有补充价值

如果后面做了 GIF，建议放在静态图后面，或者只放在 Release 页里。

## 当前判断

当前已有文件：

- `docs/index.png`
- `docs/setting.png`

它们可以作为参考，但现在还更像工程截图，而不是打磨过的发版资产。

当前主要缺口不是分辨率，而是聚焦程度，尤其是要让 dashboard 明确成为视觉主角。
